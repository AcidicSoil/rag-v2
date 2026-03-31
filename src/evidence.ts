import type { RetrievalResultEntry } from "@lmstudio/sdk";
import type { EvidenceBlock } from "./types/evidence";

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function tokenize(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

function computeSimilarity(left: string, right: string) {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersectionSize++;
    }
  }

  const unionSize = new Set([...leftTokens, ...rightTokens]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
}

export function dedupeEvidenceEntries(
  entries: Array<RetrievalResultEntry>,
  threshold: number,
  maxEvidenceBlocks: number
): Array<RetrievalResultEntry> {
  const deduped: Array<RetrievalResultEntry> = [];

  for (const entry of entries) {
    const isNearDuplicate = deduped.some((existing) => {
      const sameFile = existing.source.identifier === entry.source.identifier;
      return sameFile && computeSimilarity(existing.content, entry.content) >= threshold;
    });

    if (!isNearDuplicate) {
      deduped.push(entry);
    }

    if (deduped.length >= maxEvidenceBlocks) {
      break;
    }
  }

  return deduped;
}

export function buildEvidenceBlocks(
  entries: Array<RetrievalResultEntry>
): Array<EvidenceBlock> {
  return entries.map((entry, index) => ({
    label: `Citation ${index + 1}`,
    fileName: entry.source.name,
    content: normalizeWhitespace(entry.content),
    score: entry.score,
    entry,
  }));
}

export function formatEvidenceBlocks(blocks: Array<EvidenceBlock>) {
  if (blocks.length === 0) {
    return "";
  }

  return blocks
    .map(
      (block) =>
        `${block.label} (file: ${block.fileName}, score: ${block.score.toFixed(
          3
        )}):\n"${block.content}"`
    )
    .join("\n\n");
}
