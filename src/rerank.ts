import type { RetrievalResultEntry } from "@lmstudio/sdk";
import type { RankedRetrievalEntry, RerankOptions } from "./types/rerank";

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
]);

const DIVERSITY_PENALTY_WEIGHT = 0.2;

export function rerankRetrievalEntries(
  userQuery: string,
  entries: Array<RetrievalResultEntry>,
  options: RerankOptions
): Array<RankedRetrievalEntry> {
  if (entries.length === 0) {
    return [];
  }

  if (options.strategy !== "heuristic-v1") {
    return entries.slice(0, options.topK).map((entry) => ({
      entry,
      originalScore: entry.score,
      rerankScore: entry.score,
      features: {
        lexicalOverlap: 0,
        headingMatch: 0,
        completeness: 0,
        sectionRelevance: 0,
        diversityPenalty: 0,
      },
    }));
  }

  const queryTokens = tokenize(userQuery);
  const selected: Array<RankedRetrievalEntry> = [];
  const remaining = entries.map((entry) => buildRankedEntry(entry, userQuery, queryTokens));

  while (remaining.length > 0 && selected.length < options.topK) {
    let bestIndex = 0;
    let bestCandidate = applyDiversityPenalty(remaining[0]!, selected);

    for (let index = 1; index < remaining.length; index += 1) {
      const candidate = applyDiversityPenalty(remaining[index]!, selected);
      if (candidate.rerankScore > bestCandidate.rerankScore) {
        bestCandidate = candidate;
        bestIndex = index;
      }
    }

    selected.push(bestCandidate);
    remaining.splice(bestIndex, 1);
  }

  return selected;
}

function buildRankedEntry(
  entry: RetrievalResultEntry,
  userQuery: string,
  queryTokens: Array<string>
): RankedRetrievalEntry {
  const content = normalizeWhitespace(entry.content);
  const contentTokens = tokenize(content);
  const lexicalOverlap = computeLexicalOverlap(queryTokens, contentTokens);
  const headingMatch = computeHeadingMatch(userQuery, content);
  const completeness = computeCompletenessScore(content);
  const sectionRelevance = computeSectionRelevance(queryTokens, content, entry.source.name);

  const rerankScore =
    entry.score * 0.45 +
    lexicalOverlap * 0.3 +
    headingMatch * 0.1 +
    completeness * 0.05 +
    sectionRelevance * 0.1;

  return {
    entry: {
      ...entry,
      content,
    },
    originalScore: entry.score,
    rerankScore,
    features: {
      lexicalOverlap,
      headingMatch,
      completeness,
      sectionRelevance,
      diversityPenalty: 0,
    },
  };
}

function applyDiversityPenalty(
  candidate: RankedRetrievalEntry,
  selected: Array<RankedRetrievalEntry>
): RankedRetrievalEntry {
  if (selected.length === 0) {
    return candidate;
  }

  const maxSimilarity = selected.reduce((best, current) => {
    return Math.max(best, computeTextSimilarity(candidate.entry.content, current.entry.content));
  }, 0);
  const diversityPenalty = maxSimilarity * DIVERSITY_PENALTY_WEIGHT;

  return {
    ...candidate,
    rerankScore: candidate.rerankScore - diversityPenalty,
    features: {
      ...candidate.features,
      diversityPenalty,
    },
  };
}

function computeLexicalOverlap(
  queryTokens: Array<string>,
  contentTokens: Array<string>
): number {
  if (queryTokens.length === 0 || contentTokens.length === 0) {
    return 0;
  }

  const contentSet = new Set(contentTokens);
  let matches = 0;
  for (const token of queryTokens) {
    if (contentSet.has(token)) {
      matches += 1;
    }
  }

  return matches / queryTokens.length;
}

function computeHeadingMatch(userQuery: string, content: string): number {
  const heading = extractHeading(content);
  if (!heading) {
    return 0;
  }

  const normalizedQuery = normalizeWhitespace(userQuery).toLowerCase();
  const normalizedHeading = heading.toLowerCase();

  if (normalizedQuery.includes(normalizedHeading) || normalizedHeading.includes(normalizedQuery)) {
    return 1;
  }

  const queryTokens = tokenize(normalizedQuery);
  const headingTokens = tokenize(normalizedHeading);
  return computeLexicalOverlap(queryTokens, headingTokens);
}

function computeCompletenessScore(content: string): number {
  const normalized = normalizeWhitespace(content);
  const sentenceCount = normalized.split(/[.!?]+/).filter(Boolean).length;
  const lengthScore = Math.min(normalized.length / 240, 1);
  const sentenceScore = Math.min(sentenceCount / 3, 1);
  return (lengthScore + sentenceScore) / 2;
}

function computeSectionRelevance(
  queryTokens: Array<string>,
  content: string,
  sourceName: string
): number {
  const heading = extractHeading(content);
  const sectionTokens = tokenize(`${heading} ${sourceName}`);
  return computeLexicalOverlap(queryTokens, sectionTokens);
}

function computeTextSimilarity(left: string, right: string): number {
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return 0;
  }

  const leftSet = new Set(leftTokens);
  const rightSet = new Set(rightTokens);
  let overlap = 0;

  for (const token of leftSet) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }

  return overlap / Math.max(leftSet.size, rightSet.size);
}

function extractHeading(content: string): string {
  const firstLine = normalizeWhitespace(content.split(/\r?\n/, 1)[0] ?? "");
  if (!firstLine) {
    return "";
  }

  const markdownHeading = firstLine.match(/^#{1,6}\s+(.+)$/);
  if (markdownHeading) {
    return markdownHeading[1]?.trim() ?? "";
  }

  if (firstLine.length <= 80 && !/[.!?]$/.test(firstLine)) {
    return firstLine;
  }

  return "";
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function tokenize(value: string): Array<string> {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}
