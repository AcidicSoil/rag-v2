import { rerankRagCandidates } from "../../core/src/retrievalPipeline";
import { analyzeLargeCorpus } from "../../core/src/largeCorpus";
import { orchestrateRagRequest } from "../../core/src/orchestrator";
import type {
  RagAnswerEnvelopeOutput,
  RagPreparedPromptOutput,
  RagSearchResultsOutput,
} from "../../core/src/outputContracts";
import type { RagRequestOptions } from "../../core/src/requestOptions";
import type {
  RagMcpRuntime,
  RagPreparePromptResponse,
  RagToolHandlerSet,
} from "../../core/src/runtimeContracts";
import {
  corpusInspectInputSchema,
  fileInfoInputSchema,
  filesystemBrowseInputSchema,
  ragAnswerInputSchema,
  ragPreparePromptInputSchema,
  ragSearchInputSchema,
  readFileInputSchema,
  rerankOnlyInputSchema,
  type CorpusInspectInput,
  type FileInfoInput,
  type FileSystemBrowseInput,
  type RagAnswerInput,
  type RagPreparePromptInput,
  type RagSearchInput,
  type ReadFileInput,
  type RerankOnlyInput,
} from "./contracts";

export function createMcpToolHandlers(runtime: RagMcpRuntime): RagToolHandlerSet {
  return {
    async ragAnswer(input: RagAnswerInput) {
      const parsed = ragAnswerInputSchema.parse(input);
      const output = (await orchestrateRagRequest(
        {
          query: parsed.query,
          documents: parsed.documents,
          paths: parsed.paths,
          chunks: parsed.chunks,
          requestedRoute: parsed.mode === "auto" ? "retrieval" : parsed.mode,
          options: mergeLegacyOverrides(parsed),
          outputMode: "answer-envelope",
        },
        runtime
      )) as RagAnswerEnvelopeOutput;

      return {
        answer: output.answer ?? output.preparedPrompt ?? "",
        route: output.route,
        confidence: output.confidence,
        evidence: output.evidence.map((block) => ({
          label: block.label,
          fileName: block.fileName,
          content: block.content,
          score: block.score,
        })),
        unsupportedClaimWarnings: output.unsupportedClaimWarnings,
      };
    },

    async ragSearch(input: RagSearchInput) {
      const parsed = ragSearchInputSchema.parse(input);
      const output = (await orchestrateRagRequest(
        {
          query: parsed.query,
          documents: parsed.documents,
          paths: parsed.paths,
          chunks: parsed.chunks,
          requestedRoute: "retrieval",
          options: mergeLegacyOverrides(parsed),
          outputMode: "search-results",
        },
        runtime
      )) as RagSearchResultsOutput;

      return {
        candidates: output.candidates.map((candidate) => ({
          sourceId: candidate.sourceId,
          sourceName: candidate.sourceName,
          content: candidate.content,
          score: candidate.score,
          metadata: candidate.metadata,
        })),
        route: output.route,
      };
    },

    async ragPreparePrompt(input: RagPreparePromptInput): Promise<RagPreparePromptResponse> {
      const parsed = ragPreparePromptInputSchema.parse(input);
      const output = (await orchestrateRagRequest(
        {
          query: parsed.query,
          documents: parsed.documents,
          paths: parsed.paths,
          chunks: parsed.chunks,
          requestedRoute: parsed.mode,
          options: mergeLegacyOverrides(parsed),
          outputMode: "prepared-prompt",
        },
        runtime
      )) as RagPreparedPromptOutput;

      return {
        route: output.route,
        preparedPrompt: output.preparedPrompt,
        evidence: output.evidence.map((block) => ({
          label: block.label,
          fileName: block.fileName,
          content: block.content,
          score: block.score,
        })),
        diagnostics: output.diagnostics,
        unsupportedClaimWarnings: output.unsupportedClaimWarnings,
      };
    },

    async corpusInspect(input: CorpusInspectInput) {
      const parsed = corpusInspectInputSchema.parse(input);
      const corpus = await runtime.loader.load(parsed);
      const analysis = await analyzeLargeCorpus(
        parsed.paths,
        parsed.query ?? "What is in this dataset overall? Give me a high-level inventory of the corpus.",
        corpus,
        runtime.browser
      );
      return runtime.inspector.inspect({
        corpus: analysis ? { ...corpus, analysis } : corpus,
      });
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

    async filesystemBrowse(input: FileSystemBrowseInput) {
      const parsed = filesystemBrowseInputSchema.parse(input);
      return runtime.browser.browse(parsed);
    },

    async fileInfo(input: FileInfoInput) {
      const parsed = fileInfoInputSchema.parse(input);
      return runtime.browser.fileInfo(parsed);
    },

    async readFile(input: ReadFileInput) {
      const parsed = readFileInputSchema.parse(input);
      return runtime.browser.readFile(parsed);
    },
  };
}

function mergeLegacyOverrides(input: {
  groundingMode?: "off" | "warn-on-weak-evidence" | "require-evidence";
  retrieval?: {
    multiQueryEnabled?: boolean;
    multiQueryCount?: number;
    fusionMethod?: "reciprocal-rank-fusion" | "max-score";
    hybridEnabled?: boolean;
    rerankEnabled?: boolean;
    rerankTopK?: number;
    rerankModelSource?: "active-chat-model" | "auto-detect" | "manual-model-id";
    rerankModelId?: string;
    maxEvidenceBlocks?: number;
  };
  options?: RagRequestOptions;
}): RagRequestOptions {
  return {
    policy: {
      groundingMode:
        input.options?.policy?.groundingMode ??
        input.groundingMode ??
        "warn-on-weak-evidence",
      answerabilityGateEnabled: input.options?.policy?.answerabilityGateEnabled,
      answerabilityGateThreshold: input.options?.policy?.answerabilityGateThreshold,
      ambiguousQueryBehavior: input.options?.policy?.ambiguousQueryBehavior,
    },
    routing: {
      requestedRoute: input.options?.routing?.requestedRoute,
      fullContextTokenLimit: input.options?.routing?.fullContextTokenLimit,
      activeModelContextTokens: input.options?.routing?.activeModelContextTokens,
      correctiveEnabled: input.options?.routing?.correctiveEnabled,
      correctiveMaxAttempts: input.options?.routing?.correctiveMaxAttempts,
    },
    retrieval: {
      multiQueryEnabled:
        input.options?.retrieval?.multiQueryEnabled ??
        input.retrieval?.multiQueryEnabled,
      multiQueryCount:
        input.options?.retrieval?.multiQueryCount ??
        input.retrieval?.multiQueryCount,
      fusionMethod:
        input.options?.retrieval?.fusionMethod ?? input.retrieval?.fusionMethod,
      hybridEnabled:
        input.options?.retrieval?.hybridEnabled ?? input.retrieval?.hybridEnabled,
      maxCandidates: input.options?.retrieval?.maxCandidates,
      maxEvidenceBlocks:
        input.options?.retrieval?.maxEvidenceBlocks ??
        input.retrieval?.maxEvidenceBlocks,
      minScore: input.options?.retrieval?.minScore,
      dedupeSimilarityThreshold:
        input.options?.retrieval?.dedupeSimilarityThreshold,
    },
    rerank: {
      enabled:
        input.options?.rerank?.enabled ?? input.retrieval?.rerankEnabled,
      strategy: input.options?.rerank?.strategy,
      topK: input.options?.rerank?.topK ?? input.retrieval?.rerankTopK,
      modelSource:
        input.options?.rerank?.modelSource ?? input.retrieval?.rerankModelSource,
      modelId: input.options?.rerank?.modelId ?? input.retrieval?.rerankModelId,
    },
    safety: input.options?.safety,
    outputMode: input.options?.outputMode,
  };
}
