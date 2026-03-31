import type { RagCandidate, RagDocument, RagEvidenceBlock } from "./contracts";

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

export type RagGroundingMode =
  | "off"
  | "warn-on-weak-evidence"
  | "require-evidence";

export interface RagRetrievalOverrides {
  multiQueryEnabled?: boolean;
  multiQueryCount?: number;
  fusionMethod?: "reciprocal-rank-fusion" | "max-score";
  hybridEnabled?: boolean;
  rerankEnabled?: boolean;
  rerankTopK?: number;
  maxEvidenceBlocks?: number;
}

export interface RagAnswerRequest {
  query: string;
  documents?: Array<RagInlineDocumentInput>;
  paths?: Array<string>;
  chunks?: Array<RagPrechunkedCandidateInput>;
  mode?: "auto" | "full-context" | "retrieval" | "corrective";
  groundingMode?: RagGroundingMode;
  retrieval?: RagRetrievalOverrides;
}

export interface RagSearchRequest {
  query: string;
  documents?: Array<RagInlineDocumentInput>;
  paths?: Array<string>;
  chunks?: Array<RagPrechunkedCandidateInput>;
  retrieval?: RagRetrievalOverrides;
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

export interface RagLoadedCorpus {
  documents: Array<RagDocument>;
  candidates?: Array<RagCandidate>;
  fileCount: number;
  estimatedTokens?: number;
  chunkCount?: number;
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
    options?: RagRetrievalOverrides;
  }): Promise<Array<RagCandidate>>;
}

export interface RagAnswerComposer {
  answer(input: {
    query: string;
    corpus: RagLoadedCorpus;
    evidence: Array<RagEvidenceBlock>;
    route: string;
    groundingMode?: RagGroundingMode;
  }): Promise<Pick<RagAnswerResponse, "answer" | "confidence" | "unsupportedClaimWarnings">>;
}

export interface RagInspector {
  inspect(input: { corpus: RagLoadedCorpus }): Promise<CorpusInspectResponse>;
}

export interface RagMcpRuntime {
  loader: RagDocumentLoader;
  retriever: RagRetriever;
  answerComposer: RagAnswerComposer;
  inspector: RagInspector;
}

export interface RagToolHandlerSet {
  ragAnswer(input: RagAnswerRequest): Promise<RagAnswerResponse>;
  ragSearch(input: RagSearchRequest): Promise<RagSearchResponse>;
  corpusInspect(input: CorpusInspectRequest): Promise<CorpusInspectResponse>;
  rerankOnly(input: RerankOnlyRequest): Promise<RerankOnlyResponse>;
}
