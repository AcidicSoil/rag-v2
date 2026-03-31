import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import type { RagEvidenceBlock, RagDocument } from "../../core/src/contracts";
import { lexicalRetrieveFromDocuments } from "../../core/src/localRetrieval";
import type { RagLoadedCorpus, RagMcpRuntime } from "../../core/src/runtimeContracts";

const TEXT_FILE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".kt",
  ".log",
  ".lua",
  ".md",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

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
          answer: buildStubAnswer(query, evidence, route, groundingMode ?? "warn-on-weak-evidence"),
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
  };
}

async function loadDocumentsFromPaths(paths: Array<string>): Promise<Array<RagDocument>> {
  const results: Array<RagDocument> = [];

  for (const inputPath of paths) {
    const absolutePath = path.resolve(inputPath);
    const discoveredPaths = await discoverTextFiles(absolutePath);
    for (const discoveredPath of discoveredPaths) {
      const content = await readTextFile(discoveredPath);
      if (!content) {
        continue;
      }

      results.push({
        id: discoveredPath,
        name: path.relative(process.cwd(), discoveredPath) || path.basename(discoveredPath),
        content,
        metadata: {
          absolutePath: discoveredPath,
          sourceType: "filesystem-path",
        },
      });
    }
  }

  return results;
}

async function discoverTextFiles(inputPath: string): Promise<Array<string>> {
  const pathStat = await stat(inputPath);
  if (pathStat.isFile()) {
    return isSupportedTextFile(inputPath) ? [inputPath] : [];
  }

  if (!pathStat.isDirectory()) {
    return [];
  }

  const entries = await readdir(inputPath, { withFileTypes: true });
  const results: Array<string> = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const resolved = path.join(inputPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await discoverTextFiles(resolved)));
      continue;
    }

    if (entry.isFile() && isSupportedTextFile(resolved)) {
      results.push(resolved);
    }
  }

  return results;
}

function isSupportedTextFile(filePath: string) {
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
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

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
