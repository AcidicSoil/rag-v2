export type RagFusionMethod = "reciprocal-rank-fusion" | "max-score";

export type RagRerankStrategy = "heuristic-v1" | "heuristic-then-llm";

export interface RagDocument {
  id: string;
  name: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface RagCandidate {
  sourceId: string;
  sourceName: string;
  content: string;
  score: number;
  metadata?: Record<string, unknown>;
}

export interface RagEvidenceBlock {
  label: string;
  fileName: string;
  content: string;
  score: number;
  candidate: RagCandidate;
}

export interface RagRankFeatures {
  lexicalOverlap: number;
  headingMatch: number;
  completeness: number;
  sectionRelevance: number;
  diversityPenalty: number;
}

export interface RagRankedCandidate {
  candidate: RagCandidate;
  originalScore: number;
  rerankScore: number;
  features: RagRankFeatures;
}
