import type { RagCandidate, RagEvidenceBlock } from "./contracts";
import type { RagGroundingMode, RagOutputMode } from "./requestOptions";

export type RagExecutionRoute =
  | "no-retrieval"
  | "full-context"
  | "retrieval"
  | "corrective"
  | "prechunked-retrieval"
  | "lightweight-retrieval"
  | "sample"
  | "hierarchical-retrieval"
  | "global-summary";

export interface RagDiagnostics {
  route: RagExecutionRoute;
  retrievalQueries?: Array<string>;
  notes?: Array<string>;
  degraded?: boolean;
  runtimeCapabilities?: Array<string>;
}

export interface RagPreparedPromptOutput {
  mode: "prepared-prompt";
  route: RagExecutionRoute;
  preparedPrompt: string;
  evidence: Array<RagEvidenceBlock>;
  diagnostics: RagDiagnostics;
  unsupportedClaimWarnings: Array<string>;
}

export interface RagSearchResultsOutput {
  mode: "search-results";
  route: RagExecutionRoute;
  candidates: Array<RagCandidate>;
  evidence: Array<RagEvidenceBlock>;
  diagnostics: RagDiagnostics;
  unsupportedClaimWarnings: Array<string>;
}

export interface RagAnswerEnvelopeOutput {
  mode: "answer-envelope";
  route: RagExecutionRoute;
  answer?: string;
  preparedPrompt?: string;
  evidence: Array<RagEvidenceBlock>;
  diagnostics: RagDiagnostics;
  unsupportedClaimWarnings: Array<string>;
  confidence?: number;
  groundingMode?: RagGroundingMode;
}

export type RagOrchestratorOutput =
  | RagPreparedPromptOutput
  | RagSearchResultsOutput
  | RagAnswerEnvelopeOutput;

export interface RagOutputShapeMap {
  "prepared-prompt": RagPreparedPromptOutput;
  "search-results": RagSearchResultsOutput;
  "answer-envelope": RagAnswerEnvelopeOutput;
}

export type RagOutputForMode<TMode extends RagOutputMode> = RagOutputShapeMap[TMode];
