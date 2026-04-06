import type { RetrievalResultEntry } from "@lmstudio/sdk";
import type { RagCandidate } from "../../core/src/contracts";

export function toRagCandidates(
  entries: Array<RetrievalResultEntry>
): Array<RagCandidate> {
  return entries.map((entry) => ({
    sourceId: entry.source.identifier,
    sourceName: entry.source.name,
    content: entry.content,
    score: entry.score,
    metadata: {
      source: entry.source,
      entry,
    },
  }));
}

export function toRetrievalResultEntries(
  candidates: Array<RagCandidate>
): Array<RetrievalResultEntry> {
  return candidates.map((candidate) => {
    const originalEntry = candidate.metadata?.entry;
    if (isRetrievalResultEntry(originalEntry)) {
      return {
        ...originalEntry,
        content: candidate.content,
        score: candidate.score,
      };
    }

    const source = candidate.metadata?.source;
    if (!source || typeof source !== "object") {
      throw new Error(
        `Cannot convert candidate for ${candidate.sourceName} back into an LM Studio retrieval entry without source metadata.`
      );
    }

    return {
      content: candidate.content,
      score: candidate.score,
      source: source as RetrievalResultEntry["source"],
    };
  });
}

function isRetrievalResultEntry(value: unknown): value is RetrievalResultEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as RetrievalResultEntry;
  return (
    typeof candidate.content === "string" &&
    typeof candidate.score === "number" &&
    !!candidate.source &&
    typeof candidate.source.identifier === "string"
  );
}
