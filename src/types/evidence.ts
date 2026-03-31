import type { RetrievalResultEntry } from "@lmstudio/sdk";

export interface EvidenceBlock {
  label: string;
  fileName: string;
  content: string;
  score: number;
  entry: RetrievalResultEntry;
}
