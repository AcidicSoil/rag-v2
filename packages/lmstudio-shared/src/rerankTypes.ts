import type { RetrievalResultEntry } from "@lmstudio/sdk";

export const rerankStrategies = [
  "heuristic-v1",
  "heuristic-then-llm",
] as const;

export type RerankStrategy = (typeof rerankStrategies)[number];

export interface RerankOptions {
  topK: number;
  strategy: RerankStrategy;
}

export interface ModelRerankScore {
  index: number;
  relevance: number;
  rationale?: string;
}

export interface RankedRetrievalEntry {
  entry: RetrievalResultEntry;
  originalScore: number;
  rerankScore: number;
  features: {
    lexicalOverlap: number;
    headingMatch: number;
    completeness: number;
    sectionRelevance: number;
    diversityPenalty: number;
  };
}
