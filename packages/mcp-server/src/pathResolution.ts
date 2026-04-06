import { readFile, readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  FileExtensionCount,
  FileInfoRequest,
  FileInfoResponse,
  FileSystemBrowseEntry,
  FileSystemBrowseRequest,
  FileSystemBrowseResponse,
  ReadFileRequest,
  ReadFileResponse,
} from "../../core/src/runtimeContracts";

const TEXT_FILE_EXTENSIONS = new Set([
  ".c",
  ".cc",
  ".cfg",
  ".conf",
  ".cpp",
  ".cs",
  ".css",
  ".csv",
  ".go",
  ".h",
  ".hpp",
  ".html",
  ".ini",
  ".java",
  ".js",
  ".json",
  ".jsonl",
  ".kt",
  ".log",
  ".lua",
  ".md",
  ".mjs",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".sh",
  ".sql",
  ".svg",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".xml",
  ".yaml",
  ".yml",
]);

const IGNORED_DIRECTORY_NAMES = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".nuxt",
  "coverage",
  "tmp",
  "temp",
  "vendor",
  "target",
  ".cache",
]);

export interface FileDiscoveryResult {
  paths: Array<string>;
  truncated: boolean;
  errors: Array<string>;
}

export function expandUserPath(inputPath: string) {
  if (inputPath === "~") {
    return os.homedir();
  }
  if (inputPath.startsWith("~/") || inputPath.startsWith("~\\")) {
    return path.join(os.homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export function resolveUserPath(inputPath: string) {
  return path.resolve(expandUserPath(inputPath));
}

export async function discoverSupportedTextFiles(
  inputPath: string,
  options: {
    maxEntries?: number;
    includeHidden?: boolean;
    maxDepth?: number;
    ignoreDirectories?: boolean;
  } = {}
): Promise<FileDiscoveryResult> {
  const resolvedPath = resolveUserPath(inputPath);
  const state = {
    limit: options.maxEntries ?? 2000,
    includeHidden: options.includeHidden ?? false,
    maxDepth: options.maxDepth ?? 8,
    ignoreDirectories: options.ignoreDirectories ?? true,
    paths: [] as Array<string>,
    truncated: false,
    errors: [] as Array<string>,
  };

  await walkSupportedTextFiles(resolvedPath, 0, state);
  return {
    paths: state.paths,
    truncated: state.truncated,
    errors: state.errors,
  };
}

export async function browseFileSystem(
  input: FileSystemBrowseRequest
): Promise<FileSystemBrowseResponse> {
  const requestedPath = input.path;
  const resolvedPath = resolveUserPath(input.path);
  const recursive = input.recursive ?? false;
  const maxDepth = input.maxDepth ?? (recursive ? 3 : 1);
  const maxEntries = input.maxEntries ?? 200;
  const includeHidden = input.includeHidden ?? false;

  try {
    const rootStat = await stat(resolvedPath);
    const rootType = rootStat.isDirectory() ? "directory" : "file";

    if (rootType === "file") {
      return {
        requestedPath,
        resolvedPath,
        cwd: process.cwd(),
        exists: true,
        type: "file",
        entries: [toBrowseEntry(resolvedPath, rootStat)],
        truncated: false,
      };
    }

    const immediateEntries = await readdir(resolvedPath, { withFileTypes: true });
    const visibleEntries = immediateEntries.filter(
      (entry) => includeHidden || !entry.name.startsWith(".")
    );
    const summary = summarizeDirEntries(visibleEntries);

    const entries: Array<FileSystemBrowseEntry> = [];
    const state = { remaining: maxEntries, truncated: false, errors: [] as Array<string> };
    await walkBrowseEntries(resolvedPath, 0, maxDepth, recursive, includeHidden, entries, state);

    return {
      requestedPath,
      resolvedPath,
      cwd: process.cwd(),
      exists: true,
      type: "directory",
      entries,
      truncated: state.truncated,
      directoryCount: summary.directoryCount,
      fileCount: summary.fileCount,
      topExtensions: summary.topExtensions,
      errors: state.errors.length > 0 ? state.errors : undefined,
    };
  } catch (error) {
    return {
      requestedPath,
      resolvedPath,
      cwd: process.cwd(),
      exists: false,
      entries: [],
      truncated: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function fileInfo(input: FileInfoRequest): Promise<FileInfoResponse> {
  const requestedPath = input.path;
  const resolvedPath = resolveUserPath(input.path);
  try {
    const info = await stat(resolvedPath);
    const type = info.isDirectory() ? "directory" : info.isFile() ? "file" : undefined;
    let childCount: number | undefined;
    let directoryCount: number | undefined;
    let fileCount: number | undefined;
    let topExtensions: Array<FileExtensionCount> | undefined;
    if (type === "directory") {
      try {
        const children = await readdir(resolvedPath, { withFileTypes: true });
        const visibleChildren = children.filter((entry) => !entry.name.startsWith("."));
        childCount = visibleChildren.length;
        const summary = summarizeDirEntries(visibleChildren);
        directoryCount = summary.directoryCount;
        fileCount = summary.fileCount;
        topExtensions = summary.topExtensions;
      } catch {
        childCount = undefined;
      }
    }
    return {
      requestedPath,
      resolvedPath,
      cwd: process.cwd(),
      exists: true,
      type,
      sizeBytes: type === "file" ? normalizeStatSize(info.size) : undefined,
      extension: type === "file" ? path.extname(resolvedPath).toLowerCase() || undefined : undefined,
      textLike: type === "file" ? isSupportedTextFile(resolvedPath) : undefined,
      childCount,
      directoryCount,
      fileCount,
      topExtensions,
    };
  } catch (error) {
    return {
      requestedPath,
      resolvedPath,
      cwd: process.cwd(),
      exists: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

export async function readTextFileRange(input: ReadFileRequest): Promise<ReadFileResponse> {
  const requestedPath = input.path;
  const resolvedPath = resolveUserPath(input.path);
  const startLine = input.startLine ?? 0;
  const maxLines = input.maxLines ?? 200;
  const maxChars = input.maxChars ?? 20000;

  try {
    const info = await stat(resolvedPath);
    if (!info.isFile()) {
      return {
        requestedPath,
        resolvedPath,
        cwd: process.cwd(),
        exists: true,
        truncated: false,
        errors: ["Path is not a file."],
      };
    }
    if (!isSupportedTextFile(resolvedPath)) {
      return {
        requestedPath,
        resolvedPath,
        cwd: process.cwd(),
        exists: true,
        truncated: false,
        errors: ["File is not a supported text-like format for bounded reading."],
      };
    }

    const raw = await readFile(resolvedPath, "utf8");
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    const selected = lines.slice(startLine, startLine + maxLines);
    let content = selected.join("\n");
    let truncated = startLine + maxLines < lines.length;
    if (content.length > maxChars) {
      content = content.slice(0, maxChars);
      truncated = true;
    }
    return {
      requestedPath,
      resolvedPath,
      cwd: process.cwd(),
      exists: true,
      startLine,
      endLine: startLine + Math.max(selected.length - 1, 0),
      content,
      truncated,
    };
  } catch (error) {
    return {
      requestedPath,
      resolvedPath,
      cwd: process.cwd(),
      exists: false,
      truncated: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

async function walkSupportedTextFiles(
  resolvedPath: string,
  depth: number,
  state: {
    limit: number;
    includeHidden: boolean;
    maxDepth: number;
    ignoreDirectories: boolean;
    paths: Array<string>;
    truncated: boolean;
    errors: Array<string>;
  }
): Promise<void> {
  if (state.paths.length >= state.limit) {
    state.truncated = true;
    return;
  }

  let pathStat;
  try {
    pathStat = await stat(resolvedPath);
  } catch (error) {
    state.errors.push(error instanceof Error ? error.message : String(error));
    return;
  }

  if (pathStat.isFile()) {
    if (isSupportedTextFile(resolvedPath)) {
      state.paths.push(resolvedPath);
      if (state.paths.length >= state.limit) {
        state.truncated = true;
      }
    }
    return;
  }
  if (!pathStat.isDirectory()) {
    return;
  }
  if (depth >= state.maxDepth) {
    state.truncated = true;
    return;
  }

  let entries;
  try {
    entries = await readdir(resolvedPath, { withFileTypes: true });
  } catch (error) {
    state.errors.push(error instanceof Error ? error.message : String(error));
    return;
  }

  for (const entry of entries) {
    if (state.paths.length >= state.limit) {
      state.truncated = true;
      return;
    }
    if (!state.includeHidden && entry.name.startsWith(".")) {
      continue;
    }
    if (entry.isDirectory()) {
      if (state.ignoreDirectories && shouldIgnoreDirectoryName(entry.name)) {
        continue;
      }
      await walkSupportedTextFiles(path.join(resolvedPath, entry.name), depth + 1, state);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const nestedPath = path.join(resolvedPath, entry.name);
    if (isSupportedTextFile(nestedPath)) {
      state.paths.push(nestedPath);
      if (state.paths.length >= state.limit) {
        state.truncated = true;
        return;
      }
    }
  }
}

async function walkBrowseEntries(
  resolvedPath: string,
  depth: number,
  maxDepth: number,
  recursive: boolean,
  includeHidden: boolean,
  entries: Array<FileSystemBrowseEntry>,
  state: { remaining: number; truncated: boolean; errors: Array<string> }
): Promise<void> {
  if (state.remaining <= 0) {
    state.truncated = true;
    return;
  }

  let children;
  try {
    children = await readdir(resolvedPath, { withFileTypes: true });
  } catch (error) {
    state.errors.push(error instanceof Error ? error.message : String(error));
    return;
  }

  for (const child of children) {
    if (state.remaining <= 0) {
      state.truncated = true;
      return;
    }
    if (!includeHidden && child.name.startsWith(".")) {
      continue;
    }
    const childPath = path.join(resolvedPath, child.name);
    let childStat;
    try {
      childStat = await stat(childPath);
    } catch (error) {
      state.errors.push(error instanceof Error ? error.message : String(error));
      continue;
    }
    entries.push(toBrowseEntry(childPath, childStat));
    state.remaining -= 1;
    if (recursive && child.isDirectory() && depth + 1 < maxDepth && state.remaining > 0) {
      await walkBrowseEntries(childPath, depth + 1, maxDepth, recursive, includeHidden, entries, state);
    }
  }
}

function toBrowseEntry(filePath: string, fileStat: Awaited<ReturnType<typeof stat>>): FileSystemBrowseEntry {
  const type = fileStat.isDirectory() ? "directory" : "file";
  return {
    path: filePath,
    name: path.basename(filePath),
    type,
    sizeBytes: type === "file" ? normalizeStatSize(fileStat.size) : undefined,
    extension: type === "file" ? path.extname(filePath).toLowerCase() || undefined : undefined,
  };
}

function summarizeDirEntries(entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>) {
  const extensionCounts = new Map<string, number>();
  let directoryCount = 0;
  let fileCount = 0;

  for (const entry of entries) {
    if (entry.isDirectory()) {
      directoryCount += 1;
      continue;
    }
    if (entry.isFile()) {
      fileCount += 1;
      const ext = path.extname(entry.name).toLowerCase() || "<noext>";
      extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
    }
  }

  const topExtensions: Array<FileExtensionCount> = [...extensionCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([extension, count]) => ({ extension, count }));

  return {
    directoryCount,
    fileCount,
    topExtensions,
  };
}

function normalizeStatSize(size: number | bigint) {
  return typeof size === "bigint" ? Number(size) : size;
}

function isSupportedTextFile(filePath: string) {
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function shouldIgnoreDirectoryName(name: string) {
  return IGNORED_DIRECTORY_NAMES.has(name.toLowerCase());
}
