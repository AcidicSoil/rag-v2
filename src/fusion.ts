import type { RetrievalFusionMethod } from "./types/retrieval";

interface RetrievalEntry {
  score: number;
  content: string;
  source?: {
    fileName?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

function buildEntryKey(entry: RetrievalEntry) {
  const fileName = entry.source?.fileName ?? "unknown";
  const content = entry.content.trim().toLowerCase();
  return `${fileName}::${content}`;
}

export function fuseRetrievalEntries(
  retrievalRuns: Array<Array<RetrievalEntry>>,
  method: RetrievalFusionMethod,
  limit: number
): RetrievalEntry[] {
  const fusedEntries = new Map<
    string,
    {
      entry: RetrievalEntry;
      fusedScore: number;
      bestScore: number;
    }
  >();

  retrievalRuns.forEach((entries) => {
    entries.forEach((entry, index) => {
      const key = buildEntryKey(entry);
      const existing = fusedEntries.get(key);
      const reciprocalRankScore = 1 / (index + 1);

      if (!existing) {
        fusedEntries.set(key, {
          entry,
          fusedScore: reciprocalRankScore,
          bestScore: entry.score,
        });
        return;
      }

      existing.bestScore = Math.max(existing.bestScore, entry.score);
      existing.fusedScore += reciprocalRankScore;
      if (entry.score > existing.entry.score) {
        existing.entry = entry;
      }
    });
  });

  const scoredEntries = [...fusedEntries.values()].map((value) => ({
    entry: {
      ...value.entry,
      score: method === "max-score" ? value.bestScore : value.fusedScore,
    },
    sortScore: method === "max-score" ? value.bestScore : value.fusedScore,
  }));

  scoredEntries.sort((left, right) => right.sortScore - left.sortScore);

  return scoredEntries.slice(0, limit).map((value) => value.entry);
}
