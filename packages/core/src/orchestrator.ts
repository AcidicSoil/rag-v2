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
import { analyzeLargeCorpus, analyzeLargeDocumentCorpus } from "./largeCorpus";
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

  const analysis = request.paths?.length
    ? await analyzeLargeCorpus(
        request.paths,
        request.query,
        baseCorpus,
        runtime.browser,
        runtime.largeCorpusAnalysisStore,
        runtime.hierarchicalIndexStore
      )
    : analyzeLargeDocumentCorpus(request.query, baseCorpus);
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
  const selectedSummaryDocuments = selectSummaryDocumentsForQuery(
    query,
    summaryDocuments,
    options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS
  );
  if (selectedSummaryDocuments.length !== summaryDocuments.length) {
    diagnostics.notes?.push(
      `Selected ${selectedSummaryDocuments.length}/${summaryDocuments.length} summary documents for ${route} context.`
    );
  }

  const summaryCandidates = lexicalRetrieveFromDocuments(
    query,
    selectedSummaryDocuments,
    options.retrieval?.maxEvidenceBlocks ?? DEFAULT_MAX_EVIDENCE_BLOCKS
  );
  const fallbackSummaryCandidates =
    summaryCandidates.length > 0
      ? summaryCandidates
      : selectedSummaryDocuments.map((document, index) => ({
          sourceId: document.id,
          sourceName: document.name,
          content: document.content,
          score: Math.max(0.1, 1 - index * 0.05),
          metadata: document.metadata,
        }));
  const overviewSynthesis = buildStructuredOverviewSynthesis(
    query,
    selectedSummaryDocuments,
    fallbackSummaryCandidates
  );
  const promptSummaryDocuments = overviewSynthesis.document
    ? [overviewSynthesis.document, ...selectedSummaryDocuments]
    : selectedSummaryDocuments;
  const finalSummaryCandidates = overviewSynthesis.candidate
    ? [overviewSynthesis.candidate, ...fallbackSummaryCandidates]
    : fallbackSummaryCandidates;
  if (overviewSynthesis.candidate) {
    diagnostics.notes?.push("Built synthesized structured overview summary from selected summary documents.");
  }

  const summaryCorpus: RagLoadedCorpus = {
    ...corpus,
    documents: promptSummaryDocuments,
    estimatedTokens: promptSummaryDocuments.reduce(
      (sum, document) => sum + Math.ceil(document.content.length / 4),
      0
    ),
  };
  const preparedPrompt = buildFullContextPrompt(
    query,
    summaryCorpus,
    options.policy?.groundingMode ?? "warn-on-weak-evidence"
  );
  const summaryEvidence = buildRagEvidenceBlocks(finalSummaryCandidates);

  if (options.outputMode === "prepared-prompt") {
    return {
      mode: "prepared-prompt",
      route,
      preparedPrompt,
      evidence: summaryEvidence,
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  if (options.outputMode === "search-results") {
    return {
      mode: "search-results",
      route,
      candidates: finalSummaryCandidates,
      evidence: summaryEvidence,
      diagnostics,
      unsupportedClaimWarnings,
    };
  }

  const answer = overviewSynthesis.candidate?.content ?? [
    `Large-corpus ${route} mode selected for: ${query}`,
    corpus.analysis?.notes.join(" ") ?? "",
    ...selectedSummaryDocuments
      .slice(0, 3)
      .map((document) => `${document.name}: ${document.content}`),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    mode: "answer-envelope",
    route,
    answer,
    preparedPrompt,
    evidence: summaryEvidence,
    diagnostics,
    unsupportedClaimWarnings,
    confidence: promptSummaryDocuments.length > 0 ? 0.6 : 0.2,
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
  const rerankEnabled = options.rerank?.enabled ?? true;
  const rerankStrategy = options.rerank?.strategy ?? "heuristic-v1";
  const rerankTopK =
    options.rerank?.topK ??
    options.retrieval?.maxEvidenceBlocks ??
    DEFAULT_MAX_EVIDENCE_BLOCKS;

  let rerankedCandidates = candidates;

  if (rerankEnabled) {
    const heuristic = rerankRagCandidates(query, candidates, {
      topK: rerankTopK,
      strategy: rerankStrategy,
    }).map((ranked) => ({
      ...ranked.candidate,
      score: ranked.rerankScore,
    }));

    rerankedCandidates = heuristic.length > 0 ? heuristic : candidates;
    diagnostics.notes?.push(`Rerank enabled using strategy ${rerankStrategy}.`);

    if (runtime.llmReranker && rerankStrategy === "heuristic-then-llm") {
      if (runtime.rerankModelResolver) {
        const resolution = await runtime.rerankModelResolver.resolve({ options });
        diagnostics.notes?.push(
          `Resolved rerank model: ${resolution.modelId ?? "active chat model"} (${resolution.source}).`
        );
      }
      const llmRerankResult = await runtime.llmReranker.rerank({
        query,
        candidates: rerankedCandidates,
        options,
      });
      rerankedCandidates = llmRerankResult.candidates;
      diagnostics.notes?.push(...(llmRerankResult.notes ?? []));
    }
  } else {
    diagnostics.notes?.push("Rerank disabled; preserving retrieval order before dedupe.");
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

function buildStructuredOverviewSynthesis(
  query: string,
  selectedSummaryDocuments: RagLoadedCorpus["documents"],
  rankedCandidates: Array<RagCandidate>
): {
  document?: RagLoadedCorpus["documents"][number];
  candidate?: RagCandidate;
} {
  const sourceTypePriority = [
    "structured-topic-summary",
    "structured-time-summary",
    "structured-entity-summary",
    "structured-file-summary",
    "file-synopsis",
    "directory-manifest",
  ];
  const selectedByType = new Map<string, RagLoadedCorpus["documents"][number]>();

  for (const sourceType of sourceTypePriority) {
    const matchingCandidate = rankedCandidates.find(
      (candidate) => candidate.metadata?.sourceType === sourceType
    );
    const matchingDocument =
      (matchingCandidate
        ? selectedSummaryDocuments.find((document) => document.id === matchingCandidate.sourceId)
        : undefined) ??
      selectedSummaryDocuments.find((document) => document.metadata?.sourceType === sourceType);
    if (matchingDocument) {
      selectedByType.set(sourceType, matchingDocument);
    }
  }

  if (selectedByType.size < 2) {
    return {};
  }

  const synthesisLines = [
    `Structured overview synthesis for query: ${query}`,
  ];
  const supportingIds: Array<string> = [];
  const supportingNames: Array<string> = [];

  const overviewDocument = selectedByType.get("structured-file-summary") ?? selectedByType.get("file-synopsis");
  if (overviewDocument) {
    supportingIds.push(overviewDocument.id);
    supportingNames.push(overviewDocument.name);
    const overviewLines = extractSummaryHighlights(overviewDocument, 2);
    if (overviewLines.length > 0) {
      synthesisLines.push(`Overview: ${overviewLines.join(" ")}`);
    }
  }

  const topicDocument = selectedByType.get("structured-topic-summary");
  if (topicDocument) {
    supportingIds.push(topicDocument.id);
    supportingNames.push(topicDocument.name);
    const topicLines = extractSummaryHighlights(topicDocument, 2);
    if (topicLines.length > 0) {
      synthesisLines.push(`Topics: ${topicLines.join(" ")}`);
    }
  }

  const timeDocument = selectedByType.get("structured-time-summary");
  if (timeDocument) {
    supportingIds.push(timeDocument.id);
    supportingNames.push(timeDocument.name);
    const timeLines = extractSummaryHighlights(timeDocument, 2);
    if (timeLines.length > 0) {
      synthesisLines.push(`Time: ${timeLines.join(" ")}`);
    }
  }

  const entityDocument = selectedByType.get("structured-entity-summary");
  if (entityDocument) {
    supportingIds.push(entityDocument.id);
    supportingNames.push(entityDocument.name);
    const entityLines = extractSummaryHighlights(entityDocument, 3);
    if (entityLines.length > 0) {
      synthesisLines.push(`Entities: ${entityLines.join(" ")}`);
    }
  }

  const supportingSummaryNames = [...new Set(supportingNames)];
  if (supportingSummaryNames.length > 0) {
    synthesisLines.push(`Supporting summaries: ${supportingSummaryNames.join(", ")}`);
  }

  const content = synthesisLines.join("\n");
  const id = `structured-overview-synthesis:${selectedSummaryDocuments[0]?.metadata?.path ?? "summary"}`;
  const document = {
    id,
    name: `structured-overview-synthesis:${selectedSummaryDocuments[0]?.metadata?.path ?? "summary"}`,
    content,
    metadata: {
      sourceType: "structured-overview-synthesis",
      supportingSummaryIds: [...new Set(supportingIds)],
      supportingSummaryNames,
    },
  };

  return {
    document,
    candidate: {
      sourceId: document.id,
      sourceName: document.name,
      content: document.content,
      score: Math.min(1, Math.max(0.45, rankedCandidates[0]?.score ?? 0.45)),
      metadata: document.metadata,
    },
  };
}

function extractSummaryHighlights(
  document: RagLoadedCorpus["documents"][number],
  maxLines: number
): Array<string> {
  return document.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !/^Structured (file|topic|time|entity) summary for:/i.test(line) &&
        !/^Structured file:/i.test(line) &&
        !/^Format:/i.test(line) &&
        !/^Based on sampled JSONL windows/i.test(line)
    )
    .slice(0, maxLines);
}

function selectSummaryDocumentsForQuery(
  query: string,
  summaryDocuments: RagLoadedCorpus["documents"],
  maxDocuments: number
): RagLoadedCorpus["documents"] {
  if (summaryDocuments.length <= maxDocuments) {
    return summaryDocuments;
  }

  const normalizedQuery = query.toLowerCase();
  const queryHints = extractStructuredOverviewQueryHints(query);
  const topicIntent = /\b(theme|themes|topic|topics|pattern|patterns|subject|subjects|dominant)\b/i.test(query);
  const timeIntent = /\b(time|timeline|timing|when|date|dates|day|days|month|months|year|years|recent|earliest|latest|period)\b/i.test(query);
  const entityIntent = /\b(who|user|users|role|roles|conversation|conversations|session|sessions|message|messages|participant|participants|entity|entities|id|ids)\b/i.test(query);
  const inventoryIntent = /\b(overall|summary|summarize|high-level|inventory|what is in|what's in|contain|across)\b/i.test(query);

  const selected: RagLoadedCorpus["documents"] = [];
  const seen = new Set<string>();
  const addDocument = (document: RagLoadedCorpus["documents"][number] | undefined) => {
    if (!document || seen.has(document.id)) {
      return;
    }
    selected.push(document);
    seen.add(document.id);
  };

  const bySourceType = (sourceType: string) =>
    summaryDocuments.filter((document) => document.metadata?.sourceType === sourceType);

  const prioritizedSourceTypes = [
    inventoryIntent ? "structured-file-summary" : undefined,
    topicIntent || inventoryIntent || queryHints.topicTerms.length > 0 ? "structured-topic-summary" : undefined,
    timeIntent || inventoryIntent || queryHints.timeTerms.length > 0 ? "structured-time-summary" : undefined,
    entityIntent || inventoryIntent || queryHints.entityTerms.length > 0 ? "structured-entity-summary" : undefined,
    "file-synopsis",
    "directory-manifest",
  ].filter((value): value is string => Boolean(value));

  for (const sourceType of prioritizedSourceTypes) {
    const ranked = bySourceType(sourceType).sort((left, right) => {
      const leftScore = computeSummaryDocumentPreferenceScore(left, normalizedQuery, queryHints);
      const rightScore = computeSummaryDocumentPreferenceScore(right, normalizedQuery, queryHints);
      return rightScore - leftScore;
    });
    for (const document of ranked) {
      addDocument(document);
      if (selected.length >= maxDocuments) {
        return selected;
      }
    }
  }

  const lexicalDocuments = lexicalRetrieveFromDocuments(
    query,
    summaryDocuments,
    maxDocuments * 2
  )
    .map((candidate) =>
      summaryDocuments.find((document) => document.id === candidate.sourceId)
    )
    .filter((document): document is RagLoadedCorpus["documents"][number] => Boolean(document));
  for (const document of lexicalDocuments) {
    addDocument(document);
    if (selected.length >= maxDocuments) {
      return selected;
    }
  }

  for (const document of summaryDocuments) {
    addDocument(document);
    if (selected.length >= maxDocuments) {
      break;
    }
  }

  return selected;
}

function computeSummaryDocumentPreferenceScore(
  document: RagLoadedCorpus["documents"][number],
  normalizedQuery: string,
  queryHints: {
    topicTerms: Array<string>;
    timeTerms: Array<string>;
    entityTerms: Array<string>;
  }
): number {
  const sourceType = typeof document.metadata?.sourceType === "string"
    ? document.metadata.sourceType
    : "";
  const content = `${document.name}\n${document.content}`.toLowerCase();
  let score = 0;

  if (sourceType === "structured-topic-summary" && /\b(theme|themes|topic|topics|pattern|patterns|subject|subjects|dominant)\b/.test(normalizedQuery)) {
    score += 3;
  }
  if (sourceType === "structured-time-summary" && /\b(time|timeline|timing|when|date|dates|day|days|month|months|year|years|recent|earliest|latest|period)\b/.test(normalizedQuery)) {
    score += 3;
  }
  if (sourceType === "structured-entity-summary" && /\b(who|user|users|role|roles|conversation|conversations|session|sessions|message|messages|participant|participants|entity|entities|id|ids)\b/.test(normalizedQuery)) {
    score += 3;
  }
  if (sourceType === "structured-file-summary" && /\b(overall|summary|summarize|high-level|inventory|contain|across)\b/.test(normalizedQuery)) {
    score += 2;
  }
  if (sourceType === "file-synopsis") {
    score += 1;
  }

  if (sourceType === "structured-topic-summary") {
    for (const term of queryHints.topicTerms) {
      if (content.includes(term)) {
        score += 2.5;
      }
    }
  }
  if (sourceType === "structured-time-summary") {
    for (const term of queryHints.timeTerms) {
      if (content.includes(term)) {
        score += 2.5;
      }
    }
  }
  if (sourceType === "structured-entity-summary") {
    for (const term of queryHints.entityTerms) {
      if (content.includes(term)) {
        score += 2.5;
      }
    }
  }

  for (const token of normalizedQuery.split(/[^a-z0-9]+/).filter((token) => token.length > 2)) {
    if (content.includes(token)) {
      score += 0.5;
    }
  }

  return score;
}

function extractStructuredOverviewQueryHints(query: string): {
  topicTerms: Array<string>;
  timeTerms: Array<string>;
  entityTerms: Array<string>;
} {
  const normalized = query.toLowerCase();
  const topicTerms = new Set<string>();
  const timeTerms = new Set<string>();
  const entityTerms = new Set<string>();

  for (const match of normalized.matchAll(/\b(?:topic|topics|theme|themes|subject|subjects)\s+(?:in|for|about)?\s*([a-z0-9_-]{3,})/g)) {
    topicTerms.add(match[1]!);
  }
  for (const match of normalized.matchAll(/\b([a-z][a-z0-9_-]{2,})\s+(?:threads|thread|conversations|conversation|messages|message)\b/g)) {
    topicTerms.add(match[1]!);
  }
  for (const match of normalized.matchAll(/\b(?:user|users|role|roles|conversation|conversations|session|sessions|message|messages|participant|participants|entity|entities|id|ids)\s+(?:in|for|about)?\s*([a-z0-9_.:@/-]{3,})/g)) {
    entityTerms.add(match[1]!);
  }
  for (const match of normalized.matchAll(/\b([a-z]{3,9})\b/g)) {
    const monthTerm = mapMonthNameToTimeHint(match[1]!);
    if (monthTerm) {
      timeTerms.add(monthTerm);
    }
  }
  for (const match of normalized.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{4}-\d{2})\b/g)) {
    timeTerms.add(match[1]!);
  }
  if (/\brecent\b/.test(normalized)) {
    entityTerms.add("user");
    timeTerms.add("2025-");
  }

  return {
    topicTerms: [...topicTerms],
    timeTerms: [...timeTerms],
    entityTerms: [...entityTerms],
  };
}

function mapMonthNameToTimeHint(value: string): string | undefined {
  const monthMap: Record<string, string> = {
    january: "-01",
    february: "-02",
    march: "-03",
    april: "-04",
    may: "-05",
    june: "-06",
    july: "-07",
    august: "-08",
    september: "-09",
    october: "-10",
    november: "-11",
    december: "-12",
    jan: "-01",
    feb: "-02",
    mar: "-03",
    apr: "-04",
    jun: "-06",
    jul: "-07",
    aug: "-08",
    sep: "-09",
    sept: "-09",
    oct: "-10",
    nov: "-11",
    dec: "-12",
  };
  return monthMap[value];
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
  if (runtime.rerankModelResolver) {
    capabilities.push("rerankModelResolver");
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
