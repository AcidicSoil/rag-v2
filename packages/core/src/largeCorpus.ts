import type { RagDocument } from "./contracts";
import { buildHierarchicalDocumentIndex } from "./localRetrieval";
import type { RagExecutionRoute } from "./outputContracts";
import type {
  FileExtensionCount,
  FileInfoResponse,
  RagCorpusAnalysis,
  RagDirectoryManifest,
  RagFileSynopsis,
  RagFileSystemBrowser,
  RagHierarchicalIndexStore,
  RagLargeCorpusAnalysisStore,
  RagLoadedCorpus,
} from "./runtimeContracts";

const LARGE_FILE_BYTES = 512 * 1024;
const HUGE_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_HEAVY_THRESHOLD = 0.6;
const LARGE_CORPUS_CACHE_LIMIT = 32;
const largeCorpusAnalysisCache = new Map<string, RagCorpusAnalysis>();
const GLOBAL_QUERY_PATTERNS = [
  /\b(overall|summarize|summary|overview|what(?:'s| is) in|what does .* contain)\b/i,
  /\bthemes?|topics?|patterns?|dominant|across the corpus|across the dataset|across the directory\b/i,
  /\bkind(?:s)? of\b/i,
  /\bhigh[- ]level\b/i,
];
const LOCAL_QUERY_PATTERNS = [
  /\bfind\b/i,
  /\bwhich\b/i,
  /\bwhere\b/i,
  /\bshow me\b/i,
  /\bspecific\b/i,
  /\bconversation\b/i,
  /\bsession\b/i,
  /\bmessage\b/i,
  /\btool usage\b/i,
  /\bwhen\b/i,
];

export async function analyzeLargeCorpus(
  paths: Array<string> | undefined,
  query: string,
  corpus: RagLoadedCorpus,
  browser: RagFileSystemBrowser | undefined,
  analysisStore?: RagLargeCorpusAnalysisStore,
  hierarchicalIndexStore?: RagHierarchicalIndexStore
): Promise<RagCorpusAnalysis | undefined> {
  if (!browser || !paths || paths.length === 0) {
    return undefined;
  }

  const questionScope = inferQuestionScope(query);
  const manifests: Array<RagDirectoryManifest> = [];
  const synopses: Array<RagFileSynopsis> = [];
  const notes: Array<string> = [];
  const oversizedPaths: Array<string> = [];
  const inspectedInfos: Array<FileInfoResponse> = [];
  let sawDirectory = false;
  let sawFile = false;
  let textHeavyScore = 0;
  let binaryHeavyScore = 0;

  for (const inputPath of paths.slice(0, 8)) {
    const info = await browser.fileInfo({ path: inputPath });
    inspectedInfos.push(info);
  }

  const cacheKey = buildLargeCorpusCacheKey(questionScope, inspectedInfos);
  const cached = largeCorpusAnalysisCache.get(cacheKey);
  if (cached) {
    return cloneAnalysis(cached, `Reused cached large-corpus analysis for ${inspectedInfos.length} path(s).`);
  }

  const persisted = await analysisStore?.get(cacheKey);
  if (persisted) {
    const hydrated = await hydratePersistedAnalysis(
      persisted,
      corpus,
      cacheKey,
      hierarchicalIndexStore
    );
    setLargeCorpusCache(cacheKey, hydrated);
    const reuseNote = hydrated.notes.some((note) => note.includes("Reused persisted hierarchical index"))
      ? `Reused persisted large-corpus analysis for ${inspectedInfos.length} path(s).`
      : `Reused persisted large-corpus analysis for ${inspectedInfos.length} path(s).`;
    return cloneAnalysis(hydrated, reuseNote);
  }

  for (const [index, inputPath] of paths.slice(0, 8).entries()) {
    const info = inspectedInfos[index];
    if (!info?.exists || !info.type) {
      notes.push(`Path could not be inspected: ${inputPath}.`);
      continue;
    }

    if (info.type === "directory") {
      sawDirectory = true;
      const manifest = await buildDirectoryManifest(inputPath, info, browser);
      manifests.push(manifest);
      oversizedPaths.push(...manifest.oversizedFiles.map((file) => file.path));
      if (manifest.dominantModality === "binary-heavy") {
        binaryHeavyScore += 2;
      } else if (manifest.dominantModality === "text-heavy") {
        textHeavyScore += 2;
      } else {
        textHeavyScore += 1;
        binaryHeavyScore += 1;
      }
    } else {
      sawFile = true;
      const synopsis = await buildFileSynopsis(inputPath, info, browser);
      synopses.push(synopsis);
      if (synopsis.oversized) {
        oversizedPaths.push(synopsis.path);
      }
      if (synopsis.textLike) {
        textHeavyScore += 2;
      } else {
        binaryHeavyScore += 2;
      }
    }
  }

  if (manifests.length === 0 && synopses.length === 0) {
    return undefined;
  }

  const targetType = sawDirectory && sawFile ? "mixed" : sawDirectory ? "directory" : "file";
  const modality =
    binaryHeavyScore === 0 && textHeavyScore === 0
      ? "unknown"
      : binaryHeavyScore > textHeavyScore
        ? "binary-heavy"
        : textHeavyScore > binaryHeavyScore
          ? "text-heavy"
          : "mixed";

  const summaryDocuments = buildSummaryDocuments(manifests, synopses);
  const needsHierarchicalIndex = shouldBuildHierarchicalIndex({
    questionScope,
    oversizedPaths,
    modality,
    targetType,
  });
  const hierarchicalIndex = needsHierarchicalIndex
    ? buildHierarchicalDocumentIndex(selectHierarchicalDocuments(corpus.documents, synopses, oversizedPaths))
    : undefined;
  const recommendedRoute = recommendLargeCorpusRoute({
    questionScope,
    targetType,
    modality,
    oversizedFileCount: oversizedPaths.length,
    corpus,
  });

  notes.push(
    `Large-corpus analysis classified scope=${questionScope}, target=${targetType}, modality=${modality}, oversizedFiles=${oversizedPaths.length}.`
  );
  if (hierarchicalIndex) {
    notes.push(`Built hierarchical index with ${hierarchicalIndex.nodes.length} parent nodes.`);
  }

  const analysis = {
    questionScope,
    targetType,
    modality,
    recommendedRoute,
    notes,
    summaryDocuments,
    directoryManifests: manifests,
    largeFileSynopses: synopses,
    oversizedPaths: [...new Set(oversizedPaths)],
    hierarchicalIndex,
  } satisfies RagCorpusAnalysis;

  setLargeCorpusCache(cacheKey, analysis);
  await analysisStore?.set(cacheKey, stripAnalysisForPersistence(analysis));
  if (hierarchicalIndex) {
    await hierarchicalIndexStore?.set(cacheKey, hierarchicalIndex);
  }
  return cloneAnalysis(analysis);
}

export function analyzeLargeDocumentCorpus(
  query: string,
  corpus: RagLoadedCorpus
): RagCorpusAnalysis | undefined {
  if (corpus.documents.length === 0) {
    return undefined;
  }

  const questionScope = inferQuestionScope(query);
  const synopses = corpus.documents.map((document) => buildDocumentSynopsis(document));
  const oversizedPaths = synopses.filter((synopsis) => synopsis.oversized).map((synopsis) => synopsis.path);
  const targetType = corpus.documents.length === 1 ? "file" : "mixed";
  const modality = inferDocumentCorpusModality(synopses);
  const summaryDocuments = buildSummaryDocuments([], synopses);
  const hierarchicalIndex = shouldBuildHierarchicalIndex({
    questionScope,
    oversizedPaths,
    modality,
    targetType,
  })
    ? buildHierarchicalDocumentIndex(selectHierarchicalDocuments(corpus.documents, synopses, oversizedPaths))
    : undefined;
  const recommendedRoute = recommendLargeCorpusRoute({
    questionScope,
    targetType,
    modality,
    oversizedFileCount: oversizedPaths.length,
    corpus,
  });

  const analysis = {
    questionScope,
    targetType,
    modality,
    recommendedRoute,
    notes: [
      `Large-corpus document analysis classified scope=${questionScope}, target=${targetType}, modality=${modality}, oversizedFiles=${oversizedPaths.length}.`,
    ],
    summaryDocuments,
    directoryManifests: [],
    largeFileSynopses: synopses,
    oversizedPaths: [...new Set(oversizedPaths)],
    hierarchicalIndex,
  } satisfies RagCorpusAnalysis;

  if (hierarchicalIndex) {
    analysis.notes.push(`Built hierarchical index with ${hierarchicalIndex.nodes.length} parent nodes.`);
  }

  return analysis;
}

function buildLargeCorpusCacheKey(
  questionScope: "local" | "global",
  infos: Array<FileInfoResponse>
): string {
  const parts = infos.map((info) => {
    if (!info.exists) {
      return [info.resolvedPath, "missing"].join("|");
    }
    return [
      info.resolvedPath,
      info.type ?? "unknown",
      info.modifiedTimeMs ?? "nomtime",
      info.sizeBytes ?? "nosize",
      info.fileCount ?? "nofiles",
      info.directoryCount ?? "nodirs",
    ].join("|");
  });

  return `${questionScope}::${parts.join("::")}`;
}

function setLargeCorpusCache(key: string, analysis: RagCorpusAnalysis) {
  if (largeCorpusAnalysisCache.has(key)) {
    largeCorpusAnalysisCache.delete(key);
  }
  largeCorpusAnalysisCache.set(key, analysis);
  while (largeCorpusAnalysisCache.size > LARGE_CORPUS_CACHE_LIMIT) {
    const oldestKey = largeCorpusAnalysisCache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    largeCorpusAnalysisCache.delete(oldestKey);
  }
}

function stripAnalysisForPersistence(
  analysis: RagCorpusAnalysis
): RagCorpusAnalysis {
  return {
    ...analysis,
    notes: [...analysis.notes],
    summaryDocuments: [...analysis.summaryDocuments],
    directoryManifests: [...analysis.directoryManifests],
    largeFileSynopses: [...analysis.largeFileSynopses],
    oversizedPaths: [...analysis.oversizedPaths],
    hierarchicalIndex: undefined,
  };
}

async function hydratePersistedAnalysis(
  analysis: RagCorpusAnalysis,
  corpus: RagLoadedCorpus,
  cacheKey: string,
  hierarchicalIndexStore?: RagHierarchicalIndexStore
): Promise<RagCorpusAnalysis> {
  const hydrated = cloneAnalysis(analysis);
  if (!hydrated.hierarchicalIndex && shouldBuildHierarchicalIndex({
    questionScope: hydrated.questionScope,
    oversizedPaths: hydrated.oversizedPaths,
    modality: hydrated.modality,
    targetType: hydrated.targetType,
  })) {
    const persistedIndex = await hierarchicalIndexStore?.get(cacheKey);
    if (persistedIndex) {
      hydrated.hierarchicalIndex = persistedIndex;
      hydrated.notes.push(
        `Reused persisted hierarchical index with ${persistedIndex.nodes.length} parent nodes.`
      );
    } else {
      hydrated.hierarchicalIndex = buildHierarchicalDocumentIndex(
        selectHierarchicalDocuments(
          corpus.documents,
          hydrated.largeFileSynopses,
          hydrated.oversizedPaths
        )
      );
      hydrated.notes.push(
        `Rebuilt hierarchical index with ${hydrated.hierarchicalIndex.nodes.length} parent nodes after persisted analysis reuse.`
      );
    }
  }
  return hydrated;
}

export function clearLargeCorpusAnalysisCacheForTests() {
  largeCorpusAnalysisCache.clear();
}

function cloneAnalysis(
  analysis: RagCorpusAnalysis,
  extraNote?: string
): RagCorpusAnalysis {
  return {
    ...analysis,
    notes: extraNote ? [...analysis.notes, extraNote] : [...analysis.notes],
    summaryDocuments: [...analysis.summaryDocuments],
    directoryManifests: [...analysis.directoryManifests],
    largeFileSynopses: [...analysis.largeFileSynopses],
    oversizedPaths: [...analysis.oversizedPaths],
  };
}

export function inferQuestionScope(query: string): "local" | "global" {
  const normalized = query.trim();
  const hasStructuredLookupIntent =
    /\b(?:conversation|session|message|record|timestamp|created(?:\s+at)?|date|time)\b/i.test(normalized) &&
    (/[A-Za-z0-9]+[-_:/.][A-Za-z0-9:_./-]+/.test(normalized) || /\b\d{4}-\d{2}-\d{2}\b/.test(normalized));
  if (hasStructuredLookupIntent) {
    return "local";
  }
  if (GLOBAL_QUERY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "global";
  }
  if (LOCAL_QUERY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "local";
  }
  return normalized.split(/\s+/).length <= 8 ? "local" : "global";
}

async function buildDirectoryManifest(
  inputPath: string,
  info: FileInfoResponse,
  browser: RagFileSystemBrowser
): Promise<RagDirectoryManifest> {
  const browse = await browser.browse({
    path: inputPath,
    recursive: true,
    maxDepth: 4,
    maxEntries: 200,
    includeHidden: false,
  });
  const topExtensions = info.topExtensions ?? browse.topExtensions ?? [];
  const fileCount = info.fileCount ?? browse.fileCount ?? 0;
  const directoryCount = info.directoryCount ?? browse.directoryCount ?? 0;
  const representativeFiles = browse.entries
    .filter((entry) => entry.type === "file")
    .slice(0, 8)
    .map((entry) => entry.path);
  const oversizedFiles = browse.entries
    .filter((entry) => entry.type === "file" && (entry.sizeBytes ?? 0) >= LARGE_FILE_BYTES)
    .sort((left, right) => (right.sizeBytes ?? 0) - (left.sizeBytes ?? 0))
    .slice(0, 8)
    .map((entry) => ({
      path: entry.path,
      sizeBytes: entry.sizeBytes ?? 0,
      extension: entry.extension,
    }));

  return {
    path: inputPath,
    resolvedPath: info.resolvedPath,
    fileCount,
    directoryCount,
    topExtensions,
    representativeFiles,
    oversizedFiles,
    dominantModality: inferDominantModality(fileCount, topExtensions),
    truncated: browse.truncated,
  };
}

async function buildFileSynopsis(
  inputPath: string,
  info: FileInfoResponse,
  browser: RagFileSystemBrowser
): Promise<RagFileSynopsis> {
  const extension = normalizeExtension(info.extension);
  const format = detectFormat(extension);
  const head = info.textLike
    ? await browser.readFile({ path: inputPath, startLine: 0, maxLines: 80, maxChars: 8000 })
    : undefined;
  let tail;
  if (info.textLike && (info.sizeBytes ?? 0) >= LARGE_FILE_BYTES) {
    tail = await browser.readFile({ path: inputPath, startLine: 400, maxLines: 80, maxChars: 8000 });
  }

  return {
    path: inputPath,
    resolvedPath: info.resolvedPath,
    extension,
    sizeBytes: info.sizeBytes ?? 0,
    textLike: info.textLike ?? false,
    oversized: (info.sizeBytes ?? 0) >= LARGE_FILE_BYTES,
    format,
    synopsis: summarizeSample(format, head?.content, tail?.content),
    sampleStrategy:
      (info.sizeBytes ?? 0) >= HUGE_FILE_BYTES ? "bounded-head-tail" : "bounded-head",
    sampleHead: truncateForMetadata(head?.content),
    sampleTail: truncateForMetadata(tail?.content),
  };
}

function buildDocumentSynopsis(document: RagDocument): RagFileSynopsis {
  const inferredPath = inferDocumentPath(document);
  const extension = inferDocumentExtension(document, inferredPath);
  const format = detectFormat(extension);
  const sizeBytes = Buffer.byteLength(document.content, "utf8");
  const textLike = looksTextLike(document.content);
  const rawHead = document.content.slice(0, 8000);
  const rawTail =
    sizeBytes >= LARGE_FILE_BYTES
      ? document.content.slice(Math.max(0, document.content.length - 8000))
      : undefined;
  const sampleHead = truncateForMetadata(rawHead);
  const sampleTail = rawTail ? truncateForMetadata(rawTail) : undefined;

  return {
    path: inferredPath,
    resolvedPath: inferredPath,
    extension,
    sizeBytes,
    textLike,
    oversized: sizeBytes >= LARGE_FILE_BYTES,
    format,
    synopsis: summarizeSample(format, rawHead, rawTail),
    sampleStrategy: sizeBytes >= HUGE_FILE_BYTES ? "bounded-head-tail" : "bounded-head",
    sampleHead,
    sampleTail,
  };
}

function inferDocumentCorpusModality(
  synopses: Array<RagFileSynopsis>
): RagCorpusAnalysis["modality"] {
  if (synopses.length === 0) {
    return "unknown";
  }

  const textCount = synopses.filter((synopsis) => synopsis.textLike).length;
  const binaryCount = synopses.length - textCount;
  if (binaryCount / synopses.length >= BINARY_HEAVY_THRESHOLD) {
    return "binary-heavy";
  }
  if (textCount === synopses.length) {
    return "text-heavy";
  }
  return textCount >= binaryCount ? "mixed" : "binary-heavy";
}

function inferDocumentPath(document: RagDocument): string {
  const candidate =
    (typeof document.metadata?.discoveredPath === "string" && document.metadata.discoveredPath) ||
    (typeof document.metadata?.absolutePath === "string" && document.metadata.absolutePath) ||
    (typeof document.metadata?.path === "string" && document.metadata.path) ||
    document.name ||
    document.id;
  return candidate;
}

function inferDocumentExtension(document: RagDocument, inferredPath: string): string | undefined {
  const metadataExtension =
    typeof document.metadata?.extension === "string" ? document.metadata.extension : undefined;
  return normalizeExtension(metadataExtension ?? inferredPath.split("/").pop()?.match(/(\.[^.]+)$/)?.[1]);
}

function looksTextLike(value: string): boolean {
  if (!value) {
    return false;
  }
  let suspicious = 0;
  const sample = value.slice(0, 2048);
  for (let index = 0; index < sample.length; index += 1) {
    const code = sample.charCodeAt(index);
    if (code === 65533 || (code < 9 || (code > 13 && code < 32))) {
      suspicious += 1;
    }
  }
  return suspicious / Math.max(sample.length, 1) < 0.05;
}

function detectFormat(extension?: string): RagFileSynopsis["format"] {
  if (extension === ".jsonl") {
    return "jsonl";
  }
  if (extension === ".json") {
    return "json";
  }
  if (extension === ".html" || extension === ".htm") {
    return "html";
  }
  if (extension === ".md" || extension === ".markdown") {
    return "markdown";
  }
  return "text";
}

function summarizeSample(
  format: RagFileSynopsis["format"],
  head?: string,
  tail?: string
): string {
  const parts: Array<string> = [];
  const headSummary = summarizeTextWindow(head);
  const tailSummary = summarizeTextWindow(tail);

  if (format === "jsonl") {
    parts.push("Structured as line-delimited JSON.");
    const schemaHint = summarizeJsonlSchema(head, tail);
    if (schemaHint) {
      parts.push(schemaHint);
    }
  } else if (format === "json") {
    parts.push("Structured as JSON.");
  } else if (format === "html") {
    parts.push("Structured as HTML with markup-heavy content.");
  }

  if (headSummary) {
    parts.push(`Head sample: ${headSummary}`);
  }
  if (tailSummary && tailSummary !== headSummary) {
    parts.push(`Tail sample: ${tailSummary}`);
  }

  return parts.join(" ").trim() || "No text synopsis available.";
}

function summarizeTextWindow(text?: string): string | undefined {
  if (!text) {
    return undefined;
  }
  const cleaned = text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) {
    return undefined;
  }
  return truncateForMetadata(cleaned, 280);
}

function summarizeJsonlSchema(head?: string, tail?: string): string | undefined {
  const fieldCounts = new Map<string, number>();
  for (const window of [head, tail]) {
    if (!window) {
      continue;
    }
    for (const line of window.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          continue;
        }
        for (const key of Object.keys(parsed)) {
          fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1);
        }
      } catch {
        continue;
      }
    }
  }

  if (fieldCounts.size === 0) {
    return undefined;
  }

  const topFields = [...fieldCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([field]) => field);
  return `Observed fields: ${topFields.join(", ")}.`;
}

function truncateForMetadata(text?: string, maxLength = 500): string | undefined {
  if (!text) {
    return undefined;
  }
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1)}…`;
}

function buildStructuredSynopsisSummary(
  synopsis: RagFileSynopsis
): RagDocument | undefined {
  if (synopsis.format !== "jsonl") {
    return undefined;
  }

  const fieldCounts = new Map<string, number>();
  const sampleValues = new Map<string, Set<string>>();

  for (const record of parseStructuredSynopsisSampleRecords(synopsis)) {
    for (const [key, value] of Object.entries(record)) {
      fieldCounts.set(key, (fieldCounts.get(key) ?? 0) + 1);
      if (
        typeof value !== "string" &&
        typeof value !== "number" &&
        typeof value !== "boolean"
      ) {
        continue;
      }
      const normalizedValue = truncateForMetadata(String(value), 80);
      if (!normalizedValue) {
        continue;
      }
      if (!sampleValues.has(key)) {
        sampleValues.set(key, new Set<string>());
      }
      const values = sampleValues.get(key);
      if (values && values.size < 4) {
        values.add(normalizedValue);
      }
    }
  }

  if (fieldCounts.size === 0) {
    return undefined;
  }

  const topFields = [...fieldCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 10)
    .map(([field]) => field);
  const preferredSampleKeys = [
    "conversation_id",
    "conversationId",
    "session_id",
    "sessionId",
    "id",
    "message_id",
    "messageId",
    "topic",
    "role",
    "timestamp",
    "created_at",
    "createdAt",
    "user_id",
    "userId",
  ];

  const sampleLines = preferredSampleKeys
    .filter((key) => sampleValues.has(key))
    .map((key) => `${key}: ${[...(sampleValues.get(key) ?? [])].join(", ")}`)
    .slice(0, 6);

  return {
    id: `structured-summary:${synopsis.resolvedPath}`,
    name: `structured-summary:${synopsis.path}`,
    content: [
      `Structured file: ${synopsis.path}`,
      `Format: ${synopsis.format}`,
      `Observed fields: ${topFields.join(", ")}`,
      sampleLines.length > 0 ? `Sample values:\n${sampleLines.join("\n")}` : undefined,
      `Synopsis: ${synopsis.synopsis}`,
    ]
      .filter(Boolean)
      .join("\n"),
    metadata: {
      sourceType: "structured-file-summary",
      path: synopsis.path,
      format: synopsis.format,
    },
  };
}

function buildStructuredAggregateSummaryDocuments(
  synopsis: RagFileSynopsis
): Array<RagDocument> {
  if (synopsis.format !== "jsonl") {
    return [];
  }

  const records = parseStructuredSynopsisSampleRecords(synopsis);
  if (records.length === 0) {
    return [];
  }

  const topicCounts = new Map<string, number>();
  const timeBucketCounts = new Map<string, number>();
  const entitySamples = new Map<string, Set<string>>();

  for (const record of records) {
    const topic = firstScalar(record, ["topic", "subject"]);
    if (topic) {
      topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1);
    }

    const timestamp = firstScalar(record, ["timestamp", "created_at", "createdAt", "time", "date"]);
    const timeBucket = timestamp ? normalizeTimeBucket(timestamp) : undefined;
    if (timeBucket) {
      timeBucketCounts.set(timeBucket, (timeBucketCounts.get(timeBucket) ?? 0) + 1);
    }

    for (const [label, aliases] of [
      ["conversation ids", ["conversation_id", "conversationId", "session_id", "sessionId"]],
      ["message ids", ["message_id", "messageId", "id"]],
      ["users", ["user_id", "userId"]],
      ["roles", ["role"]],
    ] as Array<[string, Array<string>]>) {
      const value = firstScalar(record, aliases);
      if (!value) {
        continue;
      }
      if (!entitySamples.has(label)) {
        entitySamples.set(label, new Set<string>());
      }
      const values = entitySamples.get(label);
      if (values && values.size < 6) {
        values.add(value);
      }
    }
  }

  const documents: Array<RagDocument> = [];
  const topTopics = formatTopSampledCounts(topicCounts, 8);
  if (topTopics.length > 0) {
    documents.push({
      id: `structured-topic-summary:${synopsis.resolvedPath}`,
      name: `structured-topic-summary:${synopsis.path}`,
      content: [
        `Structured topic summary for: ${synopsis.path}`,
        `Sampled topics: ${topTopics.join(", ")}`,
        `Based on sampled JSONL windows from the file synopsis.`,
      ].join("\n"),
      metadata: {
        sourceType: "structured-topic-summary",
        path: synopsis.path,
        format: synopsis.format,
      },
    });
  }

  const topTimeBuckets = formatTopSampledCounts(timeBucketCounts, 8);
  if (topTimeBuckets.length > 0) {
    documents.push({
      id: `structured-time-summary:${synopsis.resolvedPath}`,
      name: `structured-time-summary:${synopsis.path}`,
      content: [
        `Structured time summary for: ${synopsis.path}`,
        `Sampled time buckets: ${topTimeBuckets.join(", ")}`,
        `Based on sampled JSONL windows from the file synopsis.`,
      ].join("\n"),
      metadata: {
        sourceType: "structured-time-summary",
        path: synopsis.path,
        format: synopsis.format,
      },
    });
  }

  const entityLines = [...entitySamples.entries()]
    .map(([label, values]) => `${label}: ${[...values].join(", ")}`)
    .slice(0, 4);
  if (entityLines.length > 0) {
    documents.push({
      id: `structured-entity-summary:${synopsis.resolvedPath}`,
      name: `structured-entity-summary:${synopsis.path}`,
      content: [
        `Structured entity summary for: ${synopsis.path}`,
        ...entityLines,
        `Based on sampled JSONL windows from the file synopsis.`,
      ].join("\n"),
      metadata: {
        sourceType: "structured-entity-summary",
        path: synopsis.path,
        format: synopsis.format,
      },
    });
  }

  return documents;
}

function parseStructuredSynopsisSampleRecords(
  synopsis: RagFileSynopsis
): Array<Record<string, unknown>> {
  if (synopsis.format !== "jsonl") {
    return [];
  }

  const records: Array<Record<string, unknown>> = [];
  for (const window of [synopsis.sampleHead, synopsis.sampleTail]) {
    if (!window) {
      continue;
    }

    const directLines = window.split(/\r?\n/);
    const candidates = directLines.length > 1
      ? directLines
      : Array.from(window.matchAll(/\{[^{}]+\}/g)).map((match) => match[0]);

    for (const candidate of candidates) {
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          continue;
        }
        records.push(parsed);
      } catch {
        continue;
      }
    }
  }
  return records;
}

function firstScalar(record: Record<string, unknown>, aliases: Array<string>): string | undefined {
  for (const alias of aliases) {
    const value = record[alias];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean"
    ) {
      const normalized = truncateForMetadata(String(value), 80);
      if (normalized) {
        return normalized;
      }
    }
  }
  return undefined;
}

function normalizeTimeBucket(value: string): string | undefined {
  const trimmed = value.trim();
  const fullDateMatch = trimmed.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (fullDateMatch) {
    return fullDateMatch[1];
  }
  const monthMatch = trimmed.match(/\b(\d{4}-\d{2})\b/);
  if (monthMatch) {
    return monthMatch[1];
  }
  return undefined;
}

function formatTopSampledCounts(counts: Map<string, number>, limit: number): Array<string> {
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([value, count]) => `${value} (${count})`);
}

function buildSummaryDocuments(
  manifests: Array<RagDirectoryManifest>,
  synopses: Array<RagFileSynopsis>
): Array<RagDocument> {
  const documents: Array<RagDocument> = [];

  for (const manifest of manifests) {
    documents.push({
      id: `manifest:${manifest.resolvedPath}`,
      name: `manifest:${manifest.path}`,
      content: [
        `Directory: ${manifest.path}`,
        `Files: ${manifest.fileCount}`,
        `Subdirectories: ${manifest.directoryCount}`,
        `Dominant modality: ${manifest.dominantModality}`,
        `Top extensions: ${formatTopExtensions(manifest.topExtensions)}`,
        `Representative files: ${manifest.representativeFiles.join(", ") || "none"}`,
        `Oversized files: ${manifest.oversizedFiles
          .map((file) => `${file.path} (${file.sizeBytes} bytes)`)
          .join(", ") || "none"}`,
      ].join("\n"),
      metadata: {
        sourceType: "directory-manifest",
        path: manifest.path,
      },
    });
  }

  for (const synopsis of synopses) {
    const structuredSummary = buildStructuredSynopsisSummary(synopsis);
    if (structuredSummary) {
      documents.push(structuredSummary);
    }
    documents.push(...buildStructuredAggregateSummaryDocuments(synopsis));

    documents.push({
      id: `synopsis:${synopsis.resolvedPath}`,
      name: `synopsis:${synopsis.path}`,
      content: [
        `File: ${synopsis.path}`,
        `Format: ${synopsis.format}`,
        `Text-like: ${synopsis.textLike}`,
        `Oversized: ${synopsis.oversized}`,
        `Sample strategy: ${synopsis.sampleStrategy}`,
        `Synopsis: ${synopsis.synopsis}`,
        synopsis.sampleHead ? `Sample head: ${synopsis.sampleHead}` : undefined,
        synopsis.sampleTail ? `Sample tail: ${synopsis.sampleTail}` : undefined,
      ]
        .filter(Boolean)
        .join("\n"),
      metadata: {
        sourceType: "file-synopsis",
        path: synopsis.path,
        format: synopsis.format,
      },
    });
  }

  return documents;
}

function shouldBuildHierarchicalIndex(input: {
  questionScope: "local" | "global";
  oversizedPaths: Array<string>;
  modality: RagCorpusAnalysis["modality"];
  targetType: RagCorpusAnalysis["targetType"];
}): boolean {
  if (input.questionScope !== "local") {
    return false;
  }
  if (input.oversizedPaths.length > 0) {
    return true;
  }
  return input.targetType !== "directory" && input.modality === "text-heavy";
}

function selectHierarchicalDocuments(
  documents: Array<RagDocument>,
  synopses: Array<RagFileSynopsis>,
  oversizedPaths: Array<string>
): Array<RagDocument> {
  const oversizedSet = new Set(oversizedPaths.map((value) => value.toLowerCase()));
  const synopsisPaths = new Set(synopses.map((synopsis) => synopsis.path.toLowerCase()));

  const selected = documents.filter((document) => {
    const candidatePaths = [
      document.id,
      document.name,
      typeof document.metadata?.discoveredPath === "string"
        ? document.metadata.discoveredPath
        : undefined,
      typeof document.metadata?.absolutePath === "string"
        ? document.metadata.absolutePath
        : undefined,
      typeof document.metadata?.path === "string" ? document.metadata.path : undefined,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => value.toLowerCase());

    return candidatePaths.some(
      (value) => oversizedSet.has(value) || synopsisPaths.has(value)
    );
  });

  return selected.length > 0 ? selected : documents;
}

function recommendLargeCorpusRoute(input: {
  questionScope: "local" | "global";
  targetType: RagCorpusAnalysis["targetType"];
  modality: RagCorpusAnalysis["modality"];
  oversizedFileCount: number;
  corpus: RagLoadedCorpus;
}): RagExecutionRoute {
  if (input.questionScope === "global") {
    return "global-summary";
  }
  if (input.targetType === "directory") {
    return input.oversizedFileCount > 0 || input.modality === "binary-heavy"
      ? "sample"
      : "hierarchical-retrieval";
  }
  if (input.oversizedFileCount > 0) {
    return input.modality === "text-heavy" ? "hierarchical-retrieval" : "sample";
  }
  if ((input.corpus.estimatedTokens ?? 0) <= 4000) {
    return "full-context";
  }
  return "retrieval";
}

function inferDominantModality(
  fileCount: number,
  topExtensions: Array<FileExtensionCount>
): RagDirectoryManifest["dominantModality"] {
  if (fileCount <= 0 || topExtensions.length === 0) {
    return "unknown";
  }
  const binaryCount = topExtensions.reduce((sum, entry) => {
    return sum + (isLikelyBinaryExtension(entry.extension) ? entry.count : 0);
  }, 0);
  const textCount = topExtensions.reduce((sum, entry) => {
    return sum + (isLikelyTextExtension(entry.extension) ? entry.count : 0);
  }, 0);

  if (binaryCount / fileCount >= BINARY_HEAVY_THRESHOLD) {
    return "binary-heavy";
  }
  if (textCount >= binaryCount) {
    return "text-heavy";
  }
  return "mixed";
}

function isLikelyTextExtension(extension: string): boolean {
  const normalized = normalizeExtension(extension);
  return normalized
    ? [".txt", ".md", ".markdown", ".json", ".jsonl", ".html", ".htm", ".csv", ".ts", ".js", ".tsx", ".jsx", ".py", ".log", ".xml", ".yaml", ".yml"].includes(
        normalized
      )
    : false;
}

function isLikelyBinaryExtension(extension: string): boolean {
  const normalized = normalizeExtension(extension);
  return normalized
    ? [".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic", ".mp4", ".mp3", ".wav", ".mov", ".zip", ".pdf", ".docx", ".pptx", ".xlsx"].includes(
        normalized
      )
    : false;
}

function normalizeExtension(extension?: string): string | undefined {
  if (!extension) {
    return undefined;
  }
  return extension.startsWith(".") ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
}

function formatTopExtensions(topExtensions: Array<FileExtensionCount>): string {
  if (topExtensions.length === 0) {
    return "none";
  }
  return topExtensions.map((entry) => `${entry.extension}:${entry.count}`).join(", ");
}
