import type { FileHandle, RetrievalResultEntry } from "@lmstudio/sdk";

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

interface ParsedDocumentInput {
  file: FileHandle;
  content: string;
}

interface ChunkCandidate {
  file: FileHandle;
  content: string;
  heading: string;
}

export function lexicalRetrieve(
  query: string,
  documents: Array<ParsedDocumentInput>,
  maxCandidates: number
): Array<RetrievalResultEntry> {
  const normalizedQuery = normalizeWhitespace(query);
  const queryTokens = tokenize(normalizedQuery);
  const quotedSpans = extractQuotedSpans(query);
  const candidates: Array<{ entry: RetrievalResultEntry; score: number }> = [];

  for (const document of documents) {
    const chunks = chunkDocument(document.file, document.content);
    for (const chunk of chunks) {
      const score = scoreChunk(normalizedQuery, queryTokens, quotedSpans, chunk);
      if (score <= 0) {
        continue;
      }
      candidates.push({
        entry: {
          content: chunk.content,
          score,
          source: document.file,
        },
        score,
      });
    }
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCandidates)
    .map((candidate) => candidate.entry);
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

function chunkDocument(file: FileHandle, content: string): Array<ChunkCandidate> {
  const lines = content.split(/\r?\n/);
  const chunks: Array<ChunkCandidate> = [];
  let primaryHeading = file.name;
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
      file,
      content: compositeHeading && !chunkText.startsWith(compositeHeading)
        ? `# ${compositeHeading}\n${chunkText}`
        : chunkText,
      heading: compositeHeading,
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
