import type { RagCandidate, RagDocument } from "./contracts";
import type { RagHierarchicalIndex } from "./runtimeContracts";

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
    hierarchicalIndex?: RagHierarchicalIndex;
  }
): Array<RagCandidate> {
  const normalizedQuery = normalizeWhitespace(query);
  const queryTokens = tokenize(normalizedQuery);
  const quotedSpans = extractQuotedSpans(query);
  const hierarchicalIndex =
    options?.hierarchicalIndex ?? buildHierarchicalDocumentIndex(documents);
  const parentRankings = hierarchicalIndex.nodes
    .map((node) => {
      const score = scoreChunk(normalizedQuery, queryTokens, quotedSpans, {
        sourceId: node.documentId,
        sourceName: node.documentName,
        heading: node.documentName,
        content: node.summary,
        metadata: node.summaryDocument.metadata,
      });
      return {
        node,
        score,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, options?.maxParentDocuments ?? Math.max(2, Math.min(4, maxCandidates)));

  const childCandidates: Array<RagCandidate> = [];
  for (const parent of parentRankings) {
    const rankedChunks = parent.node.chunks
      .map((chunk) => ({
        chunk,
        score: scoreChunk(normalizedQuery, queryTokens, quotedSpans, {
          sourceId: chunk.sourceId,
          sourceName: chunk.sourceName,
          heading:
            typeof chunk.metadata?.heading === "string"
              ? chunk.metadata.heading
              : chunk.sourceName,
          content: chunk.content,
          metadata: chunk.metadata,
        }),
      }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, options?.maxChildChunksPerDocument ?? Math.max(3, maxCandidates))
      .map(({ chunk, score }) => ({
        ...chunk,
        score: Math.min(1, score * 0.8 + parent.score * 0.2),
        metadata: {
          ...chunk.metadata,
          retrievalMode: "hierarchical-retrieval",
          parentSummary: parent.node.summary,
          parentScore: parent.score,
        },
      } satisfies RagCandidate));

    childCandidates.push(...rankedChunks);
  }

  return childCandidates
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCandidates);
}

export function buildHierarchicalDocumentIndex(
  documents: Array<RagDocument>
): RagHierarchicalIndex {
  return {
    nodes: documents.map((document) => {
      const summary = summarizeDocument(document);
      const chunks = chunkDocument(document).map((chunk) => ({
        sourceId: chunk.sourceId,
        sourceName: chunk.sourceName,
        content: chunk.content,
        score: 0,
        metadata: {
          ...chunk.metadata,
          heading: chunk.heading,
        },
      } satisfies RagCandidate));

      return {
        documentId: document.id,
        documentName: document.name,
        summary,
        summaryDocument: {
          id: `hierarchy-summary:${document.id}`,
          name: `hierarchy-summary:${document.name}`,
          content: summary,
          metadata: {
            ...document.metadata,
            sourceType: "hierarchical-summary",
            sourceDocumentId: document.id,
          },
        },
        chunks,
      };
    }),
  };
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
  if (isJsonlDocument(document)) {
    const structuredChunks = chunkJsonlDocument(document);
    if (structuredChunks.length > 0) {
      return structuredChunks;
    }
  }

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

function chunkJsonlDocument(document: RagDocument): Array<ChunkCandidate> {
  const lines = document.content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const chunks: Array<ChunkCandidate> = [];

  for (const [index, line] of lines.entries()) {
    try {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        continue;
      }
      const recordFields = summarizeStructuredFields(parsed);
      const recordText = extractStructuredText(parsed);
      const heading = buildStructuredHeading(document.name, parsed, index);
      const content = normalizeWhitespace(
        [
          `# ${heading}`,
          recordFields ? `Fields: ${recordFields}` : undefined,
          recordText ? `Content: ${recordText}` : undefined,
          !recordText ? `Raw record: ${truncateForChunk(line, 1200)}` : undefined,
        ]
          .filter(Boolean)
          .join("\n")
      );
      if (!content) {
        continue;
      }

      chunks.push({
        sourceId: document.id,
        sourceName: document.name,
        content,
        heading,
        metadata: {
          ...document.metadata,
          structuredFormat: "jsonl",
          recordIndex: index,
          structuredFields: Object.keys(parsed),
          structuredSummary: recordFields,
        },
      });
    } catch {
      continue;
    }
  }

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

function isJsonlDocument(document: RagDocument): boolean {
  const extension = typeof document.metadata?.extension === "string"
    ? document.metadata.extension.toLowerCase()
    : document.name.toLowerCase().endsWith(".jsonl")
      ? ".jsonl"
      : "";
  return extension === ".jsonl";
}

function buildStructuredHeading(
  documentName: string,
  record: Record<string, unknown>,
  index: number
): string {
  const preferredKeys = [
    "conversation_id",
    "conversationId",
    "session_id",
    "sessionId",
    "id",
    "message_id",
    "messageId",
  ];
  for (const key of preferredKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return `${documentName} - ${key}:${value.trim()}`;
    }
  }
  return `${documentName} - record ${index + 1}`;
}

function summarizeStructuredFields(record: Record<string, unknown>): string {
  const preferredKeys = [
    "conversation_id",
    "conversationId",
    "session_id",
    "sessionId",
    "timestamp",
    "created_at",
    "createdAt",
    "role",
    "topic",
    "user_id",
    "userId",
  ];
  const orderedKeys = [
    ...preferredKeys.filter((key) => key in record),
    ...Object.keys(record).filter((key) => !preferredKeys.includes(key)).slice(0, 6),
  ];
  const seen = new Set<string>();
  const pairs: Array<string> = [];
  for (const key of orderedKeys) {
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    const value = record[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      pairs.push(`${key}=${truncateForChunk(String(value), 120)}`);
    }
    if (pairs.length >= 8) {
      break;
    }
  }
  return pairs.join(", ");
}

function extractStructuredText(record: Record<string, unknown>): string {
  const directTextKeys = [
    "content",
    "message",
    "text",
    "body",
    "summary",
    "title",
    "prompt",
    "response",
  ];
  const pieces: Array<string> = [];
  for (const key of directTextKeys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      pieces.push(value.trim());
    }
  }

  const messages = record.messages;
  if (Array.isArray(messages)) {
    for (const message of messages.slice(0, 4)) {
      if (!message || typeof message !== "object") {
        continue;
      }
      const role = typeof (message as Record<string, unknown>).role === "string"
        ? (message as Record<string, unknown>).role as string
        : undefined;
      const content = typeof (message as Record<string, unknown>).content === "string"
        ? (message as Record<string, unknown>).content as string
        : undefined;
      if (content?.trim()) {
        pieces.push(`${role ?? "message"}: ${content.trim()}`);
      }
    }
  }

  return truncateForChunk(normalizeWhitespace(pieces.join(" \n ")), 1200);
}

function truncateForChunk(value: string, maxLength: number): string {
  const normalized = normalizeWhitespace(value);
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
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
