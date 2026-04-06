import type {
  FileHandle,
  LLMDynamicHandle,
  PromptPreprocessorController,
  RetrievalResultEntry,
} from "@lmstudio/sdk";
import type { RagCandidate } from "../../core/src/contracts";
import type {
  RagLoadedCorpus,
  RagOrchestratorRuntime,
} from "../../core/src/runtimeContracts";
import type { RagRequestOptions } from "../../core/src/requestOptions";
import {
  fuseRagCandidates,
  mergeHybridRagCandidates,
  buildRagEvidenceBlocks,
} from "../../core/src/retrievalPipeline";
import { lexicalRetrieve } from "./lexicalRetrieve";
import {
  toRagCandidates,
  toRetrievalResultEntries,
} from "./lmstudioCoreBridge";
import { performModelAssistedRerank } from "./modelRerank";
import type { RankedRetrievalEntry, RerankStrategy } from "./types/rerank";
import { AUTO_DETECT_MODEL_ID } from "./config";
import {
  browseFileSystem,
  fileInfo,
  readTextFileRange,
} from "./filesystem";

function estimateTokens(value: string) {
  return Math.ceil(value.trim().length / 4);
}

export function buildAdapterRequestOptions(pluginConfig: { get(key: string): any }): RagRequestOptions {
  const hybridEnabled = pluginConfig.get("hybridEnabled");

  return {
    policy: {
      groundingMode: pluginConfig.get("strictGroundingMode"),
      answerabilityGateEnabled: pluginConfig.get("answerabilityGateEnabled"),
      answerabilityGateThreshold: pluginConfig.get("answerabilityGateThreshold"),
      ambiguousQueryBehavior:
        pluginConfig.get("ambiguousQueryBehavior") === "attempt-best-effort"
          ? "proceed"
          : "ask-for-clarification",
    },
    routing: {
      requestedRoute: "auto",
      correctiveEnabled: pluginConfig.get("correctiveRetrievalEnabled"),
      correctiveMaxAttempts: pluginConfig.get("correctiveMaxAttempts"),
    },
    retrieval: {
      multiQueryEnabled: pluginConfig.get("multiQueryEnabled"),
      multiQueryCount: pluginConfig.get("multiQueryCount"),
      fusionMethod: pluginConfig.get("fusionMethod"),
      hybridEnabled,
      maxCandidates: pluginConfig.get("maxCandidatesBeforeRerank"),
      maxEvidenceBlocks: pluginConfig.get("maxEvidenceBlocks"),
      minScore: hybridEnabled ? 0 : pluginConfig.get("retrievalAffinityThreshold"),
      dedupeSimilarityThreshold: pluginConfig.get("dedupeSimilarityThreshold"),
    },
    rerank: {
      enabled: pluginConfig.get("rerankEnabled"),
      strategy: pluginConfig.get("rerankStrategy") as RerankStrategy,
      topK: pluginConfig.get("rerankTopK"),
    },
    safety: {
      sanitizeRetrievedText: pluginConfig.get("sanitizeRetrievedText"),
      stripInstructionalSpans: pluginConfig.get("stripInstructionalSpans"),
      requireEvidence: pluginConfig.get("strictGroundingMode") === "require-evidence",
    },
  };
}

export function createLmStudioAdapterRuntime(
  ctl: PromptPreprocessorController,
  files: Array<FileHandle>,
  pluginConfig: { get(key: string): any }
): {
  runtime: RagOrchestratorRuntime;
  cleanup: () => Promise<void>;
} {
  let embeddingModelPromise: Promise<any> | undefined;
  let rerankModelPromise:
    | Promise<{
        model: LLMDynamicHandle;
        modelId?: string;
        source: "active-chat-model" | "configured" | "auto-detected";
        autoUnload: boolean;
      }>
    | undefined;
  let parsedDocumentsPromise:
    | Promise<Array<{ file: FileHandle; content: string }>>
    | undefined;

  const resolveEmbeddingModel = async () => {
    if (!embeddingModelPromise) {
      embeddingModelPromise = (async () => {
        const selectedModelId = pluginConfig.get("embeddingModel");
        const manualModelId = pluginConfig.get("embeddingModelManual");
        if (manualModelId && manualModelId.trim() !== "") {
          return ctl.client.embedding.model(manualModelId.trim(), {
            signal: ctl.abortSignal,
          });
        }
        if (selectedModelId !== AUTO_DETECT_MODEL_ID) {
          return ctl.client.embedding.model(selectedModelId, {
            signal: ctl.abortSignal,
          });
        }

        const loadedModels = await ctl.client.embedding.listLoaded();
        if (loadedModels.length > 0) {
          return loadedModels[0];
        }

        const downloadedModels = await ctl.client.system.listDownloadedModels("embedding");
        const found =
          downloadedModels.find((model) => {
            const candidate = `${model.modelKey} ${model.path} ${model.displayName}`.toLowerCase();
            return candidate.includes("embed");
          }) ?? downloadedModels[0];

        if (!found) {
          throw new Error(
            "No embedding model found. Please download one in LM Studio."
          );
        }

        return ctl.client.embedding.model(found.modelKey, {
          signal: ctl.abortSignal,
        });
      })();
    }

    return embeddingModelPromise;
  };

  const resolveRerankModel = async () => {
    if (!rerankModelPromise) {
      rerankModelPromise = (async () => {
        const rerankMode =
          (pluginConfig.get("modelRerankMode") as string | undefined) ??
          "active-chat-model";
        const manualModelId = String(
          pluginConfig.get("modelRerankModelId") ?? ""
        ).trim();
        const shouldAutoUnload = Boolean(pluginConfig.get("autoUnload"));

        if (rerankMode === "manual-model-id") {
          if (!manualModelId) {
            throw new Error(
              "Model-assisted rerank is set to manual model mode but no rerank model ID is configured."
            );
          }

          return {
            model: (await ctl.client.llm.model(manualModelId, {
              signal: ctl.abortSignal,
            })) as LLMDynamicHandle,
            modelId: manualModelId,
            source: "configured" as const,
            autoUnload: shouldAutoUnload,
          };
        }

        if (rerankMode === "auto-detect") {
          const loadedModels =
            typeof ctl.client.llm.listLoaded === "function"
              ? await ctl.client.llm.listLoaded()
              : [];
          if (loadedModels.length > 0) {
            return {
              model: loadedModels[0] as LLMDynamicHandle,
              modelId: (loadedModels[0] as any)?.identifier,
              source: "auto-detected" as const,
              autoUnload: false,
            };
          }

          const downloadedModels = await ctl.client.system.listDownloadedModels("llm");
          const found =
            downloadedModels.find((model) => {
              const candidate = `${model.modelKey} ${model.path} ${model.displayName}`.toLowerCase();
              return (
                candidate.includes("instruct") ||
                candidate.includes("chat") ||
                candidate.includes("assistant")
              );
            }) ?? downloadedModels[0];

          if (!found) {
            throw new Error(
              "No LLM model found for model-assisted reranking. Please download one in LM Studio."
            );
          }

          return {
            model: (await ctl.client.llm.model(found.modelKey, {
              signal: ctl.abortSignal,
            })) as LLMDynamicHandle,
            modelId: found.modelKey,
            source: "auto-detected" as const,
            autoUnload: shouldAutoUnload,
          };
        }

        const model = (await ctl.client.llm.model()) as LLMDynamicHandle;
        return {
          model,
          modelId: undefined,
          source: "active-chat-model" as const,
          autoUnload: false,
        };
      })();
    }

    return rerankModelPromise;
  };

  const resolveParsedDocuments = async () => {
    if (!parsedDocumentsPromise) {
      parsedDocumentsPromise = Promise.all(
        files.map(async (file) => {
          const parsed = await ctl.client.files.parseDocument(file, {
            signal: ctl.abortSignal,
          });
          return {
            file,
            content: parsed.content,
          };
        })
      );
    }

    return parsedDocumentsPromise;
  };

  const loadCorpus = async (): Promise<RagLoadedCorpus> => {
    const parsedDocuments = await resolveParsedDocuments();
    const documents = parsedDocuments.map((document) => ({
      id: document.file.identifier,
      name: document.file.name,
      content: document.content,
      metadata: {
        fileHandle: document.file,
        sourceType: "lmstudio-file-handle",
      },
    }));
    return {
      documents,
      fileCount: documents.length,
      estimatedTokens: documents.reduce(
        (sum, document) => sum + estimateTokens(document.content),
        0
      ),
    };
  };

  const runtime: RagOrchestratorRuntime = {
    loader: {
      async load() {
        return loadCorpus();
      },
    },
    documentParser: {
      async parse() {
        return loadCorpus();
      },
    },
    embeddingModelResolver: {
      async resolve() {
        const model = await resolveEmbeddingModel();
        return {
          modelId: model.identifier,
          source: "auto-detected",
          autoUnload: pluginConfig.get("autoUnload"),
        };
      },
    },
    retriever: {
      async search({ query, corpus, options }) {
        if (corpus.candidates && corpus.candidates.length > 0) {
          return corpus.candidates.slice(0, options?.maxEvidenceBlocks ?? 8);
        }

        const parsedDocuments = await resolveParsedDocuments();
        return toRagCandidates(
          lexicalRetrieve(
            query,
            parsedDocuments,
            options?.maxEvidenceBlocks ?? 8
          )
        );
      },
    },
    semanticRetriever: {
      async search({ query, rewrites, retrieval }) {
        const embeddingModel = await resolveEmbeddingModel();
        const retrievalRuns = await Promise.all(
          (rewrites && rewrites.length > 0 ? rewrites : [{ label: "original", text: query }]).map(
            async (rewrite) =>
              ctl.client.files.retrieve(rewrite.text, files, {
                embeddingModel,
                limit: retrieval?.maxCandidates ?? retrieval?.maxEvidenceBlocks ?? 8,
                signal: ctl.abortSignal,
              })
          )
        );

        let candidates = fuseRagCandidates(
          retrievalRuns.map((run) => toRagCandidates(run.entries)),
          retrieval?.fusionMethod ?? "reciprocal-rank-fusion",
          retrieval?.maxCandidates ?? retrieval?.maxEvidenceBlocks ?? 8
        );

        if (retrieval?.hybridEnabled) {
          const parsedDocuments = await resolveParsedDocuments();
          const lexicalEntries = lexicalRetrieve(
            query,
            parsedDocuments,
            pluginConfig.get("hybridCandidateCount")
          );
          candidates = mergeHybridRagCandidates(candidates, toRagCandidates(lexicalEntries), {
            semanticWeight: pluginConfig.get("semanticWeight"),
            lexicalWeight: pluginConfig.get("lexicalWeight"),
            maxCandidates:
              retrieval?.maxCandidates ?? pluginConfig.get("hybridCandidateCount"),
          });
        }

        return candidates;
      },
    },
    llmReranker: {
      async rerank({ query, candidates, options }) {
        const topK = options?.rerank?.topK ?? pluginConfig.get("rerankTopK");
        const modelRerankTopK = pluginConfig.get("modelRerankTopK");
        try {
          const rerankResolution = await resolveRerankModel();
          const heuristicEntries: Array<RankedRetrievalEntry> = toRetrievalResultEntries(candidates)
            .slice(0, modelRerankTopK)
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
          const modelAssisted = await performModelAssistedRerank(
            rerankResolution.model,
            query,
            heuristicEntries,
            topK,
            ctl.abortSignal
          );
          return {
            candidates: toRagCandidates(
              modelAssisted.rerankedEntries.map((entry) => ({
                ...entry.entry,
                score: entry.rerankScore,
              }))
            ),
            notes: [
              `Model-assisted rerank used ${rerankResolution.modelId ?? "active chat model"} (${rerankResolution.source}) and parsed ${modelAssisted.parsedScores.length} scores from response: ${modelAssisted.rawResponse}`,
            ],
          };
        } catch (error) {
          ctl.debug(
            `Model-assisted rerank failed; falling back to heuristic rerank. ${error instanceof Error ? error.message : String(error)}`
          );
          return {
            candidates,
            notes: [
              `Model-assisted rerank failed; heuristic order retained. ${error instanceof Error ? error.message : String(error)}`,
            ],
          };
        }
      },
    },
    citationEmitter: {
      async emit({ candidates }) {
        return buildRagEvidenceBlocks(candidates);
      },
    },
    contextSizer: {
      async measure({ corpus, options }) {
        const fullContextLimit =
          options?.routing?.fullContextTokenLimit ?? 4000;
        const estimatedTokens = corpus.estimatedTokens ?? 0;
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
    answerComposer: {
      async answer({ query, evidence, route, groundingMode }) {
        if (evidence.length === 0) {
          return {
            answer: `No relevant citations found for user query: ${query}`,
            confidence: 0.2,
            unsupportedClaimWarnings: [
              "No citations were found in the user files for the user query.",
            ],
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
          retrievalRecommended: (corpus.estimatedTokens ?? 0) > 4000,
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

  return {
    runtime,
    async cleanup() {
      if (pluginConfig.get("autoUnload") && embeddingModelPromise) {
        const embeddingModel = await embeddingModelPromise;
        await embeddingModel.unload();
      }

      if (rerankModelPromise) {
        const rerankModel = await rerankModelPromise;
        const unload = (rerankModel.model as any)?.unload;
        if (rerankModel.autoUnload && typeof unload === "function") {
          await unload.call(rerankModel.model);
        }
      }
    },
  };
}
