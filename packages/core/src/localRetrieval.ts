import type { RagCandidate, RagDocument } from "./contracts";

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

interface ChunkCandidate {
  sourceId: string;
  sourceName: string;
  content: string;
  heading: string;
  metadata?: Record<string, unknown>;
}

export function lexicalRetrieveFromDocuments(
  query: string,
  documents: Array<RagDocument>,
  maxCandidates: number
): Array<RagCandidate> {
  const normalizedQuery = normalizeWhitespace(query);
  const queryTokens = tokenize(normalizedQuery);
  const quotedSpans = extractQuotedSpans(query);
  const candidates: Array<RagCandidate> = [];

  for (const document of documents) {
    const chunks = chunkDocument(document);
    for (const chunk of chunks) {
      const score = scoreChunk(normalizedQuery, queryTokens, quotedSpans, chunk);
      if (score <= 0) {
        continue;
      }

      candidates.push({
        sourceId: chunk.sourceId,
        sourceName: chunk.sourceName,
        content: chunk.content,
        score,
        metadata: chunk.metadata,
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCandidates);
}

export function hierarchicalRetrieveFromDocuments(
  query: string,
  documents: Array<RagDocument>,
  maxCandidates: number,
  options?: {
    maxParentDocuments?: number;
    maxChildChunksPerDocument?: number;
  }
): Array<RagCandidate> {
  const normalizedQuery = normalizeWhitespace(query);
  const queryTokens = tokenize(normalizedQuery);
  const quotedSpans = extractQuotedSpans(query);
  const parentRankings = documents
    .map((document) => {
      const summary = summarizeDocument(document);
      const score = scoreChunk(normalizedQuery, queryTokens, quotedSpans, {
        sourceId: document.id,
        sourceName: document.name,
        heading: document.name,
        content: summary,
        metadata: document.metadata,
      });
      return {
        document,
        summary,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, options?.maxParentDocuments ?? Math.max(2, Math.min(4, maxCandidates)));

  const childCandidates: Array<RagCandidate> = [];
  for (const parent of parentRankings) {
    const rankedChunks = chunkDocument(parent.document)
      .map((chunk) => ({
        chunk,
        score: scoreChunk(normalizedQuery, queryTokens, quotedSpans, chunk),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, options?.maxChildChunksPerDocument ?? Math.max(3, maxCandidates))
      .map(({ chunk, score }) => ({
        sourceId: chunk.sourceId,
        sourceName: chunk.sourceName,
        content: chunk.content,
        score: Math.min(1, score * 0.8 + parent.score * 0.2),
        metadata: {
          ...chunk.metadata,
          retrievalMode: "hierarchical-retrieval",
          parentSummary: parent.summary,
          parentScore: parent.score,
        },
      } satisfies RagCandidate));

    childCandidates.push(...rankedChunks);
  }

  return childCandidates
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCandidates);
}

function scoreChunk(
  normalizedQuery: string,
  queryTokens: Array<string>,
  quotedSpans: Array<string>,
  chunk: ChunkCandidate
): number {
  const content = normalizeWhitespace(chunk.content);
  const contentTokens = tokenize(content);
  if (contentTokens.length === 0) {
    return 0;
  }

  const lexicalOverlap = computeOverlap(queryTokens, contentTokens);
  const headingOverlap = computeOverlap(queryTokens, tokenize(chunk.heading));
  const exactPhraseBonus = quotedSpans.some((span) =>
    content.toLowerCase().includes(span.toLowerCase())
  )
    ? 0.25
    : 0;
  const queryPhraseBonus =
    normalizedQuery.length > 12 &&
    content.toLowerCase().includes(normalizedQuery.toLowerCase())
      ? 0.15
      : 0;

  return Math.min(
    lexicalOverlap * 0.65 +
      headingOverlap * 0.2 +
      exactPhraseBonus +
      queryPhraseBonus,
    1
  );
}

export function chunkDocument(document: RagDocument): Array<ChunkCandidate> {
  const lines = document.content.split(/\r?\n/);
  const chunks: Array<ChunkCandidate> = [];
  let primaryHeading = document.name;
  let secondaryHeading = "";
  let buffer: Array<string> = [];

  const getCompositeHeading = () =>
    secondaryHeading ? `${primaryHeading} - ${secondaryHeading}` : primaryHeading;

  const flush = () => {
    const chunkText = normalizeWhitespace(buffer.join("\n"));
    if (!chunkText) {
      buffer = [];
      return;
    }

    const compositeHeading = getCompositeHeading();
    chunks.push({
      sourceId: document.id,
      sourceName: document.name,
      content:
        compositeHeading && !chunkText.startsWith(compositeHeading)
          ? `# ${compositeHeading}\n${chunkText}`
          : chunkText,
      heading: compositeHeading,
      metadata: document.metadata,
    });
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      continue;
    }

    const markdownHeading = trimmed.match(/^#{1,6}\s+(.+)$/);
    if (markdownHeading) {
      flush();
      primaryHeading = markdownHeading[1]?.trim() || primaryHeading;
      secondaryHeading = "";
      continue;
    }

    const heading = extractHeading(trimmed);
    if (heading) {
      flush();
      secondaryHeading = heading;
      continue;
    }

    buffer.push(trimmed);
    if (normalizeWhitespace(buffer.join(" ")).length >= 420) {
      flush();
    }
  }

  flush();
  return chunks;
}

function summarizeDocument(document: RagDocument): string {
  const chunks = chunkDocument(document);
  if (chunks.length === 0) {
    return normalizeWhitespace(document.content).slice(0, 600);
  }

  const head = chunks.slice(0, 2).map((chunk) => chunk.content);
  const tail = chunks.length > 2 ? [chunks[chunks.length - 1]!.content] : [];

  return normalizeWhitespace(
    [`# ${document.name}`, ...head, ...tail].join("\n\n")
  ).slice(0, 1200);
}

function extractHeading(line: string): string {
  const markdownHeading = line.match(/^#{1,6}\s+(.+)$/);
  if (markdownHeading) {
    return markdownHeading[1]?.trim() ?? "";
  }

  if (line.length <= 80 && !/[.!?]$/.test(line) && /[A-Za-z]/.test(line)) {
    return line;
  }

  return "";
}

function extractQuotedSpans(query: string): Array<string> {
  return Array.from(query.matchAll(/"([^"]{2,})"/g)).map(
    (match) => match[1]!.trim()
  );
}

function computeOverlap(left: Array<string>, right: Array<string>): number {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const rightSet = new Set(right);
  let overlap = 0;
  for (const token of left) {
    if (rightSet.has(token)) {
      overlap += 1;
    }
  }
  return overlap / left.length;
}

function tokenize(value: string): Array<string> {
  return normalizeWhitespace(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
