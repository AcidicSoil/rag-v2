import type { RagFusionMethod, RagRerankStrategy } from "./contracts";

export type RagGroundingMode =
  | "off"
  | "warn-on-weak-evidence"
  | "require-evidence";

export type RagRequestedRoute =
  | "auto"
  | "no-retrieval"
  | "full-context"
  | "retrieval"
  | "corrective"
  | "sample"
  | "hierarchical-retrieval"
  | "global-summary";

export type RagOutputMode =
  | "prepared-prompt"
  | "search-results"
  | "answer-envelope";

export interface RagPolicyOptions {
  groundingMode?: RagGroundingMode;
  answerabilityGateEnabled?: boolean;
  answerabilityGateThreshold?: number;
  ambiguousQueryBehavior?: "proceed" | "ask-for-clarification" | "warn";
}

export interface RagRoutingOptions {
  requestedRoute?: RagRequestedRoute;
  fullContextTokenLimit?: number;
  activeModelContextTokens?: number;
  correctiveEnabled?: boolean;
  correctiveMaxAttempts?: number;
}

export interface RagRetrievalOptions {
  multiQueryEnabled?: boolean;
  multiQueryCount?: number;
  fusionMethod?: RagFusionMethod;
  hybridEnabled?: boolean;
  maxCandidates?: number;
  maxEvidenceBlocks?: number;
  minScore?: number;
  dedupeSimilarityThreshold?: number;
}

export type RagRerankModelSource =
  | "active-chat-model"
  | "auto-detect"
  | "manual-model-id";

export interface RagRerankOptions {
  enabled?: boolean;
  strategy?: RagRerankStrategy;
  topK?: number;
  modelSource?: RagRerankModelSource;
  modelId?: string;
}

export interface RagSafetyOptions {
  sanitizeRetrievedText?: boolean;
  stripInstructionalSpans?: boolean;
  requireEvidence?: boolean;
}

export interface RagRequestOptions {
  policy?: RagPolicyOptions;
  routing?: RagRoutingOptions;
  retrieval?: RagRetrievalOptions;
  rerank?: RagRerankOptions;
  safety?: RagSafetyOptions;
  outputMode?: RagOutputMode;
}
