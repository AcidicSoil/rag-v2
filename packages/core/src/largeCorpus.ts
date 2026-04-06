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
  browser: RagFileSystemBrowser | undefined
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
  return cloneAnalysis(analysis);
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
