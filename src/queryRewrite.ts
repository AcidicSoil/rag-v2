import type { QueryRewrite } from "./types/retrieval";

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
]);

function normalizeWhitespace(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function uniquePush(results: QueryRewrite[], rewrite: QueryRewrite) {
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

function buildKeywordRewrite(prompt: string) {
  const keywords = prompt
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token));

  return keywords.join(" ");
}

function buildSplitRewrite(prompt: string) {
  const splitParts = prompt
    .split(/\b(?:and|then|also)\b|[,;:?]/i)
    .map((part) => normalizeWhitespace(part))
    .filter((part) => part.length > 0);

  return splitParts.length > 1 ? splitParts[0] : "";
}

function buildQuotedRewrite(prompt: string) {
  const quotedSpans = [...prompt.matchAll(/"([^"]+)"|'([^']+)'/g)]
    .map((match) => normalizeWhitespace(match[1] ?? match[2] ?? ""))
    .filter((span) => span.length > 0);

  return quotedSpans.join(" ");
}

export function generateQueryRewrites(
  prompt: string,
  multiQueryCount: number
): QueryRewrite[] {
  const rewrites: QueryRewrite[] = [];
  const maxVariants = Math.max(1, Math.min(multiQueryCount, 4));

  uniquePush(rewrites, { label: "original", text: prompt });
  uniquePush(rewrites, {
    label: "keywords",
    text: buildKeywordRewrite(prompt),
  });
  uniquePush(rewrites, {
    label: "decomposed",
    text: buildSplitRewrite(prompt),
  });
  uniquePush(rewrites, {
    label: "quoted",
    text: buildQuotedRewrite(prompt),
  });

  return rewrites.slice(0, maxVariants);
}
