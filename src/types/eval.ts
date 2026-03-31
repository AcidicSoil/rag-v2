export type EvalComponent = "gate" | "rewrite" | "evidence" | "safety" | "rerank";

export interface EvalCase {
  id: string;
  component: EvalComponent;
  input: Record<string, unknown>;
  expected: Record<string, unknown>;
}
