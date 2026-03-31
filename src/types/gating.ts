export type AnswerabilityGateDecision =
  | "no-retrieval-needed"
  | "retrieval-useful"
  | "likely-unanswerable"
  | "ambiguous";

export type AmbiguousQueryBehavior = "ask-clarification" | "attempt-best-effort";

export interface AnswerabilityGateResult {
  decision: AnswerabilityGateDecision;
  confidence: number;
  reasons: string[];
}
