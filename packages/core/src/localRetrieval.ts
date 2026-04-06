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

const STRUCTURED_FIELD_ALIASES = {
  conversationId: ["conversation_id", "conversationId"],
  sessionId: ["session_id", "sessionId"],
  messageId: ["message_id", "messageId"],
  id: ["id"],
  timestamp: ["timestamp", "created_at", "createdAt", "time", "date"],
  role: ["role"],
  topic: ["topic", "subject"],
  userId: ["user_id", "userId"],
} as const;

interface ChunkCandidate {
  sourceId: string;
  sourceName: string;
  content: string;
  heading: string;
  metadata?: Record<string, unknown>;
}

interface StructuredQueryConstraint {
  label: string;
  aliases: ReadonlyArray<string>;
  value: string;
  normalizedValue: string;
  strategy: "exact" | "prefix";
}

interface StructuredQueryPlan {
  constraints: Array<StructuredQueryConstraint>;
  fallbackQuery: string;
}

export function lexicalRetrieveFromDocuments(
  query: string,
  documents: Array<RagDocument>,
  maxCandidates: number
): Array<RagCandidate> {
  const structuredPlan = buildStructuredQueryPlan(query);
  const structuredCandidates = retrieveStructuredCandidates(
    structuredPlan,
    documents,
    maxCandidates,
    "structured-query-first"
  );
  if (structuredCandidates.length >= maxCandidates) {
    return structuredCandidates;
  }

  const lexicalQuery = structuredPlan.fallbackQuery || query;
  const normalizedQuery = normalizeWhitespace(lexicalQuery);
  const queryTokens = tokenize(normalizedQuery);
  const quotedSpans = extractQuotedSpans(lexicalQuery);
  const lexicalCandidates: Array<RagCandidate> = [];

  for (const document of documents) {
    const chunks = chunkDocument(document);
    for (const chunk of chunks) {
      const score = scoreChunk(normalizedQuery, queryTokens, quotedSpans, chunk);
      if (score <= 0) {
        continue;
      }

      lexicalCandidates.push({
        sourceId: chunk.sourceId,
        sourceName: chunk.sourceName,
        content: chunk.content,
        score,
        metadata: chunk.metadata,
      });
    }
  }

  return mergeCandidates(structuredCandidates, lexicalCandidates, maxCandidates);
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
  const structuredPlan = buildStructuredQueryPlan(query);
  const structuredCandidates = retrieveStructuredCandidates(
    structuredPlan,
    documents,
    maxCandidates,
    "structured-query-first"
  );
  if (structuredCandidates.length >= maxCandidates) {
    return structuredCandidates;
  }

  const lexicalQuery = structuredPlan.fallbackQuery || query;
  const normalizedQuery = normalizeWhitespace(lexicalQuery);
  const queryTokens = tokenize(normalizedQuery);
  const quotedSpans = extractQuotedSpans(lexicalQuery);
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

  return mergeCandidates(structuredCandidates, childCandidates, maxCandidates);
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

function retrieveStructuredCandidates(
  structuredPlan: StructuredQueryPlan,
  documents: Array<RagDocument>,
  maxCandidates: number,
  retrievalMode: string
): Array<RagCandidate> {
  if (structuredPlan.constraints.length === 0) {
    return [];
  }

  const normalizedFallbackQuery = normalizeWhitespace(
    structuredPlan.fallbackQuery || structuredPlan.constraints.map((constraint) => constraint.value).join(" ")
  );
  const queryTokens = tokenize(normalizedFallbackQuery);
  const quotedSpans = extractQuotedSpans(structuredPlan.fallbackQuery || "");
  const matches: Array<RagCandidate> = [];

  for (const document of documents) {
    for (const chunk of chunkDocument(document)) {
      if (chunk.metadata?.structuredFormat !== "jsonl") {
        continue;
      }

      const structuredRecord = asStructuredRecord(chunk.metadata?.structuredRecord);
      if (!structuredRecord) {
        continue;
      }

      const matchedConstraints: Array<string> = [];
      let allMatched = true;
      for (const constraint of structuredPlan.constraints) {
        if (!matchesConstraint(structuredRecord, constraint)) {
          allMatched = false;
          break;
        }
        matchedConstraints.push(`${constraint.label}=${constraint.value}`);
      }
      if (!allMatched) {
        continue;
      }

      const lexicalScore = normalizedFallbackQuery
        ? scoreChunk(normalizedFallbackQuery, queryTokens, quotedSpans, chunk)
        : 0;
      const constraintCoverage =
        structuredPlan.constraints.length > 0
          ? matchedConstraints.length / structuredPlan.constraints.length
          : 0;
      matches.push({
        sourceId: chunk.sourceId,
        sourceName: chunk.sourceName,
        content: chunk.content,
        score: Math.min(1, 0.72 + constraintCoverage * 0.2 + lexicalScore * 0.08),
        metadata: {
          ...chunk.metadata,
          retrievalMode,
          structuredQueryMatches: matchedConstraints,
        },
      });
    }
  }

  return matches
    .sort((left, right) => right.score - left.score)
    .slice(0, maxCandidates);
}

function buildStructuredQueryPlan(query: string): StructuredQueryPlan {
  const normalizedQuery = normalizeWhitespace(query);
  if (!normalizedQuery) {
    return {
      constraints: [],
      fallbackQuery: "",
    };
  }

  const constraints: Array<StructuredQueryConstraint> = [];
  const remainingSpans: Array<{ start: number; end: number }> = [];

  const explicitFieldMatches = extractExplicitStructuredFieldMatches(normalizedQuery);
  constraints.push(...explicitFieldMatches.constraints);
  remainingSpans.push(...explicitFieldMatches.spans);

  const naturalLanguagePatterns = [
    {
      label: "conversation_id",
      aliases: [...STRUCTURED_FIELD_ALIASES.conversationId, ...STRUCTURED_FIELD_ALIASES.sessionId],
      strategy: "exact" as const,
      regex: /\b(?:conversation(?:\s+id)?|conversation_id|conversationId|conv(?:ersation)?|session(?:\s+id)?|session_id|sessionId)\s*(?:=|:|#)?\s*["']?([A-Za-z0-9][A-Za-z0-9._:/+-]{1,})["']?/gi,
      accept: looksStructuredIdentifier,
    },
    {
      label: "message_id",
      aliases: STRUCTURED_FIELD_ALIASES.messageId,
      strategy: "exact" as const,
      regex: /\b(?:message(?:\s+id)?|message_id|messageId|record(?:\s+id)?)\s*(?:=|:|#)?\s*["']?([A-Za-z0-9][A-Za-z0-9._:/+-]{1,})["']?/gi,
      accept: looksStructuredIdentifier,
    },
    {
      label: "id",
      aliases: STRUCTURED_FIELD_ALIASES.id,
      strategy: "exact" as const,
      regex: /\b(?:exact\s+)?id\s*(?:=|:|#)?\s*["']?([A-Za-z0-9][A-Za-z0-9._:/+-]{1,})["']?/gi,
      accept: looksStructuredIdentifier,
    },
    {
      label: "timestamp",
      aliases: STRUCTURED_FIELD_ALIASES.timestamp,
      strategy: "prefix" as const,
      regex: /\b(?:timestamp|created(?:\s+at)?|created_at|createdAt|time|date)\s*(?:=|:)?\s*["']?(\d{4}-\d{2}-\d{2}(?:[tT ][0-9:.+-]{2,})?)["']?/gi,
      accept: (value: string) => value.length >= 10,
    },
    {
      label: "role",
      aliases: STRUCTURED_FIELD_ALIASES.role,
      strategy: "exact" as const,
      regex: /\brole\s*(?:=|:)?\s*["']?(user|assistant|system|tool|developer)["']?/gi,
      accept: (value: string) => value.length >= 3,
    },
    {
      label: "topic",
      aliases: STRUCTURED_FIELD_ALIASES.topic,
      strategy: "exact" as const,
      regex: /\btopic\s*(?:=|:)?\s*["']?([A-Za-z][A-Za-z0-9_-]{1,40})["']?/gi,
      accept: (value: string) => value.trim().length >= 2,
    },
    {
      label: "user_id",
      aliases: STRUCTURED_FIELD_ALIASES.userId,
      strategy: "exact" as const,
      regex: /\b(?:user(?:\s+id)?|user_id|userId)\s*(?:=|:|#)?\s*["']?([A-Za-z0-9][A-Za-z0-9._:/+-]{1,})["']?/gi,
      accept: looksStructuredIdentifier,
    },
  ];

  for (const pattern of naturalLanguagePatterns) {
    for (const match of normalizedQuery.matchAll(pattern.regex)) {
      const value = match[1]?.trim();
      if (!value || !pattern.accept(value)) {
        continue;
      }
      constraints.push({
        label: pattern.label,
        aliases: pattern.aliases,
        value,
        normalizedValue: normalizeStructuredValue(value),
        strategy: pattern.strategy,
      });
      if (typeof match.index === "number") {
        remainingSpans.push({
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }
  }

  const deduped = dedupeStructuredConstraints(constraints);
  const fallbackQuery = normalizeWhitespace(removeMatchedSpans(normalizedQuery, remainingSpans));
  return {
    constraints: deduped,
    fallbackQuery,
  };
}

function extractExplicitStructuredFieldMatches(query: string): {
  constraints: Array<StructuredQueryConstraint>;
  spans: Array<{ start: number; end: number }>;
} {
  const aliasMap = buildStructuredAliasMap();
  const constraints: Array<StructuredQueryConstraint> = [];
  const spans: Array<{ start: number; end: number }> = [];
  const explicitPattern = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:)\s*("([^"]+)"|'([^']+)'|([^\s,;]+))/g;

  for (const match of query.matchAll(explicitPattern)) {
    const rawField = match[1]?.trim();
    const rawValue = match[3] ?? match[4] ?? match[5] ?? "";
    if (!rawField || !rawValue.trim()) {
      continue;
    }

    const normalizedField = rawField.toLowerCase();
    const resolved = aliasMap.get(normalizedField);
    if (!resolved) {
      continue;
    }

    const value = rawValue.trim();
    if (!acceptStructuredConstraintValue(resolved.label, value)) {
      continue;
    }

    constraints.push({
      label: resolved.label,
      aliases: resolved.aliases,
      value,
      normalizedValue: normalizeStructuredValue(value),
      strategy: resolved.strategy,
    });
    if (typeof match.index === "number") {
      spans.push({
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }

  return {
    constraints,
    spans,
  };
}

function buildStructuredAliasMap(): Map<
  string,
  { label: string; aliases: ReadonlyArray<string>; strategy: "exact" | "prefix" }
> {
  const map = new Map<
    string,
    { label: string; aliases: ReadonlyArray<string>; strategy: "exact" | "prefix" }
  >();
  const register = (
    aliases: ReadonlyArray<string>,
    label: string,
    strategy: "exact" | "prefix"
  ) => {
    for (const alias of aliases) {
      map.set(alias.toLowerCase(), {
        label,
        aliases,
        strategy,
      });
    }
  };

  register([...STRUCTURED_FIELD_ALIASES.conversationId, ...STRUCTURED_FIELD_ALIASES.sessionId], "conversation_id", "exact");
  register(STRUCTURED_FIELD_ALIASES.messageId, "message_id", "exact");
  register(STRUCTURED_FIELD_ALIASES.id, "id", "exact");
  register(STRUCTURED_FIELD_ALIASES.timestamp, "timestamp", "prefix");
  register(STRUCTURED_FIELD_ALIASES.role, "role", "exact");
  register(STRUCTURED_FIELD_ALIASES.topic, "topic", "exact");
  register(STRUCTURED_FIELD_ALIASES.userId, "user_id", "exact");

  return map;
}

function acceptStructuredConstraintValue(label: string, value: string): boolean {
  if (!value.trim()) {
    return false;
  }
  if (label === "timestamp") {
    return value.trim().length >= 10;
  }
  if (label === "role") {
    return /^(user|assistant|system|tool|developer)$/i.test(value.trim());
  }
  if (label === "topic") {
    return value.trim().length >= 2;
  }
  return looksStructuredIdentifier(value) || value.trim().length >= 2;
}

function matchesConstraint(
  record: Record<string, string>,
  constraint: StructuredQueryConstraint
): boolean {
  for (const alias of constraint.aliases) {
    const value = record[alias];
    if (!value) {
      continue;
    }
    const normalizedRecordValue = normalizeStructuredValue(value);
    if (!normalizedRecordValue) {
      continue;
    }
    if (constraint.strategy === "prefix") {
      if (normalizedRecordValue.startsWith(constraint.normalizedValue)) {
        return true;
      }
      continue;
    }
    if (normalizedRecordValue === constraint.normalizedValue) {
      return true;
    }
  }
  return false;
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
      const structuredRecord = extractStructuredRecord(parsed);
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
          structuredRecord,
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
    "timestamp",
    "created_at",
    "createdAt",
  ];
  for (const key of preferredKeys) {
    const value = record[key];
    if ((typeof value === "string" || typeof value === "number") && String(value).trim()) {
      return `${documentName} - ${key}:${String(value).trim()}`;
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

function extractStructuredRecord(record: Record<string, unknown>): Record<string, string> {
  const extracted: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      extracted[key] = truncateForChunk(String(value), 160);
    }
  }
  return extracted;
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

function normalizeStructuredValue(value: string): string {
  return normalizeWhitespace(value).toLowerCase();
}

function dedupeStructuredConstraints(
  constraints: Array<StructuredQueryConstraint>
): Array<StructuredQueryConstraint> {
  const deduped: Array<StructuredQueryConstraint> = [];
  const seen = new Set<string>();
  for (const constraint of constraints) {
    const key = `${constraint.label}:${constraint.normalizedValue}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(constraint);
  }
  return deduped;
}

function removeMatchedSpans(
  query: string,
  spans: Array<{ start: number; end: number }>
): string {
  if (spans.length === 0) {
    return query;
  }

  const ordered = [...spans].sort((left, right) => left.start - right.start);
  let cursor = 0;
  let output = "";
  for (const span of ordered) {
    if (span.start < cursor) {
      continue;
    }
    output += `${query.slice(cursor, span.start)} `;
    cursor = span.end;
  }
  output += query.slice(cursor);
  return output;
}

function looksStructuredIdentifier(value: string): boolean {
  return /\d/.test(value) || /[-_:/.]/.test(value);
}

function asStructuredRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const entries = Object.entries(value as Record<string, unknown>).filter(
    ([, entryValue]) => typeof entryValue === "string"
  ) as Array<[string, string]>;
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries);
}

function mergeCandidates(
  preferred: Array<RagCandidate>,
  fallback: Array<RagCandidate>,
  maxCandidates: number
): Array<RagCandidate> {
  const merged: Array<RagCandidate> = [];
  const seen = new Map<string, number>();
  for (const candidate of [...preferred, ...fallback]) {
    const key = `${candidate.sourceId}:${String(candidate.metadata?.recordIndex ?? "")}:${candidate.content}`;
    const existingIndex = seen.get(key);
    if (existingIndex === undefined) {
      seen.set(key, merged.length);
      merged.push(candidate);
    } else {
      merged[existingIndex] = {
        ...(merged[existingIndex]!.score >= candidate.score ? merged[existingIndex]! : candidate),
        score: Math.max(merged[existingIndex]!.score, candidate.score),
        metadata: {
          ...(candidate.metadata ?? {}),
          ...(merged[existingIndex]!.metadata ?? {}),
          structuredQueryMatches: [
            ...new Set([
              ...((Array.isArray(merged[existingIndex]!.metadata?.structuredQueryMatches)
                ? merged[existingIndex]!.metadata?.structuredQueryMatches
                : []) as Array<string>),
              ...((Array.isArray(candidate.metadata?.structuredQueryMatches)
                ? candidate.metadata?.structuredQueryMatches
                : []) as Array<string>),
            ]),
          ],
        },
      };
    }
    if (merged.length >= maxCandidates) {
      break;
    }
  }
  return merged;
}
