import { readFile } from "node:fs/promises";
import path from "node:path";
import type { RagEvidenceBlock, RagDocument } from "../../core/src/contracts";
import { lexicalRetrieveFromDocuments } from "../../core/src/localRetrieval";
import type { RagMcpRuntime } from "../../core/src/runtimeContracts";
import {
  browseFileSystem,
  discoverSupportedTextFiles,
  resolveUserPath,
} from "./pathResolution";

function estimateTokens(value: string) {
  return Math.ceil(value.trim().length / 4);
}

export function createDefaultMcpRuntime(): RagMcpRuntime {
  return {
    loader: {
      async load(input) {
        const inlineDocuments = (input.documents ?? []).map((document) => ({
          id: document.id,
          name: document.name,
          content: document.content,
          metadata: {
            ...document.metadata,
            sourceType: "inline-document",
          },
        }));
        const pathDocuments = await loadDocumentsFromPaths(input.paths ?? []);
        const documents = [...inlineDocuments, ...pathDocuments];
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
    answerComposer: {
      async answer({ query, evidence, route, groundingMode }) {
        return {
          answer: buildStubAnswer(
            query,
            evidence,
            route,
            groundingMode ?? "warn-on-weak-evidence"
          ),
          confidence:
            evidence.length > 0 ? Math.min(0.9, 0.45 + evidence.length * 0.1) : 0.2,
          unsupportedClaimWarnings:
            evidence.length > 0
              ? []
              : ["No evidence was available in the current runtime."],
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
            corpus.chunkCount && corpus.chunkCount > 0
              ? "retrieval"
              : (corpus.estimatedTokens ?? 0) < 4000
                ? "full-context"
                : "retrieval",
          fullContextViable: (corpus.estimatedTokens ?? 0) < 4000,
          retrievalRecommended:
            (corpus.chunkCount ?? 0) > 0 || (corpus.estimatedTokens ?? 0) >= 4000,
        };
      },
    },
    browser: {
      async browse(input) {
        return browseFileSystem(input);
      },
    },
  };
}

async function loadDocumentsFromPaths(paths: Array<string>): Promise<Array<RagDocument>> {
  const results: Array<RagDocument> = [];

  for (const inputPath of paths) {
    const discovery = await discoverSupportedTextFiles(inputPath, {
      maxEntries: 2000,
      includeHidden: false,
      maxDepth: 8,
      ignoreDirectories: true,
    });
    for (const discoveredPath of discovery.paths) {
      const content = await readTextFile(discoveredPath);
      if (!content) {
        continue;
      }

      results.push({
        id: discoveredPath,
        name: path.relative(process.cwd(), discoveredPath) || path.basename(discoveredPath),
        content,
        metadata: {
          absolutePath: resolveUserPath(inputPath),
          discoveredPath,
          sourceType: "filesystem-path",
          discoveryTruncated: discovery.truncated,
          discoveryErrors: discovery.errors,
        },
      });
    }
  }

  return results;
}

async function readTextFile(filePath: string): Promise<string> {
  const content = await readFile(filePath, "utf8");
  return content.replace(/\r\n/g, "\n").trim();
}

function buildStubAnswer(
  query: string,
  evidence: Array<RagEvidenceBlock>,
  route: string,
  groundingMode: string
) {
  if (evidence.length === 0) {
    return `Stub ${route} answer for: ${query}. No evidence was retrieved yet.`;
  }

  const top = evidence[0]!;
  return [
    `Stub ${route} answer for: ${query}`,
    `Grounding mode: ${groundingMode}.`,
    `Top evidence came from ${top.fileName} with score ${top.score.toFixed(3)}.`,
    `Evidence excerpt: ${top.content}`,
  ].join(" ");
}
