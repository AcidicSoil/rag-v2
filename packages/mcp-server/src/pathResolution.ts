import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type {
  FileSystemBrowseEntry,
  FileSystemBrowseRequest,
  FileSystemBrowseResponse,
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

    const entries: Array<FileSystemBrowseEntry> = [];
    const state = {
      remaining: maxEntries,
      truncated: false,
      errors: [] as Array<string>,
    };
    await walkBrowseEntries(resolvedPath, 0, maxDepth, recursive, includeHidden, entries, state);

    return {
      requestedPath,
      resolvedPath,
      cwd: process.cwd(),
      exists: true,
      type: "directory",
      entries,
      truncated: state.truncated,
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

    if (
      recursive &&
      child.isDirectory() &&
      depth + 1 < maxDepth &&
      state.remaining > 0
    ) {
      await walkBrowseEntries(
        childPath,
        depth + 1,
        maxDepth,
        recursive,
        includeHidden,
        entries,
        state
      );
    }
  }
}

function toBrowseEntry(
  filePath: string,
  fileStat: Awaited<ReturnType<typeof stat>>
): FileSystemBrowseEntry {
  const type = fileStat.isDirectory() ? "directory" : "file";
  return {
    path: filePath,
    name: path.basename(filePath),
    type,
    sizeBytes:
      type === "file"
        ? typeof fileStat.size === "bigint"
          ? Number(fileStat.size)
          : fileStat.size
        : undefined,
    extension:
      type === "file" ? path.extname(filePath).toLowerCase() || undefined : undefined,
  };
}

function isSupportedTextFile(filePath: string) {
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function shouldIgnoreDirectoryName(name: string) {
  return IGNORED_DIRECTORY_NAMES.has(name.toLowerCase());
}
