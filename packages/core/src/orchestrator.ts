import type { RagCandidate, RagEvidenceBlock, RagRerankStrategy } from "./contracts";
import {
  assessCoreCorrectiveNeed,
  buildCoreCorrectiveQueryPlan,
} from "./corrective";
import type {
  RagAnswerEnvelopeOutput,
  RagDiagnostics,
  RagExecutionRoute,
  RagOrchestratorOutput,
  RagOutputForMode,
} from "./outputContracts";
import { RagQueryRewrite, type RagFileRef } from "./policyContracts";
import type {
  RagGroundingMode,
  RagOutputMode,
  RagRequestOptions,
  RagRequestedRoute,
  RagRetrievalOptions,
} from "./requestOptions";
import {
  buildRagEvidenceBlocks,
  dedupeRagCandidates,
  fuseRagCandidates,
  rerankRagCandidates,
} from "./retrievalPipeline";
import {
  hierarchicalRetrieveFromDocuments,
  lexicalRetrieveFromDocuments,
} from "./localRetrieval";
import { generateCoreQueryRewrites } from "./rewrite";
import {
  buildCoreAmbiguousGateMessage,
  buildCoreLikelyUnanswerableGateMessage,
  runCoreAnswerabilityGate,
} from "./gating";
import {
  buildCoreGroundingInstruction,
  sanitizeCoreEvidenceBlocks,
} from "./safety";
import { analyzeLargeCorpus } from "./largeCorpus";
import type {
  RagLoadedCorpus,
  RagOrchestrator,
  RagOrchestratorRequest,
  RagOrchestratorRuntime,
  RagPolicyDecision,
} from "./runtimeContracts";

const DEFAULT_MAX_EVIDENCE_BLOCKS = 5;
const DEFAULT_MAX_CANDIDATES = 8;
const DEFAULT_MULTI_QUERY_COUNT = 3;
const DEFAULT_DEDUPE_THRESHOLD = 0.85;
const DEFAULT_FULL_CONTEXT_TOKEN_LIMIT = 4000;
const DEFAULT_CORRECTIVE_MAX_ATTEMPTS = 1;
const DEFAULT_CORRECTIVE_MIN_SCORE = 0.35;
const DEFAULT_CORRECTIVE_MIN_ASPECT_COVERAGE = 0.5;

export const orchestrateRagRequest: RagOrchestrator["run"] = async (
  request,
  runtime
) => {
  const options = normalizeRequestOptions(request.options, request.outputMode, request.requestedRoute);
  const corpus = await loadCorpus(request, runtime);
  const diagnostics: RagDiagnostics = {
    route: "retrieval",
    notes: [...(corpus.analysis?.notes ?? [])],
    degraded: !runtime.semanticRetriever,
    runtimeCapabilities: collectRuntimeCapabilities(runtime),
  };
  const unsupportedClaimWarnings: Array<string> = [];

  const policyDecision = await evaluatePolicy(request.query, corpus, options, runtime);
  diagnostics.notes?.push(...(policyDecision.notes ?? []));
  unsupportedClaimWarnings.push(...(policyDecision.unsupportedClaimWarnings ?? []));

  if (policyDecision.route === "no-retrieval") {
    diagnostics.route = "no-retrieval";
    return shapeNoRetrievalOutput(request.query, corpus, options, diagnostics, unsupportedClaimWarnings);
  }

  const route = await determineRoute(request.query, corpus, options, runtime, policyDecision.route);
  diagnostics.route = route;

  if (route === "full-context") {
    const fullContextOutput = await shapeFullContextOutput(
      request.query,
      corpus,
      options,
      diagnostics,
      unsupportedClaimWarnings,
      runtime
    );
    return castOutput(fullContextOutput, request.outputMode);
  }

  if (route === "sample" || route === "global-summary") {
    const largeCorpusOutput = await shapeLargeCorpusSummaryOutput(
      request.query,
      corpus,
      route,
      options,
      diagnostics,
      unsupportedClaimWarnings,
      runtime
    );
    return castOutput(largeCorpusOutput, request.outputMode);
  }

  const retrievalResult = await runRetrievalFlow(request.query, corpus, options, runtime, route, diagnostics);
  unsupportedClaimWarnings.push(...retrievalResult.unsupportedClaimWarnings);

  const output = await shapeOutput(
    request.query,
    corpus,
    retrievalResult.candidates,
    retrievalResult.evidence,
    retrievalResult.route,
    options,
    diagnostics,
    unsupportedClaimWarnings,
    runtime
  );

  return castOutput(output, request.outputMode);
};

export const defaultRagOrchestrator: RagOrchestrator = {
  run: orchestrateRagRequest,
};

async function loadCorpus(
  request: RagOrchestratorRequest,
  runtime: RagOrchestratorRuntime
): Promise<RagLoadedCorpus> {
  const input = {
    documents: request.documents,
    paths: request.paths,
    chunks: request.chunks,
  };

  const baseCorpus = runtime.documentParser
    ? await runtime.documentParser.parse(input)
    : await runtime.loader.load(input);

  const analysis = await analyzeLargeCorpus(request.paths, request.query, baseCorpus, runtime.browser);
  if (!analysis) {
    return baseCorpus;
  }

  return {
    ...baseCorpus,
    analysis,
  };
}

async function evaluatePolicy(
  query: string,
  corpus: RagLoadedCorpus,
  options: RagRequestOptions,
  runtime: RagOrchestratorRuntime
): Promise<RagPolicyDecision> {
  if (runtime.policyEngine) {
    return runtime.policyEngine.evaluate({ query, corpus, options });
  }

  if (!options.policy?.answerabilityGateEnabled) {
    return { allowed: true };
  }

  const gateResult = runCoreAnswerabilityGate(
    query,
    corpus.documents.map((document) => ({ id: document.id, name: document.name } satisfies RagFileRef)),
    options.policy.answerabilityGateThreshold ?? 0.7
  );

  if (gateResult.decision === "no-retrieval-needed") {
    return {
      allowed: true,
      route: "no-retrieval",
      notes: gateResult.reasons,
    };
  }

  if (gateResult.decision === "ambiguous") {
    return {
      allowed: true,
      route: "no-retrieval",
      notes: gateResult.reasons,
      unsupportedClaimWarnings: [
        buildCoreAmbiguousGateMessage(
          query,
          corpus.documents.map((document) => ({ id: document.id, name: document.name })),
          options.policy.ambiguousQueryBehavior === "proceed"
            ? "attempt-best-effort"
            : "ask-clarification"
        ),
      ],
    };
  }

  if (gateResult.decision === "likely-unanswerable") {
    return {
      allowed: true,
      route: "no-retrieval",
      notes: gateResult.reasons,
      unsupportedClaimWarnings: [buildCoreLikelyUnanswerableGateMessage(query)],
    };
  }

  return {
    allowed: true,
    notes: gateResult.reasons,
  };
}

async function determineRoute(
  query: string,
  corpus: RagLoadedCorpus,
  options: RagRequestOptions,
  runtime: RagOrchestratorRuntime,
  policyRoute?: RagExecutionRoute
): Promise<RagExecutionRoute> {
  if (policyRoute) {
    return policyRoute;
  }

  const requestedRoute = options.routing?.requestedRoute;
  if (requestedRoute && requestedRoute !== "auto") {
    return normalizeRequestedRoute(requestedRoute);
  }

  if (corpus.candidates && corpus.candidates.length > 0) {
    return "prechunked-retrieval";
  }

  if (corpus.analysis?.recommendedRoute) {
    if (
      corpus.analysis.recommendedRoute === "hierarchical-retrieval" &&
      options.routing?.correctiveEnabled
    ) {
      return "corrective";
    }
    return corpus.analysis.recommendedRoute;
  }

  if (runtime.contextSizer) {
    const sizing = await runtime.contextSizer.measure({ query, corpus, options });
    if (sizing.recommendedRoute) {
      return sizing.recommendedRoute;
    }
    if (sizing.fullContextViable) {
      return "full-context";
    }
  }

  const estimatedTokens = corpus.estimatedTokens ?? 0;
  const fullContextLimit = options.routing?.fullContextTokenLimit ?? DEFAULT_FULL_CONTEXT_TOKEN_LIMIT;
  if (estimatedTokens > 0 && estimatedTokens <= fullContextLimit) {
    return "full-context";
  }

  if (options.routing?.correctiveEnabled) {
    return "corrective";
  }

  return "retrieval";
}

async function shapeFullContextOutput(
  query: string,
  corpus: RagLoadedCorpus,
  options: RagRequestOptions,
  diagnostics: RagDiagnostics,
  unsupportedClaimWarnings: Array<string>,
  runtime: RagOrchestratorRuntime
): Promise<RagOrchestratorOutput> {
  const preparedPrompt = buildFullContextPrompt(query, corpus, options.policy?.groundingMode ?? "warn-on-weak-evidence");

  if (options.outputMode === "prepared-prompt") {
    return {
      mode: "prepared-prompt",
      route: "full-context",
      preparedPrompt,
      evidence: [],
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  if (options.outputMode === "search-results") {
    return {
      mode: "search-results",
      route: "full-context",
      candidates: [],
      evidence: [],
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  const composed = await runtime.answerComposer.answer({
    query,
    corpus,
    evidence: [],
    route: "full-context",
    groundingMode: options.policy?.groundingMode,
    options,
  });

  return {
    mode: "answer-envelope",
    route: "full-context",
    answer: composed.answer,
    preparedPrompt,
    evidence: [],
    diagnostics,
    unsupportedClaimWarnings: mergeWarnings(unsupportedClaimWarnings, composed.unsupportedClaimWarnings),
    confidence: composed.confidence,
    groundingMode: options.policy?.groundingMode,
  };
}

async function shapeLargeCorpusSummaryOutput(
  query: string,
  corpus: RagLoadedCorpus,
  route: "sample" | "global-summary",
  options: RagRequestOptions,
  diagnostics: RagDiagnostics,
  unsupportedClaimWarnings: Array<string>,
  _runtime: RagOrchestratorRuntime
): Promise<RagOrchestratorOutput> {
  const summaryDocuments = corpus.analysis?.summaryDocuments ?? [];
  const summaryCorpus: RagLoadedCorpus = {
    ...corpus,
    documents: summaryDocuments,
    estimatedTokens: summaryDocuments.reduce(
      (sum, document) => sum + Math.ceil(document.content.length / 4),
      0
    ),
  };
  const preparedPrompt = buildFullContextPrompt(
    query,
    summaryCorpus,
    options.policy?.groundingMode ?? "warn-on-weak-evidence"
  );

  if (options.outputMode === "prepared-prompt") {
    return {
      mode: "prepared-prompt",
      route,
      preparedPrompt,
      evidence: [],
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  if (options.outputMode === "search-results") {
    return {
      mode: "search-results",
      route,
      candidates: [],
      evidence: [],
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  const answer = [
    `Large-corpus ${route} mode selected for: ${query}`,
    corpus.analysis?.notes.join(" ") ?? "",
    ...summaryDocuments.slice(0, 3).map((document) => `${document.name}: ${document.content}`),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    mode: "answer-envelope",
    route,
    answer,
    preparedPrompt,
    evidence: [],
    diagnostics,
    unsupportedClaimWarnings,
    confidence: summaryDocuments.length > 0 ? 0.55 : 0.2,
    groundingMode: options.policy?.groundingMode,
  };
}

async function runRetrievalFlow(
  query: string,
  corpus: RagLoadedCorpus,
  options: RagRequestOptions,
  runtime: RagOrchestratorRuntime,
  initialRoute: RagExecutionRoute,
  diagnostics: RagDiagnostics
): Promise<{
  route: RagExecutionRoute;
  candidates: Array<RagCandidate>;
  evidence: Array<RagEvidenceBlock>;
  unsupportedClaimWarnings: Array<string>;
}> {
  const retrievalOptions = options.retrieval ?? {};
  const rewrites = buildRewrites(query, retrievalOptions);
  diagnostics.retrievalQueries = rewrites.map((rewrite) => rewrite.text);

  let activeRoute = initialRoute;
  let activeRewrites = rewrites;
  let attempt = 0;
  let finalCandidates: Array<RagCandidate> = [];
  let warnings: Array<string> = [];
  const maxAttempts = options.routing?.correctiveMaxAttempts ?? DEFAULT_CORRECTIVE_MAX_ATTEMPTS;

  while (attempt <= maxAttempts) {
    const candidates = await retrieveCandidates(
      query,
      corpus,
      activeRewrites,
      options,
      runtime,
      activeRoute
    );
    const filtered = candidates.filter(
      (candidate) => candidate.score >= (retrievalOptions.minScore ?? 0)
    );
    finalCandidates = await finalizeCandidates(
      query,
      filtered,
      options,
      runtime,
      diagnostics
    );

    const shouldAssessRetry =
      activeRoute === "corrective" ||
      activeRoute === "hierarchical-retrieval" ||
      (activeRoute === "retrieval" && Boolean(corpus.analysis?.hierarchicalIndex));

    if (!shouldAssessRetry) {
      break;
    }

    const assessment = assessCoreCorrectiveNeed(query, finalCandidates, {
      minAverageScore:
        activeRoute === "hierarchical-retrieval"
          ? DEFAULT_CORRECTIVE_MIN_SCORE + 0.05
          : DEFAULT_CORRECTIVE_MIN_SCORE,
      minAspectCoverage: DEFAULT_CORRECTIVE_MIN_ASPECT_COVERAGE,
      minEntryCount: Math.min(
        2,
        retrievalOptions.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS
      ),
    });
    diagnostics.notes?.push(
      `Corrective assessment attempt ${attempt + 1} on ${activeRoute}: retry=${assessment.shouldRetry}, coverage=${assessment.matchedAspectCount}/${assessment.totalAspectCount}, avgScore=${assessment.averageScore.toFixed(2)}.`
    );

    if (!assessment.shouldRetry || attempt >= maxAttempts) {
      break;
    }

    activeRewrites = buildCoreCorrectiveQueryPlan(
      query,
      Math.max(retrievalOptions.multiQueryCount ?? DEFAULT_MULTI_QUERY_COUNT, 4)
    ).rewrites;
    warnings = mergeWarnings(warnings, assessment.reasons);

    if (activeRoute === "retrieval" && corpus.analysis?.hierarchicalIndex) {
      diagnostics.notes?.push(
        "Weak retrieval evidence triggered a hierarchical corrective retry."
      );
      activeRoute = "hierarchical-retrieval";
    } else if (activeRoute === "hierarchical-retrieval") {
      diagnostics.notes?.push(
        "Weak hierarchical evidence triggered a corrective retry with expanded rewrites."
      );
    } else {
      diagnostics.notes?.push(
        "Weak evidence triggered a corrective retry with expanded rewrites."
      );
      activeRoute = "corrective";
    }

    attempt += 1;
  }

  const evidence = await emitEvidence(finalCandidates, options, runtime);

  return {
    route: activeRoute,
    candidates: finalCandidates,
    evidence,
    unsupportedClaimWarnings: warnings,
  };
}

async function finalizeCandidates(
  query: string,
  candidates: Array<RagCandidate>,
  options: RagRequestOptions,
  runtime: RagOrchestratorRuntime,
  diagnostics: RagDiagnostics
): Promise<Array<RagCandidate>> {
  const rerankStrategy = options.rerank?.strategy ?? "heuristic-v1";
  const rerankTopK = options.rerank?.topK ?? options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS;

  const heuristic = rerankRagCandidates(query, candidates, {
    topK: rerankTopK,
    strategy: rerankStrategy,
  }).map((ranked) => ({
    ...ranked.candidate,
    score: ranked.rerankScore,
  }));

  let rerankedCandidates = heuristic.length > 0 ? heuristic : candidates;

  if (runtime.llmReranker && rerankStrategy === "heuristic-then-llm") {
    const llmRerankResult = await runtime.llmReranker.rerank({
      query,
      candidates: rerankedCandidates,
      options,
    });
    rerankedCandidates = llmRerankResult.candidates;
    diagnostics.notes?.push(...(llmRerankResult.notes ?? []));
  }

  return dedupeRagCandidates(
    rerankedCandidates,
    options.retrieval?.dedupeSimilarityThreshold ?? DEFAULT_DEDUPE_THRESHOLD,
    options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS
  );
}

async function retrieveCandidates(
  query: string,
  corpus: RagLoadedCorpus,
  rewrites: Array<RagQueryRewrite>,
  options: RagRequestOptions,
  runtime: RagOrchestratorRuntime,
  route?: RagExecutionRoute
): Promise<Array<RagCandidate>> {
  if (corpus.candidates && corpus.candidates.length > 0) {
    return corpus.candidates.slice(0, options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS);
  }

  if (route === "hierarchical-retrieval") {
    const maxCandidates = options.retrieval?.maxCandidates ?? DEFAULT_MAX_CANDIDATES;
    if (rewrites.length <= 1) {
      return hierarchicalRetrieveFromDocuments(
        query,
        corpus.documents,
        maxCandidates,
        {
          maxParentDocuments: Math.max(2, Math.min(4, options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS)),
          maxChildChunksPerDocument: Math.max(3, options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS),
          hierarchicalIndex: corpus.analysis?.hierarchicalIndex,
        }
      );
    }

    const retrievalRuns = rewrites.map((rewrite) =>
      hierarchicalRetrieveFromDocuments(rewrite.text, corpus.documents, maxCandidates, {
        maxParentDocuments: Math.max(2, Math.min(4, options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS)),
        maxChildChunksPerDocument: Math.max(3, options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS),
        hierarchicalIndex: corpus.analysis?.hierarchicalIndex,
      })
    );

    return fuseRagCandidates(
      retrievalRuns,
      options.retrieval?.fusionMethod ?? "reciprocal-rank-fusion",
      maxCandidates
    );
  }

  if (runtime.semanticRetriever) {
    return runtime.semanticRetriever.search({
      query,
      rewrites,
      corpus,
      options,
      retrieval: options.retrieval,
    });
  }

  if (rewrites.length <= 1) {
    return runtime.retriever.search({
      query,
      corpus,
      options: options.retrieval,
    });
  }

  const retrievalRuns = await Promise.all(
    rewrites.map((rewrite) =>
      runtime.retriever.search({
        query: rewrite.text,
        corpus,
        options: options.retrieval,
      })
    )
  );

  return fuseRagCandidates(
    retrievalRuns,
    options.retrieval?.fusionMethod ?? "reciprocal-rank-fusion",
    options.retrieval?.maxCandidates ?? DEFAULT_MAX_CANDIDATES
  );
}

async function emitEvidence(
  candidates: Array<RagCandidate>,
  options: RagRequestOptions,
  runtime: RagOrchestratorRuntime
): Promise<Array<RagEvidenceBlock>> {
  const emitted = runtime.citationEmitter
    ? await runtime.citationEmitter.emit({ candidates, options })
    : buildRagEvidenceBlocks(candidates);

  return sanitizeCoreEvidenceBlocks(emitted, {
    sanitizeRetrievedText: options.safety?.sanitizeRetrievedText ?? false,
    stripInstructionalSpans: options.safety?.stripInstructionalSpans ?? false,
  });
}

async function shapeOutput(
  query: string,
  corpus: RagLoadedCorpus,
  candidates: Array<RagCandidate>,
  evidence: Array<RagEvidenceBlock>,
  route: RagExecutionRoute,
  options: RagRequestOptions,
  diagnostics: RagDiagnostics,
  unsupportedClaimWarnings: Array<string>,
  runtime: RagOrchestratorRuntime
): Promise<RagOrchestratorOutput> {
  const preparedPrompt = buildPreparedPrompt(query, route, evidence, options.policy?.groundingMode ?? "warn-on-weak-evidence");

  if (options.outputMode === "prepared-prompt") {
    return {
      mode: "prepared-prompt",
      route,
      preparedPrompt,
      evidence,
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  if (options.outputMode === "search-results") {
    return {
      mode: "search-results",
      route,
      candidates,
      evidence,
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  const composed = await runtime.answerComposer.answer({
    query,
    corpus,
    evidence,
    route,
    groundingMode: options.policy?.groundingMode,
    options,
  });

  return {
    mode: "answer-envelope",
    route,
    answer: composed.answer,
    preparedPrompt,
    evidence,
    diagnostics,
    unsupportedClaimWarnings: mergeWarnings(unsupportedClaimWarnings, composed.unsupportedClaimWarnings),
    confidence: composed.confidence,
    groundingMode: options.policy?.groundingMode,
  } satisfies RagAnswerEnvelopeOutput;
}

function buildRewrites(query: string, retrievalOptions: RagRetrievalOptions): Array<RagQueryRewrite> {
  if (!retrievalOptions.multiQueryEnabled) {
    return [{ label: "original", text: query }];
  }

  return generateCoreQueryRewrites(
    query,
    retrievalOptions.multiQueryCount ?? DEFAULT_MULTI_QUERY_COUNT
  );
}

function buildPreparedPrompt(
  query: string,
  route: RagExecutionRoute,
  evidence: Array<RagEvidenceBlock>,
  groundingMode: RagGroundingMode
) {
  const groundingInstruction = buildCoreGroundingInstruction(groundingMode);
  if (evidence.length === 0) {
    return [
      groundingInstruction,
      `Route: ${route}`,
      `User Query:\n${query}`,
      "No evidence was retrieved.",
    ].join("\n\n");
  }

  return [
    groundingInstruction,
    `Route: ${route}`,
    `User Query:\n${query}`,
    "Grounded Evidence:",
    evidence
      .map(
        (block) =>
          `${block.label} (file: ${block.fileName}, score: ${block.score.toFixed(3)}):\n${block.content}`
      )
      .join("\n\n"),
  ].join("\n\n");
}

function buildFullContextPrompt(
  query: string,
  corpus: RagLoadedCorpus,
  groundingMode: RagGroundingMode
) {
  return [
    buildCoreGroundingInstruction(groundingMode),
    `User Query:\n${query}`,
    "Attached Document Context:",
    corpus.documents
      .map((document) => `# ${document.name}\n${document.content}`)
      .join("\n\n"),
  ].join("\n\n");
}

function shapeNoRetrievalOutput(
  query: string,
  corpus: RagLoadedCorpus,
  options: RagRequestOptions,
  diagnostics: RagDiagnostics,
  unsupportedClaimWarnings: Array<string>
): RagOrchestratorOutput {
  const preparedPrompt = buildFullContextPrompt(
    query,
    corpus,
    options.policy?.groundingMode ?? "warn-on-weak-evidence"
  );

  if (options.outputMode === "prepared-prompt") {
    return {
      mode: "prepared-prompt",
      route: "no-retrieval",
      preparedPrompt,
      evidence: [],
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  if (options.outputMode === "search-results") {
    return {
      mode: "search-results",
      route: "no-retrieval",
      candidates: [],
      evidence: [],
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  return {
    mode: "answer-envelope",
    route: "no-retrieval",
    preparedPrompt,
    evidence: [],
    diagnostics,
    unsupportedClaimWarnings,
  };
}

function normalizeRequestOptions(
  options: RagRequestOptions | undefined,
  outputMode: RagOutputMode,
  requestedRoute?: RagRequestedRoute
): RagRequestOptions {
  return {
    policy: {
      groundingMode: options?.policy?.groundingMode ?? "warn-on-weak-evidence",
      answerabilityGateEnabled: options?.policy?.answerabilityGateEnabled ?? false,
      answerabilityGateThreshold: options?.policy?.answerabilityGateThreshold ?? 0.7,
      ambiguousQueryBehavior: options?.policy?.ambiguousQueryBehavior ?? "ask-for-clarification",
    },
    routing: {
      requestedRoute: options?.routing?.requestedRoute ?? requestedRoute ?? "auto",
      fullContextTokenLimit: options?.routing?.fullContextTokenLimit ?? DEFAULT_FULL_CONTEXT_TOKEN_LIMIT,
      activeModelContextTokens: options?.routing?.activeModelContextTokens,
      correctiveEnabled: options?.routing?.correctiveEnabled ?? requestedRoute === "corrective",
      correctiveMaxAttempts: options?.routing?.correctiveMaxAttempts ?? DEFAULT_CORRECTIVE_MAX_ATTEMPTS,
    },
    retrieval: {
      multiQueryEnabled: options?.retrieval?.multiQueryEnabled ?? false,
      multiQueryCount: options?.retrieval?.multiQueryCount ?? DEFAULT_MULTI_QUERY_COUNT,
      fusionMethod: options?.retrieval?.fusionMethod ?? "reciprocal-rank-fusion",
      hybridEnabled: options?.retrieval?.hybridEnabled ?? false,
      maxCandidates: options?.retrieval?.maxCandidates ?? DEFAULT_MAX_CANDIDATES,
      maxEvidenceBlocks: options?.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS,
      minScore: options?.retrieval?.minScore ?? 0,
      dedupeSimilarityThreshold: options?.retrieval?.dedupeSimilarityThreshold ?? DEFAULT_DEDUPE_THRESHOLD,
    },
    rerank: {
      enabled: options?.rerank?.enabled ?? true,
      strategy: (options?.rerank?.strategy ?? "heuristic-v1") as RagRerankStrategy,
      topK: options?.rerank?.topK ?? options?.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS,
    },
    safety: {
      sanitizeRetrievedText: options?.safety?.sanitizeRetrievedText ?? false,
      stripInstructionalSpans: options?.safety?.stripInstructionalSpans ?? false,
      requireEvidence: options?.safety?.requireEvidence ?? false,
    },
    outputMode,
  };
}

function normalizeRequestedRoute(route: RagRequestedRoute): RagExecutionRoute {
  if (route === "auto") {
    return "retrieval";
  }
  return route;
}

function collectRuntimeCapabilities(runtime: RagOrchestratorRuntime) {
  const capabilities = ["loader", "retriever", "answerComposer", "inspector"];
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

function mergeWarnings(
  left: Array<string>,
  right: Array<string> | undefined
): Array<string> {
  return [...new Set([...left, ...(right ?? [])])];
}

function castOutput<TMode extends RagOutputMode>(
  output: RagOrchestratorOutput,
  _mode: TMode
): RagOutputForMode<TMode> {
  return output as RagOutputForMode<TMode>;
}
