import path from "node:path";
import {
  FileHandle,
  LMStudioClient,
} from "@lmstudio/sdk";
import type { RagDocument } from "../../core/src/contracts";
import { lexicalRetrieveFromDocuments } from "../../core/src/localRetrieval";
import { buildRagEvidenceBlocks } from "../../core/src/retrievalPipeline";
import type {
  RagLoadedCorpus,
  RagMcpRuntime,
} from "../../core/src/runtimeContracts";
import {
  toRagCandidates,
  toRetrievalResultEntries,
} from "../../lmstudio-shared/src/lmstudioCoreBridge";
import {
  resolveAutoDetectedEmbeddingModel,
  resolveRerankLlmModel,
} from "../../lmstudio-shared/src/modelResolution";
import { performModelAssistedRerank } from "../../lmstudio-shared/src/modelRerank";
import type { RankedRetrievalEntry } from "../../lmstudio-shared/src/rerankTypes";
import {
  browseFileSystem,
  discoverSupportedTextFiles,
  fileInfo,
  readTextFileRange,
  resolveUserPath,
} from "./pathResolution";
import { createFilesystemLargeCorpusAnalysisStore } from "./largeCorpusAnalysisStore";
import { createFilesystemHierarchicalIndexStore } from "./hierarchicalIndexStore";

function estimateTokens(value: string) {
  return Math.ceil(value.trim().length / 4);
}

export async function createLmStudioMcpRuntime(): Promise<RagMcpRuntime> {
  const client = new LMStudioClient();
  const rerankModelCache = new Map();
  const largeCorpusAnalysisStore = createFilesystemLargeCorpusAnalysisStore();
  const hierarchicalIndexStore = createFilesystemHierarchicalIndexStore();

  const loadCorpus = async (input: {
    documents?: Array<{ id: string; name: string; content: string; metadata?: Record<string, unknown> }>;
    paths?: Array<string>;
    chunks?: Array<{ sourceId: string; sourceName: string; content: string; score: number; metadata?: Record<string, unknown> }>;
  }): Promise<RagLoadedCorpus> => {
    const inlineDocuments = (input.documents ?? []).map((document) => ({
      id: document.id,
      name: document.name,
      content: document.content,
      metadata: {
        ...document.metadata,
        sourceType: "inline-document",
      },
    }));
    const preparedPathDocuments = await loadLmStudioPathDocuments(client, input.paths ?? []);
    const documents = [...inlineDocuments, ...preparedPathDocuments.documents];
    const candidates = (input.chunks ?? []).map((chunk) => ({
      sourceId: chunk.sourceId,
      sourceName: chunk.sourceName,
      content: chunk.content,
      score: chunk.score,
      metadata: {
        ...chunk.metadata,
        sourceType: "prechunked-candidate",
      },
    }));
    const estimatedTokens = documents.reduce(
      (sum, document) => sum + estimateTokens(document.content),
      0
    );

    return {
      documents,
      candidates: candidates.length > 0 ? candidates : undefined,
      fileCount: documents.length,
      estimatedTokens,
      chunkCount: candidates.length > 0 ? candidates.length : undefined,
    };
  };

  return {
    loader: {
      async load(input) {
        return loadCorpus(input);
      },
    },
    documentParser: {
      async parse(input) {
        return loadCorpus(input);
      },
    },
    embeddingModelResolver: {
      async resolve() {
        const embeddingModel = await resolveEmbeddingModel(client);
        return {
          modelId: embeddingModel?.identifier,
          source: embeddingModel ? "auto-detected" : "unavailable",
          autoUnload: true,
        };
      },
    },
    rerankModelResolver: {
      async resolve({ options }) {
        const rerankEnabled = options?.rerank?.enabled ?? true;
        const rerankStrategy = options?.rerank?.strategy ?? "heuristic-v1";
        if (!rerankEnabled || rerankStrategy !== "heuristic-then-llm") {
          return {
            modelId: undefined,
            source: "unavailable" as const,
            autoUnload: false,
          };
        }

        const resolution = await resolveRerankLlmModel({
          client,
          modelSource: options?.rerank?.modelSource,
          modelId: options?.rerank?.modelId,
          cache: rerankModelCache,
        });
        return {
          modelId: resolution.modelId,
          source: resolution.source,
          autoUnload: false,
        };
      },
    },
    retriever: {
      async search({ query, corpus, options }) {
        if (corpus.candidates && corpus.candidates.length > 0) {
          return corpus.candidates.slice(0, options?.maxEvidenceBlocks ?? 8);
        }

        return lexicalRetrieveFromDocuments(
          query,
          corpus.documents,
          options?.maxEvidenceBlocks ?? 8
        );
      },
    },
    semanticRetriever: {
      async search({ query, rewrites, corpus, retrieval }) {
        const fileHandles = extractFileHandles(corpus);
        if (fileHandles.length === 0) {
          return lexicalRetrieveFromDocuments(
            query,
            corpus.documents,
            retrieval?.maxCandidates ?? retrieval?.maxEvidenceBlocks ?? 8
          );
        }

        const embeddingModel = await resolveEmbeddingModel(client);
        const retrievalRuns = await Promise.all(
          (rewrites && rewrites.length > 0 ? rewrites : [{ label: "original", text: query }]).map(
            async (rewrite) =>
              client.files.retrieve(rewrite.text, fileHandles, {
                embeddingModel,
                limit: retrieval?.maxCandidates ?? retrieval?.maxEvidenceBlocks ?? 8,
              })
          )
        );

        return toRagCandidates(retrievalRuns.flatMap((run) => run.entries));
      },
    },
    llmReranker: {
      async rerank({ query, candidates, options }) {
        const topK = options?.rerank?.topK ?? 5;
        try {
          const rerankResolution = await resolveRerankLlmModel({
            client,
            modelSource: options?.rerank?.modelSource,
            modelId: options?.rerank?.modelId,
            cache: rerankModelCache,
          });
          const heuristicEntries: Array<RankedRetrievalEntry> = toRetrievalResultEntries(candidates)
            .slice(0, topK)
            .map((entry) => ({
              entry,
              originalScore: entry.score,
              rerankScore: entry.score,
              features: {
                lexicalOverlap: 0,
                headingMatch: 0,
                completeness: 0,
                sectionRelevance: 0,
                diversityPenalty: 0,
              },
            }));
          const result = await performModelAssistedRerank(
            rerankResolution.model,
            query,
            heuristicEntries,
            topK,
            new AbortController().signal
          );

          return {
            candidates: toRagCandidates(
              result.rerankedEntries.map((entry) => ({
                ...entry.entry,
                score: entry.rerankScore,
              }))
            ),
            notes: [
              `Model-assisted rerank used ${rerankResolution.modelId ?? "active chat model"} (${rerankResolution.source}) and parsed ${result.parsedScores.length} scores from LM Studio response.`,
            ],
          };
        } catch (error) {
          return {
            candidates,
            notes: [
              `Model-assisted rerank unavailable; using heuristic order. ${error instanceof Error ? error.message : String(error)}`,
            ],
          };
        }
      },
    },
    contextSizer: {
      async measure({ corpus, options }) {
        const estimatedTokens = corpus.estimatedTokens ?? 0;
        const fullContextLimit = options?.routing?.fullContextTokenLimit ?? 4000;
        return {
          estimatedTokens,
          fullContextViable: estimatedTokens > 0 && estimatedTokens <= fullContextLimit,
          recommendedRoute:
            estimatedTokens > 0 && estimatedTokens <= fullContextLimit
              ? "full-context"
              : "retrieval",
        };
      },
    },
    citationEmitter: {
      async emit({ candidates }) {
        return buildRagEvidenceBlocks(candidates);
      },
    },
    largeCorpusAnalysisStore,
    hierarchicalIndexStore,
    answerComposer: {
      async answer({ query, evidence, route, groundingMode }) {
        if (evidence.length === 0) {
          return {
            answer: `Grounded ${route} answer unavailable for: ${query}`,
            confidence: 0.2,
            unsupportedClaimWarnings: ["No evidence was available in the LM Studio-backed runtime."],
          };
        }

        const top = evidence[0]!;
        return {
          answer: [
            `Grounded ${route} answer for: ${query}`,
            `Grounding mode: ${groundingMode ?? "warn-on-weak-evidence"}.`,
            `Top evidence came from ${top.fileName} with score ${top.score.toFixed(3)}.`,
            `Evidence excerpt: ${top.content}`,
          ].join(" "),
          confidence: Math.min(0.9, 0.45 + evidence.length * 0.1),
          unsupportedClaimWarnings: [],
        };
      },
    },
    inspector: {
      async inspect({ corpus }) {
        return {
          fileCount: corpus.fileCount,
          chunkCount: corpus.chunkCount,
          estimatedTokens: corpus.estimatedTokens,
          recommendedRoute:
            corpus.analysis?.recommendedRoute ??
            ((corpus.estimatedTokens ?? 0) <= 4000 ? "full-context" : "retrieval"),
          fullContextViable: (corpus.estimatedTokens ?? 0) <= 4000,
          retrievalRecommended:
            (corpus.chunkCount ?? 0) > 0 || (corpus.estimatedTokens ?? 0) > 4000,
          questionScope: corpus.analysis?.questionScope,
          targetType: corpus.analysis?.targetType,
          modality: corpus.analysis?.modality,
          analysisNotes: corpus.analysis?.notes,
          directoryManifests: corpus.analysis?.directoryManifests,
          largeFileSynopses: corpus.analysis?.largeFileSynopses,
          oversizedPaths: corpus.analysis?.oversizedPaths,
        };
      },
    },
    browser: {
      async browse(input) {
        return browseFileSystem(input);
      },
      async fileInfo(input) {
        return fileInfo(input);
      },
      async readFile(input) {
        return readTextFileRange(input);
      },
    },
  };
}

async function loadLmStudioPathDocuments(
  client: LMStudioClient,
  paths: Array<string>
): Promise<{ documents: Array<RagDocument>; fileHandles: Array<FileHandle> }> {
  const documents: Array<RagDocument> = [];
  const fileHandles: Array<FileHandle> = [];

  for (const inputPath of paths) {
    const discovery = await discoverSupportedTextFiles(inputPath, {
      maxEntries: 2000,
      includeHidden: false,
      maxDepth: 8,
      ignoreDirectories: true,
    });
    for (const discoveredPath of discovery.paths) {
      const fileHandle = await client.files.prepareFile(discoveredPath);
      const parsed = await client.files.parseDocument(fileHandle);
      documents.push({
        id: fileHandle.identifier,
        name: path.relative(process.cwd(), discoveredPath) || path.basename(discoveredPath),
        content: parsed.content,
        metadata: {
          absolutePath: resolveUserPath(inputPath),
          discoveredPath,
          fileHandle,
          sourceType: "lmstudio-path",
          discoveryTruncated: discovery.truncated,
          discoveryErrors: discovery.errors,
        },
      });
      fileHandles.push(fileHandle);
    }
  }

  return { documents, fileHandles };
}

async function resolveEmbeddingModel(client: LMStudioClient): Promise<any> {
  const resolution = await resolveAutoDetectedEmbeddingModel({
    client,
    autoUnload: true,
  });
  return resolution.model;
}

function extractFileHandles(corpus: RagLoadedCorpus): Array<FileHandle> {
  return corpus.documents
    .map((document) => document.metadata?.fileHandle)
    .filter((handle): handle is FileHandle => handle instanceof FileHandle);
}
