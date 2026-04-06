import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import type {
  RagCorpusAnalysis,
  RagLargeCorpusAnalysisStore,
} from "../../core/src/runtimeContracts";

const STORE_VERSION = "v1";
const STORE_ROOT = path.join(
  os.tmpdir(),
  "rag-v2-large-corpus-analysis",
  STORE_VERSION
);

export function createFilesystemLargeCorpusAnalysisStore(): RagLargeCorpusAnalysisStore {
  return {
    async get(key) {
      const filePath = buildStorePath(key);
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as {
          key?: string;
          analysis?: RagCorpusAnalysis;
        };
        if (parsed.key !== key || !parsed.analysis) {
          return undefined;
        }
        return parsed.analysis;
      } catch {
        return undefined;
      }
    },

    async set(key, analysis) {
      const filePath = buildStorePath(key);
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(
        filePath,
        JSON.stringify(
          {
            key,
            analysis,
          },
          null,
          2
        ),
        "utf8"
      );
    },
  };
}

function buildStorePath(key: string): string {
  const hashed = createHash("sha256").update(key).digest("hex");
  return path.join(STORE_ROOT, `${hashed}.json`);
}
