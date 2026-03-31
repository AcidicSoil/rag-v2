import type { RagEvidenceBlock } from "../core/contracts";
import type { RagLoadedCorpus, RagMcpRuntime } from "../core/runtimeContracts";

function estimateTokens(value: string) {
  return Math.ceil(value.trim().length / 4);
}

export function createDefaultMcpRuntime(): RagMcpRuntime {
  return {
    loader: {
      async load(input) {
        const documents = (input.documents ?? []).map((document) => ({
          id: document.id,
          name: document.name,
          content: document.content,
          metadata: document.metadata,
        }));
        const candidates = (input.chunks ?? []).map((chunk) => ({
          sourceId: chunk.sourceId,
          sourceName: chunk.sourceName,
          content: chunk.content,
          score: chunk.score,
          metadata: chunk.metadata,
        }));
        const estimatedTokens = documents.reduce(
          (sum, document) => sum + estimateTokens(document.content),
          0
        );

        return {
          documents,
          candidates: candidates.length > 0 ? candidates : undefined,
          fileCount: documents.length + (input.paths?.length ?? 0),
          estimatedTokens,
          chunkCount: candidates.length > 0 ? candidates.length : undefined,
        };
      },
    },
    retriever: {
      async search({ query, corpus }) {
        if (corpus.candidates && corpus.candidates.length > 0) {
          return corpus.candidates;
        }

        const queryTokens = tokenize(query);
        return corpus.documents
          .map((document) => {
            const normalized = normalizeWhitespace(document.content);
            const contentTokens = tokenize(normalized);
            const overlap = computeOverlap(queryTokens, contentTokens);
            return {
              sourceId: document.id,
              sourceName: document.name,
              content: normalized,
              score: overlap,
              metadata: document.metadata,
            };
          })
          .filter((candidate) => candidate.score > 0)
          .sort((left, right) => right.score - left.score)
          .slice(0, 8);
      },
    },
    answerComposer: {
      async answer({ query, evidence, route, groundingMode }) {
        return {
          answer: buildStubAnswer(query, evidence, route, groundingMode),
          confidence: evidence.length > 0 ? Math.min(0.9, 0.45 + evidence.length * 0.1) : 0.2,
          unsupportedClaimWarnings:
            evidence.length > 0
              ? []
              : ["No evidence was available in the current stub runtime."] ,
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

function tokenize(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1);
}

function computeOverlap(queryTokens: Array<string>, contentTokens: Array<string>) {
  if (queryTokens.length === 0 || contentTokens.length === 0) {
    return 0;
  }

  const contentSet = new Set(contentTokens);
  let matches = 0;
  for (const token of queryTokens) {
    if (contentSet.has(token)) {
      matches += 1;
    }
  }

  return matches / queryTokens.length;
}
