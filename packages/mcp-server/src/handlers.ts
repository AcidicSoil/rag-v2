import { buildRagEvidenceBlocks, rerankRagCandidates } from "../../core/src/retrievalPipeline";
import type { RagCandidate } from "../../core/src/contracts";
import type { RagExecutionRoute } from "../../core/src/outputContracts";
import type {
  RagInlineDocumentInput,
  RagMcpRuntime,
  RagPrechunkedCandidateInput,
  RagPreparePromptResponse,
  RagToolHandlerSet,
} from "../../core/src/runtimeContracts";
import {
  corpusInspectInputSchema,
  ragAnswerInputSchema,
  ragPreparePromptInputSchema,
  ragSearchInputSchema,
  rerankOnlyInputSchema,
  type CorpusInspectInput,
  type RagAnswerInput,
  type RagPreparePromptInput,
  type RagSearchInput,
  type RerankOnlyInput,
} from "./contracts";

export function createMcpToolHandlers(runtime: RagMcpRuntime): RagToolHandlerSet {
  return {
    async ragAnswer(input: RagAnswerInput) {
      const parsed = ragAnswerInputSchema.parse(input);
      const prepared = await prepareEvidence(runtime, parsed, parsed.query, parsed.retrieval);
      const composed = await runtime.answerComposer.answer({
        query: parsed.query,
        corpus: prepared.corpus,
        evidence: prepared.evidence,
        route: prepared.route,
        groundingMode: parsed.groundingMode,
      });

      return {
        answer: composed.answer ?? prepared.preparedPrompt,
        route: prepared.route,
        confidence: composed.confidence,
        evidence: prepared.evidence.map((block) => ({
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
      const prepared = await prepareEvidence(runtime, parsed, parsed.query, parsed.retrieval);
      return {
        candidates: prepared.candidates,
        route: prepared.route,
      };
    },

    async ragPreparePrompt(input: RagPreparePromptInput): Promise<RagPreparePromptResponse> {
      const parsed = ragPreparePromptInputSchema.parse(input);
      const prepared = await prepareEvidence(runtime, parsed, parsed.query, parsed.retrieval);
      return {
        route: prepared.route,
        preparedPrompt: prepared.preparedPrompt,
        evidence: prepared.evidence.map((block) => ({
          label: block.label,
          fileName: block.fileName,
          content: block.content,
          score: block.score,
        })),
        diagnostics: {
          route: prepared.route,
          notes: [
            "Prepared prompt assembled via the current MCP handler path.",
            runtime.semanticRetriever
              ? "Semantic runtime capability detected."
              : "Using degraded lexical/runtime-compatible retrieval path.",
          ],
          degraded: !runtime.semanticRetriever,
          runtimeCapabilities: collectRuntimeCapabilities(runtime),
        },
        unsupportedClaimWarnings:
          prepared.evidence.length > 0
            ? []
            : ["No evidence was available in the current runtime."],
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

async function prepareEvidence(
  runtime: RagMcpRuntime,
  input: {
    mode?: string;
    documents?: Array<RagInlineDocumentInput>;
    paths?: Array<string>;
    chunks?: Array<RagPrechunkedCandidateInput>;
  },
  query: string,
  retrieval: { rerankTopK?: number; maxEvidenceBlocks?: number } | undefined
) {
  const corpus = await runtime.loader.load(input);
  const candidates = await runtime.retriever.search({
    query,
    corpus,
    options: retrieval,
  });
  const reranked = rerankRagCandidates(query, candidates, {
    topK: retrieval?.rerankTopK ?? retrieval?.maxEvidenceBlocks ?? 5,
    strategy: "heuristic-v1",
  });
  const evidence = buildRagEvidenceBlocks(
    reranked.map((ranked) => ({
      ...ranked.candidate,
      score: ranked.rerankScore,
    }))
  );
  const route = deriveRoute(input, corpus, candidates);

  return {
    corpus,
    candidates,
    evidence,
    route,
    preparedPrompt: buildPreparedPrompt(query, route, evidence),
  };
}

function buildPreparedPrompt(query: string, route: string, evidence: ReturnType<typeof buildRagEvidenceBlocks>) {
  if (evidence.length === 0) {
    return [
      `Question: ${query}`,
      `Route: ${route}`,
      "No evidence was retrieved.",
    ].join("\n\n");
  }

  const serializedEvidence = evidence
    .map(
      (block, index) =>
        `[${index + 1}] ${block.fileName} (${block.score.toFixed(3)})\n${block.content}`
    )
    .join("\n\n");

  return [
    `Question: ${query}`,
    `Route: ${route}`,
    "Use the grounded evidence below when answering.",
    serializedEvidence,
  ].join("\n\n");
}

function collectRuntimeCapabilities(runtime: RagMcpRuntime) {
  const capabilities: Array<string> = ["loader", "retriever", "answerComposer", "inspector"];
  if (runtime.documentParser) {
    capabilities.push("documentParser");
  }
  if (runtime.embeddingModelResolver) {
    capabilities.push("embeddingModelResolver");
  }
  if (runtime.semanticRetriever) {
    capabilities.push("semanticRetriever");
  }
  if (runtime.llmReranker) {
    capabilities.push("llmReranker");
  }
  if (runtime.contextSizer) {
    capabilities.push("contextSizer");
  }
  if (runtime.citationEmitter) {
    capabilities.push("citationEmitter");
  }
  if (runtime.policyEngine) {
    capabilities.push("policyEngine");
  }
  return capabilities;
}

function deriveRoute(
  input: { mode?: string },
  corpus: { documents: Array<unknown>; candidates?: Array<RagCandidate> },
  candidates: Array<RagCandidate>
): RagExecutionRoute {
  if (input.mode && input.mode !== "auto") {
    return input.mode as RagExecutionRoute;
  }

  if ((corpus.candidates?.length ?? 0) > 0) {
    return "prechunked-retrieval";
  }

  if (corpus.documents.length <= 2 && candidates.length <= 4) {
    return "lightweight-retrieval";
  }

  return "retrieval";
}
