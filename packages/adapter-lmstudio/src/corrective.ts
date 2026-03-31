import type { RetrievalResultEntry } from "@lmstudio/sdk";
import {
  assessCoreCorrectiveNeed,
  buildCoreCorrectiveQueryPlan,
  extractCoreQueryAspects,
} from "../../core/src/corrective";
import { toRagCandidates } from "./lmstudioCoreBridge";
import type {
  CorrectiveAssessment,
  CorrectiveAssessmentOptions,
  CorrectiveRewritePlan,
} from "./types/corrective";

export function extractQueryAspects(prompt: string): string[] {
  return extractCoreQueryAspects(prompt);
}

export function buildCorrectiveQueryPlan(
  prompt: string,
  maxVariants: number
): CorrectiveRewritePlan {
  return buildCoreCorrectiveQueryPlan(prompt, maxVariants);
}

export function assessCorrectiveNeed(
  prompt: string,
  entries: RetrievalResultEntry[],
  options: CorrectiveAssessmentOptions
): CorrectiveAssessment {
  return assessCoreCorrectiveNeed(prompt, toRagCandidates(entries), options);
}
