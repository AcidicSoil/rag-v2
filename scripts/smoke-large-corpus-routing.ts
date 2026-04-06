import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { orchestrateRagRequest } from "../packages/core/src/orchestrator";
import { createDefaultMcpRuntime } from "../packages/mcp-server/src/defaultRuntime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rag-v2-large-corpus-"));
  const runtime = createDefaultMcpRuntime();

  try {
    const exportDir = path.join(tempRoot, "official-export");
    await fs.mkdir(exportDir, { recursive: true });
    await fs.writeFile(path.join(exportDir, "chat.html"), "<html><body><h1>Chat export</h1><p>Conversation summary.</p></body></html>");
    await fs.writeFile(path.join(exportDir, "image-1.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await fs.writeFile(path.join(exportDir, "image-2.jpg"), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
    await fs.writeFile(path.join(exportDir, "image-3.webp"), Buffer.from("RIFFWEBP"));

    const globalResult = await orchestrateRagRequest(
      {
        query: "What themes dominate this export overall?",
        paths: [exportDir],
        outputMode: "prepared-prompt",
      },
      runtime
    );

    assert(globalResult.route === "global-summary", "Expected overview question on directory to use global-summary route.");
    assert(
      globalResult.preparedPrompt.includes("manifest:"),
      "Expected prepared prompt to include generated directory manifest context."
    );

    const jsonlPath = path.join(tempRoot, "dataclaw_export.jsonl");
    const repeatedLine = JSON.stringify({
      conversation_id: "conv-1",
      role: "user",
      content: "Session tool usage and metadata sample.",
    });
    const targetLine = JSON.stringify({
      conversation_id: "conv-999",
      role: "assistant",
      content: "Target tool usage entry with export routing evidence and hierarchy marker.",
    });
    const largeJsonl = [
      ...Array.from({ length: 8500 }, () => repeatedLine),
      targetLine,
      ...Array.from({ length: 499 }, () => repeatedLine),
    ].join("\n");
    await fs.writeFile(jsonlPath, `${largeJsonl}\n`, "utf8");

    const localResult = await orchestrateRagRequest(
      {
        query: "Find the specific export routing evidence and hierarchy marker entry in this file.",
        paths: [jsonlPath],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      localResult.route === "hierarchical-retrieval",
      "Expected oversized text file with local lookup query to use hierarchical-retrieval route."
    );
    assert(
      localResult.diagnostics.notes?.some((note) => note.includes("scope=local")),
      "Expected diagnostics to record large-corpus local classification."
    );
    assert(
      localResult.diagnostics.notes?.some((note) => note.includes("Built hierarchical index")),
      "Expected diagnostics to report hierarchical index construction."
    );
    assert(localResult.candidates.length > 0, "Expected hierarchical retrieval to produce candidates.");
    assert(
      localResult.candidates.some((candidate) =>
        candidate.content.includes("hierarchy marker") &&
        candidate.metadata?.retrievalMode === "hierarchical-retrieval"
      ),
      "Expected hierarchical retrieval to surface the target chunk with hierarchical metadata."
    );

    const cachedLocalResult = await orchestrateRagRequest(
      {
        query: "Find the specific export routing evidence and hierarchy marker entry in this file.",
        paths: [jsonlPath],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      cachedLocalResult.diagnostics.notes?.some((note) => note.includes("Reused cached large-corpus analysis")),
      "Expected repeated large-corpus request to reuse cached analysis."
    );

    console.log("Large-corpus routing smoke test passed.");
    console.log(`Global route: ${globalResult.route}`);
    console.log(`Local route: ${localResult.route}`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Large-corpus routing smoke test failed: ${message}`);
  process.exit(1);
});
