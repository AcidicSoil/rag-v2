import type { QueryRewrite } from "./retrieval";

export interface CorrectiveAssessment {
  shouldRetry: boolean;
  reasons: string[];
  averageScore: number;
  aspectCoverage: number;
  entryCount: number;
  matchedAspectCount: number;
  totalAspectCount: number;
}

export interface CorrectiveAssessmentOptions {
  minAverageScore: number;
  minAspectCoverage: number;
  minEntryCount: number;
}

export interface CorrectiveRewritePlan {
  rewrites: QueryRewrite[];
  aspects: string[];
}
