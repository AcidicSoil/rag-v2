import type {
  RagCandidate,
  RagEvidenceBlock,
  RagFusionMethod,
  RagRankedCandidate,
  RagRerankStrategy,
} from "./contracts";

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

export function fuseRagCandidates(
  retrievalRuns: Array<Array<RagCandidate>>,
  method: RagFusionMethod,
  limit: number
): Array<RagCandidate> {
  const fusedEntries = new Map<
    string,
    {
      candidate: RagCandidate;
      fusedScore: number;
      bestScore: number;
    }
  >();

  retrievalRuns.forEach((entries) => {
    entries.forEach((candidate, index) => {
      const key = buildCandidateKey(candidate);
      const existing = fusedEntries.get(key);
      const reciprocalRankScore = 1 / (index + 1);

      if (!existing) {
        fusedEntries.set(key, {
          candidate,
          fusedScore: reciprocalRankScore,
          bestScore: candidate.score,
        });
        return;
      }

      existing.bestScore = Math.max(existing.bestScore, candidate.score);
      existing.fusedScore += reciprocalRankScore;
      existing.candidate = mergeRagCandidatePair(existing.candidate, candidate);
    });
  });

  return [...fusedEntries.values()]
    .map((value) => ({
      candidate: {
        ...value.candidate,
        score: method === "max-score" ? value.bestScore : value.fusedScore,
      },
      sortScore: method === "max-score" ? value.bestScore : value.fusedScore,
    }))
    .sort((left, right) => right.sortScore - left.sortScore)
    .slice(0, limit)
    .map((value) => value.candidate);
}

export function mergeHybridRagCandidates(
  semanticEntries: Array<RagCandidate>,
  lexicalEntries: Array<RagCandidate>,
  options: {
    semanticWeight: number;
    lexicalWeight: number;
    maxCandidates: number;
  }
): Array<RagCandidate> {
  const semanticMax = Math.max(...semanticEntries.map((entry) => entry.score), 1);
  const lexicalMax = Math.max(...lexicalEntries.map((entry) => entry.score), 1);
  const merged = new Map<string, RagCandidate>();

  for (const entry of semanticEntries) {
    const key = buildCandidateKey(entry);
    merged.set(key, {
      ...entry,
      score: (entry.score / semanticMax) * options.semanticWeight,
    });
  }

  for (const entry of lexicalEntries) {
    const key = buildCandidateKey(entry);
    const lexicalWeightedScore = (entry.score / lexicalMax) * options.lexicalWeight;
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, {
        ...entry,
        score: lexicalWeightedScore,
      });
      continue;
    }

    merged.set(
      key,
      mergeRagCandidatePair(existing, {
        ...entry,
        score: existing.score + lexicalWeightedScore,
      })
    );
  }

  return Array.from(merged.values())
    .sort((left, right) => right.score - left.score)
    .slice(0, options.maxCandidates);
}

export function rerankRagCandidates(
  userQuery: string,
  entries: Array<RagCandidate>,
  options: {
    topK: number;
    strategy: RagRerankStrategy;
  }
): Array<RagRankedCandidate> {
  if (entries.length === 0) {
    return [];
  }

  if (
    options.strategy !== "heuristic-v1" &&
    options.strategy !== "heuristic-then-llm"
  ) {
    return entries.slice(0, options.topK).map((candidate) => ({
      candidate,
      originalScore: candidate.score,
      rerankScore: candidate.score,
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
  const selected: Array<RagRankedCandidate> = [];
  const remaining = entries.map((candidate) =>
    buildRankedCandidate(candidate, userQuery, queryTokens)
  );

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

export function dedupeRagCandidates(
  entries: Array<RagCandidate>,
  threshold: number,
  maxEvidenceBlocks: number
): Array<RagCandidate> {
  const deduped: Array<RagCandidate> = [];

  for (const entry of entries) {
    const duplicateIndex = deduped.findIndex((existing) => {
      const sameFile = existing.sourceId === entry.sourceId;
      return sameFile && computeSimilarity(existing.content, entry.content) >= threshold;
    });

    if (duplicateIndex === -1) {
      deduped.push(entry);
    } else {
      deduped[duplicateIndex] = mergeRagCandidatePair(deduped[duplicateIndex]!, entry);
    }

    if (deduped.length >= maxEvidenceBlocks) {
      break;
    }
  }

  return deduped;
}

export function buildRagEvidenceBlocks(
  entries: Array<RagCandidate>
): Array<RagEvidenceBlock> {
  return entries.map((candidate, index) => ({
    label: `Citation ${index + 1}`,
    fileName: candidate.sourceName,
    content: normalizeWhitespace(candidate.content),
    score: candidate.score,
    candidate,
  }));
}

function buildRankedCandidate(
  candidate: RagCandidate,
  userQuery: string,
  queryTokens: Array<string>
): RagRankedCandidate {
  const content = normalizeWhitespace(candidate.content);
  const contentTokens = tokenize(content);
  const lexicalOverlap = computeLexicalOverlap(queryTokens, contentTokens);
  const headingMatch = computeHeadingMatch(userQuery, content);
  const completeness = computeCompletenessScore(content);
  const sectionRelevance = computeSectionRelevance(
    queryTokens,
    content,
    candidate.sourceName
  );

  const rerankScore =
    candidate.score * 0.45 +
    lexicalOverlap * 0.3 +
    headingMatch * 0.1 +
    completeness * 0.05 +
    sectionRelevance * 0.1;

  return {
    candidate: {
      ...candidate,
      content,
    },
    originalScore: candidate.score,
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
  candidate: RagRankedCandidate,
  selected: Array<RagRankedCandidate>
): RagRankedCandidate {
  if (selected.length === 0) {
    return candidate;
  }

  const maxSimilarity = selected.reduce((best, current) => {
    return Math.max(
      best,
      computeTextSimilarity(candidate.candidate.content, current.candidate.content)
    );
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

function mergeRagCandidatePair(left: RagCandidate, right: RagCandidate): RagCandidate {
  const preferred = right.score > left.score ? right : left;
  const secondary = preferred === left ? right : left;

  return {
    ...preferred,
    score: Math.max(left.score, right.score),
    metadata: mergeCandidateMetadata(preferred.metadata, secondary.metadata),
  };
}

function mergeCandidateMetadata(
  primary?: Record<string, unknown>,
  secondary?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!primary && !secondary) {
    return undefined;
  }

  const merged: Record<string, unknown> = {
    ...(secondary ?? {}),
    ...(primary ?? {}),
  };

  const structuredFields = mergeUniqueStrings(
    asStringArray(primary?.structuredFields),
    asStringArray(secondary?.structuredFields)
  );
  if (structuredFields.length > 0) {
    merged.structuredFields = structuredFields;
  }

  const structuredQueryMatches = mergeUniqueStrings(
    asStringArray(primary?.structuredQueryMatches),
    asStringArray(secondary?.structuredQueryMatches)
  );
  if (structuredQueryMatches.length > 0) {
    merged.structuredQueryMatches = structuredQueryMatches;
  }

  const structuredRecord = mergeStringRecords(
    asStringRecord(primary?.structuredRecord),
    asStringRecord(secondary?.structuredRecord)
  );
  if (structuredRecord) {
    merged.structuredRecord = structuredRecord;
  }

  const parentSummary = mergeUniqueStrings(
    typeof primary?.parentSummary === "string" ? [primary.parentSummary] : [],
    typeof secondary?.parentSummary === "string" ? [secondary.parentSummary] : []
  );
  if (parentSummary.length > 0) {
    merged.parentSummary = parentSummary.join("\n\n");
  }

  return merged;
}

function asStringArray(value: unknown): Array<string> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === "string");
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const entries = Object.entries(value).filter(
    ([, entryValue]) => typeof entryValue === "string"
  ) as Array<[string, string]>;
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries);
}

function mergeStringRecords(
  primary?: Record<string, string>,
  secondary?: Record<string, string>
): Record<string, string> | undefined {
  if (!primary && !secondary) {
    return undefined;
  }
  return {
    ...(secondary ?? {}),
    ...(primary ?? {}),
  };
}

function mergeUniqueStrings(
  primary: Array<string>,
  secondary: Array<string>
): Array<string> {
  return [...new Set([...primary, ...secondary].map((entry) => entry.trim()).filter(Boolean))];
}

function buildCandidateKey(candidate: RagCandidate): string {
  return `${candidate.sourceId}::${normalizeWhitespace(candidate.content).toLowerCase()}`;
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

  return computeLexicalOverlap(tokenize(normalizedQuery), tokenize(normalizedHeading));
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

function computeSimilarity(left: string, right: string): number {
  const leftTokens = new Set(tokenize(left));
  const rightTokens = new Set(tokenize(right));

  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return 0;
  }

  let intersectionSize = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersectionSize += 1;
    }
  }

  const unionSize = new Set([...leftTokens, ...rightTokens]).size;
  return unionSize === 0 ? 0 : intersectionSize / unionSize;
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
