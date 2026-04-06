import type { RagCandidate, RagDocument, RagEvidenceBlock } from "./contracts";
import type { RagQueryRewrite } from "./policyContracts";
import type {
  RagAnswerEnvelopeOutput,
  RagDiagnostics,
  RagExecutionRoute,
  RagOrchestratorOutput,
} from "./outputContracts";
import type {
  RagGroundingMode,
  RagOutputMode,
  RagRequestOptions,
  RagRequestedRoute,
  RagRetrievalOptions,
} from "./requestOptions";

export interface RagInlineDocumentInput {
  id: string;
  name: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RagPrechunkedCandidateInput {
  sourceId: string;
  sourceName: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RagAnswerRequest {
  query: string;
  documents?: Array<RagInlineDocumentInput>;
  paths?: Array<string>;
  chunks?: Array<RagPrechunkedCandidateInput>;
  mode?: RagRequestedRoute;
  groundingMode?: RagGroundingMode;
  retrieval?: RagRetrievalOptions;
  options?: RagRequestOptions;
}

export interface RagSearchRequest {
  query: string;
  documents?: Array<RagInlineDocumentInput>;
  paths?: Array<string>;
  chunks?: Array<RagPrechunkedCandidateInput>;
  retrieval?: RagRetrievalOptions;
  options?: RagRequestOptions;
}

export interface RagPreparePromptRequest {
  query: string;
  documents?: Array<RagInlineDocumentInput>;
  paths?: Array<string>;
  chunks?: Array<RagPrechunkedCandidateInput>;
  mode?: RagRequestedRoute;
  groundingMode?: RagGroundingMode;
  retrieval?: RagRetrievalOptions;
  options?: RagRequestOptions;
}

export interface CorpusInspectRequest {
  documents?: Array<RagInlineDocumentInput>;
  paths?: Array<string>;
  chunks?: Array<RagPrechunkedCandidateInput>;
}

export interface RerankOnlyRequest {
  query: string;
  candidates: Array<RagPrechunkedCandidateInput>;
  topK?: number;
}

export interface FileSystemBrowseRequest {
  path: string;
  recursive?: boolean;
  maxDepth?: number;
  maxEntries?: number;
  includeHidden?: boolean;
}

export interface FileSystemBrowseEntry {
  path: string;
  name: string;
  type: "file" | "directory";
  sizeBytes?: number;
  extension?: string;
}

export interface RagAnswerEvidence {
  label: string;
  fileName: string;
  content: string;
  score: number;
}

export interface RagAnswerResponse {
  answer: string;
  route: string;
  confidence?: number;
  evidence: Array<RagAnswerEvidence>;
  unsupportedClaimWarnings: Array<string>;
}

export interface RagSearchResponse {
  candidates: Array<RagPrechunkedCandidateInput>;
  route?: string;
}

export interface RagPreparePromptResponse {
  route: RagExecutionRoute;
  preparedPrompt: string;
  evidence: Array<RagAnswerEvidence>;
  diagnostics: RagDiagnostics;
  unsupportedClaimWarnings: Array<string>;
}

export interface CorpusInspectResponse {
  fileCount: number;
  chunkCount?: number;
  estimatedTokens?: number;
  recommendedRoute: string;
  fullContextViable: boolean;
  retrievalRecommended: boolean;
}

export interface RerankOnlyResponse {
  candidates: Array<RagPrechunkedCandidateInput>;
  reasons?: Array<string>;
}

export interface FileSystemBrowseResponse {
  requestedPath: string;
  resolvedPath: string;
  cwd: string;
  exists: boolean;
  type?: "file" | "directory";
  entries: Array<FileSystemBrowseEntry>;
  truncated: boolean;
  errors?: Array<string>;
}

export interface RagLoadedCorpus {
  documents: Array<RagDocument>;
  candidates?: Array<RagCandidate>;
  fileCount: number;
  estimatedTokens?: number;
  chunkCount?: number;
}


export interface RagDocumentParser {
  parse(input: {
    documents?: Array<RagInlineDocumentInput>;
    paths?: Array<string>;
    chunks?: Array<RagPrechunkedCandidateInput>;
  }): Promise<RagLoadedCorpus>;
}

export interface RagEmbeddingModelResolution {
  modelId?: string;
  source: "manual" | "configured" | "auto-detected" | "unavailable";
  autoUnload?: boolean;
}

export interface RagEmbeddingModelResolver {
  resolve(input: { options?: RagRequestOptions }): Promise<RagEmbeddingModelResolution>;
}

export interface RagSemanticRetriever {
  search(input: {
    query: string;
    rewrites?: Array<RagQueryRewrite>;
    corpus: RagLoadedCorpus;
    options?: RagRequestOptions;
    retrieval?: RagRetrievalOptions;
  }): Promise<Array<RagCandidate>>;
}

export interface RagLlmRerankResult {
  candidates: Array<RagCandidate>;
  notes?: Array<string>;
}

export interface RagLlmReranker {
  rerank(input: {
    query: string;
    candidates: Array<RagCandidate>;
    options?: RagRequestOptions;
  }): Promise<RagLlmRerankResult>;
}

export interface RagContextSizingResult {
  fullContextViable: boolean;
  estimatedTokens?: number;
  remainingTokens?: number;
  recommendedRoute?: RagExecutionRoute;
}

export interface RagContextSizer {
  measure(input: {
    query: string;
    corpus: RagLoadedCorpus;
    options?: RagRequestOptions;
  }): Promise<RagContextSizingResult>;
}

export interface RagCitationEmitter {
  emit(input: {
    candidates: Array<RagCandidate>;
    options?: RagRequestOptions;
  }): Promise<Array<RagEvidenceBlock>>;
}

export interface RagAnswerComposer {
  answer(input: {
    query: string;
    corpus: RagLoadedCorpus;
    evidence: Array<RagEvidenceBlock>;
    route: RagExecutionRoute;
    groundingMode?: RagGroundingMode;
    options?: RagRequestOptions;
  }): Promise<Pick<RagAnswerEnvelopeOutput, "answer" | "confidence" | "unsupportedClaimWarnings">>;
}

export interface RagPolicyDecision {
  allowed: boolean;
  route?: RagExecutionRoute;
  notes?: Array<string>;
  unsupportedClaimWarnings?: Array<string>;
}

export interface RagPolicyEngine {
  evaluate(input: {
    query: string;
    corpus: RagLoadedCorpus;
    options?: RagRequestOptions;
  }): Promise<RagPolicyDecision>;
}

export interface RagInspector {
  inspect(input: { corpus: RagLoadedCorpus }): Promise<CorpusInspectResponse>;
}

export interface RagFileSystemBrowser {
  browse(input: FileSystemBrowseRequest): Promise<FileSystemBrowseResponse>;
}

export interface RagDocumentLoader {
  load(input: {
    documents?: Array<RagInlineDocumentInput>;
    paths?: Array<string>;
    chunks?: Array<RagPrechunkedCandidateInput>;
  }): Promise<RagLoadedCorpus>;
}

export interface RagRetriever {
  search(input: {
    query: string;
    corpus: RagLoadedCorpus;
    options?: RagRetrievalOptions;
  }): Promise<Array<RagCandidate>>;
}

export interface RagMcpRuntime {
  loader: RagDocumentLoader;
  retriever: RagRetriever;
  answerComposer: RagAnswerComposer;
  inspector: RagInspector;
  browser: RagFileSystemBrowser;
  documentParser?: RagDocumentParser;
  embeddingModelResolver?: RagEmbeddingModelResolver;
  semanticRetriever?: RagSemanticRetriever;
  llmReranker?: RagLlmReranker;
  contextSizer?: RagContextSizer;
  citationEmitter?: RagCitationEmitter;
  policyEngine?: RagPolicyEngine;
}

export interface RagOrchestratorRuntime extends RagMcpRuntime {
  documentParser?: RagDocumentParser;
}

export interface RagOrchestratorRequest {
  query: string;
  documents?: Array<RagInlineDocumentInput>;
  paths?: Array<string>;
  chunks?: Array<RagPrechunkedCandidateInput>;
  requestedRoute?: RagRequestedRoute;
  options?: RagRequestOptions;
  outputMode: RagOutputMode;
}

export interface RagToolHandlerSet {
  ragAnswer(input: RagAnswerRequest): Promise<RagAnswerResponse>;
  ragSearch(input: RagSearchRequest): Promise<RagSearchResponse>;
  ragPreparePrompt(input: RagPreparePromptRequest): Promise<RagPreparePromptResponse>;
  corpusInspect(input: CorpusInspectRequest): Promise<CorpusInspectResponse>;
  rerankOnly(input: RerankOnlyRequest): Promise<RerankOnlyResponse>;
  filesystemBrowse(input: FileSystemBrowseRequest): Promise<FileSystemBrowseResponse>;
}

export interface RagOrchestrator {
  run(request: RagOrchestratorRequest, runtime: RagOrchestratorRuntime): Promise<RagOrchestratorOutput>;
}
