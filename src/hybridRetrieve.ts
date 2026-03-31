import type { RetrievalResultEntry } from "@lmstudio/sdk";

export function mergeHybridCandidates(
  semanticEntries: Array<RetrievalResultEntry>,
  lexicalEntries: Array<RetrievalResultEntry>,
  options: {
    semanticWeight: number;
    lexicalWeight: number;
    maxCandidates: number;
  }
): Array<RetrievalResultEntry> {
  const semanticMax = Math.max(...semanticEntries.map((entry) => entry.score), 1);
  const lexicalMax = Math.max(...lexicalEntries.map((entry) => entry.score), 1);
  const merged = new Map<string, RetrievalResultEntry>();

  for (const entry of semanticEntries) {
    const key = buildEntryKey(entry);
    const weighted = {
      ...entry,
      score: (entry.score / semanticMax) * options.semanticWeight,
    };
    merged.set(key, weighted);
  }

  for (const entry of lexicalEntries) {
    const key = buildEntryKey(entry);
    const lexicalWeightedScore = (entry.score / lexicalMax) * options.lexicalWeight;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...entry,
        score: lexicalWeightedScore,
      });
      continue;
    }

    merged.set(key, {
      ...existing,
      score: existing.score + lexicalWeightedScore,
    });
  }

  return Array.from(merged.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, options.maxCandidates);
}

function buildEntryKey(entry: RetrievalResultEntry): string {
  return `${entry.source.identifier}::${normalizeWhitespace(entry.content).toLowerCase()}`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
