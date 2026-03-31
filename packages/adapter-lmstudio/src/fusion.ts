import type { RetrievalResultEntry } from "@lmstudio/sdk";
import type { RetrievalFusionMethod } from "./types/retrieval";

function buildEntryKey(entry: RetrievalResultEntry) {
  const fileName = entry.source.name ?? entry.source.identifier;
  const content = entry.content.trim().toLowerCase();
  return `${fileName}::${content}`;
}

export function fuseRetrievalEntries(
  retrievalRuns: Array<Array<RetrievalResultEntry>>,
  method: RetrievalFusionMethod,
  limit: number
): Array<RetrievalResultEntry> {
  const fusedEntries = new Map<
    string,
    {
      entry: RetrievalResultEntry;
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
