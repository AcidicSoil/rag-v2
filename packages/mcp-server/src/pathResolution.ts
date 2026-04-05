import { readdir, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
  inputPath: string
): Promise<Array<string>> {
  const resolvedPath = resolveUserPath(inputPath);
  const pathStat = await stat(resolvedPath);
  if (pathStat.isFile()) {
    return isSupportedTextFile(resolvedPath) ? [resolvedPath] : [];
  }

  if (!pathStat.isDirectory()) {
    return [];
  }

  const entries = await readdir(resolvedPath, { withFileTypes: true });
  const results: Array<string> = [];
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }

    const nestedPath = path.join(resolvedPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await discoverSupportedTextFiles(nestedPath)));
      continue;
    }

    if (entry.isFile() && isSupportedTextFile(nestedPath)) {
      results.push(nestedPath);
    }
  }

  return results;
}

function isSupportedTextFile(filePath: string) {
  return TEXT_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}
