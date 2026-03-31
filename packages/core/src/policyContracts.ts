export interface RagFileRef {
  id: string;
  name: string;
}

export type RagAnswerabilityGateDecision =
  | "no-retrieval-needed"
  | "retrieval-useful"
  | "likely-unanswerable"
  | "ambiguous";

export type RagAmbiguousQueryBehavior =
  | "ask-clarification"
  | "attempt-best-effort";

export interface RagAnswerabilityGateResult {
  decision: RagAnswerabilityGateDecision;
  confidence: number;
  reasons: string[];
}

export interface RagQueryRewrite {
  label: string;
  text: string;
}

export interface RagCorrectiveAssessment {
  shouldRetry: boolean;
  reasons: string[];
  averageScore: number;
  aspectCoverage: number;
  entryCount: number;
  matchedAspectCount: number;
  totalAspectCount: number;
}

export interface RagCorrectiveAssessmentOptions {
  minAverageScore: number;
  minAspectCoverage: number;
  minEntryCount: number;
}

export interface RagCorrectiveRewritePlan {
  rewrites: RagQueryRewrite[];
  aspects: string[];
}

export interface RagSafetySanitizationOptions {
  sanitizeRetrievedText: boolean;
  stripInstructionalSpans: boolean;
}

export type RagStrictGroundingMode =
  | "off"
  | "warn-on-weak-evidence"
  | "require-evidence";
