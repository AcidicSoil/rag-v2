import type { RagCandidate } from "./contracts";
import { generateCoreQueryRewrites } from "./rewrite";
import type {
  RagCorrectiveAssessment,
  RagCorrectiveAssessmentOptions,
  RagCorrectiveRewritePlan,
  RagQueryRewrite,
} from "./policyContracts";

const STOPWORDS = new Set([
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
  "to",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "compare",
  "describe",
  "explain",
  "list",
  "show",
  "summarize",
  "tell",
]);

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function tokenize(value: string) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((token) =>
      token.length > 4 && token.endsWith("s") ? token.slice(0, -1) : token
    )
    .filter((token) => token.length >= 4 && !STOPWORDS.has(token));
}

function uniquePush(results: RagQueryRewrite[], rewrite: RagQueryRewrite) {
  const normalized = normalizeWhitespace(rewrite.text);
  if (!normalized) {
    return;
  }

  if (results.some((existing) => existing.text.toLowerCase() === normalized.toLowerCase())) {
    return;
  }

  results.push({
    label: rewrite.label,
    text: normalized,
  });
}

export function extractCoreQueryAspects(prompt: string): string[] {
  const splitAspects = prompt
    .split(/\b(?:and|then|also|versus|vs\.)\b|[,;:]/i)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => tokenize(part).length >= 2);

  const quotedAspects = [...prompt.matchAll(/"([^"]+)"|'([^']+)'/g)]
    .map((match) => normalizeWhitespace(match[1] ?? match[2] ?? ""))
    .filter((part) => tokenize(part).length >= 1);

  const allAspects = [...splitAspects, ...quotedAspects];
  const uniqueAspects: string[] = [];
  for (const aspect of allAspects) {
    if (!uniqueAspects.some((existing) => existing.toLowerCase() === aspect.toLowerCase())) {
      uniqueAspects.push(aspect);
    }
  }

  return uniqueAspects.length > 0 ? uniqueAspects : [normalizeWhitespace(prompt)];
}

export function buildCoreCorrectiveQueryPlan(
  prompt: string,
  maxVariants: number
): RagCorrectiveRewritePlan {
  const rewrites: RagQueryRewrite[] = [];
  const aspects = extractCoreQueryAspects(prompt);
  const baselineRewrites = generateCoreQueryRewrites(prompt, Math.max(1, maxVariants));

  for (const rewrite of baselineRewrites) {
    uniquePush(rewrites, rewrite);
  }

  for (const [index, aspect] of aspects.entries()) {
    uniquePush(rewrites, {
      label: `aspect-${index + 1}`,
      text: aspect,
    });
  }

  const aspectKeywords = aspects
    .flatMap((aspect) => tokenize(aspect))
    .filter((token, index, tokens) => tokens.indexOf(token) === index)
    .join(" ");
  uniquePush(rewrites, {
    label: "aspect-keywords",
    text: aspectKeywords,
  });

  return {
    aspects,
    rewrites: rewrites.slice(0, Math.max(1, maxVariants)),
  };
}

export function assessCoreCorrectiveNeed(
  prompt: string,
  entries: RagCandidate[],
  options: RagCorrectiveAssessmentOptions
): RagCorrectiveAssessment {
  const aspects = extractCoreQueryAspects(prompt);
  const evidenceText = entries.map((entry) => entry.content.toLowerCase()).join("\n");
  const matchedAspectCount = aspects.filter((aspect) => {
    const tokens = tokenize(aspect);
    if (tokens.length === 0) {
      return false;
    }

    const matchedTokens = tokens.filter((token) => evidenceText.includes(token));
    return matchedTokens.length >= Math.max(1, Math.ceil(tokens.length / 2));
  }).length;
  const aspectCoverage = aspects.length === 0 ? 1 : matchedAspectCount / aspects.length;
  const averageScore =
    entries.length === 0
      ? 0
      : entries.reduce((sum, entry) => sum + entry.score, 0) / entries.length;

  const reasons: string[] = [];
  if (entries.length < options.minEntryCount) {
    reasons.push(
      `Only ${entries.length} retrieval candidate${entries.length === 1 ? " was" : "s were"} retained after filtering.`
    );
  }
  if (averageScore < options.minAverageScore) {
    reasons.push(
      `Average evidence score ${averageScore.toFixed(2)} fell below the corrective threshold ${options.minAverageScore.toFixed(2)}.`
    );
  }
  if (aspectCoverage < options.minAspectCoverage) {
    reasons.push(
      `Evidence only covered ${matchedAspectCount}/${aspects.length} detected query aspect${aspects.length === 1 ? "" : "s"}.`
    );
  }

  return {
    shouldRetry: reasons.length > 0,
    reasons,
    averageScore,
    aspectCoverage,
    entryCount: entries.length,
    matchedAspectCount,
    totalAspectCount: aspects.length,
  };
}
