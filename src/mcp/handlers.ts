import { buildRagEvidenceBlocks, rerankRagCandidates } from "../core/retrievalPipeline";
import type { RagCandidate } from "../core/contracts";
import type { RagMcpRuntime, RagToolHandlerSet } from "../core/runtimeContracts";
import {
  corpusInspectInputSchema,
  ragAnswerInputSchema,
  ragSearchInputSchema,
  rerankOnlyInputSchema,
  type CorpusInspectInput,
  type RagAnswerInput,
  type RagSearchInput,
  type RerankOnlyInput,
} from "./contracts";

export function createMcpToolHandlers(runtime: RagMcpRuntime): RagToolHandlerSet {
  return {
    async ragAnswer(input: RagAnswerInput) {
      const parsed = ragAnswerInputSchema.parse(input);
      const corpus = await runtime.loader.load(parsed);
      const candidates = await runtime.retriever.search({
        query: parsed.query,
        corpus,
        options: parsed.retrieval,
      });
      const reranked = rerankRagCandidates(parsed.query, candidates, {
        topK: parsed.retrieval?.rerankTopK ?? parsed.retrieval?.maxEvidenceBlocks ?? 5,
        strategy: "heuristic-v1",
      });
      const evidence = buildRagEvidenceBlocks(
        reranked.map((ranked) => ({
          ...ranked.candidate,
          score: ranked.rerankScore,
        }))
      );
      const composed = await runtime.answerComposer.answer({
        query: parsed.query,
        corpus,
        evidence,
        route: deriveRoute(parsed, corpus, candidates),
        groundingMode: parsed.groundingMode,
      });

      return {
        answer: composed.answer,
        route: deriveRoute(parsed, corpus, candidates),
        confidence: composed.confidence,
        evidence: evidence.map((block) => ({
          label: block.label,
          fileName: block.fileName,
          content: block.content,
          score: block.score,
        })),
        unsupportedClaimWarnings: composed.unsupportedClaimWarnings,
      };
    },

    async ragSearch(input: RagSearchInput) {
      const parsed = ragSearchInputSchema.parse(input);
      const corpus = await runtime.loader.load(parsed);
      const candidates = await runtime.retriever.search({
        query: parsed.query,
        corpus,
        options: parsed.retrieval,
      });
      return {
        candidates,
        route: deriveRoute({ mode: "retrieval" }, corpus, candidates),
      };
    },

    async corpusInspect(input: CorpusInspectInput) {
      const parsed = corpusInspectInputSchema.parse(input);
      const corpus = await runtime.loader.load(parsed);
      return runtime.inspector.inspect({ corpus });
    },

    async rerankOnly(input: RerankOnlyInput) {
      const parsed = rerankOnlyInputSchema.parse(input);
      const reranked = rerankRagCandidates(parsed.query, parsed.candidates, {
        topK: parsed.topK,
        strategy: "heuristic-v1",
      });
      return {
        candidates: reranked.map((candidate) => ({
          ...candidate.candidate,
          score: candidate.rerankScore,
        })),
        reasons: reranked.map(
          (candidate, index) =>
            `Rank ${index + 1}: overlap=${candidate.features.lexicalOverlap.toFixed(2)}, heading=${candidate.features.headingMatch.toFixed(2)}, diversityPenalty=${candidate.features.diversityPenalty.toFixed(2)}`
        ),
      };
    },
  };
}

function deriveRoute(
  input: { mode?: string },
  corpus: { documents: Array<unknown>; candidates?: Array<RagCandidate> },
  candidates: Array<RagCandidate>
): string {
  if (input.mode && input.mode !== "auto") {
    return input.mode;
  }

  if ((corpus.candidates?.length ?? 0) > 0) {
    return "prechunked-retrieval";
  }

  if (corpus.documents.length <= 2 && candidates.length <= 4) {
    return "lightweight-retrieval";
  }

  return "retrieval";
}
