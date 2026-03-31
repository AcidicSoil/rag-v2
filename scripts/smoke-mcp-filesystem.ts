import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDefaultMcpRuntime } from "../packages/mcp-server/src/defaultRuntime";
import { createMcpToolHandlers } from "../packages/mcp-server/src/handlers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "rag-v2-mcp-"));

  try {
    await writeFile(
      path.join(tempRoot, "architecture.md"),
      "# Architecture\nThe session service uses PostgreSQL for durable state.\n\n## Analytics\nAnalytics uses ClickHouse for dashboards.\n",
      "utf8"
    );
    await mkdir(path.join(tempRoot, "docs"));
    await writeFile(
      path.join(tempRoot, "docs", "tradeoffs.txt"),
      "Tradeoff summary\nHigher write latency is accepted to preserve failover consistency.\n",
      "utf8"
    );

    const handlers = createMcpToolHandlers(createDefaultMcpRuntime());

    const inspect = await handlers.corpusInspect({
      paths: [tempRoot],
    });
    assert(inspect.fileCount === 2, "Expected filesystem corpus inspection to load two text files.");

    const search = await handlers.ragSearch({
      query: "failover consistency tradeoff",
      paths: [tempRoot],
    });
    assert(search.candidates.length > 0, "Expected filesystem rag_search to return candidates.");
    assert(
      search.candidates.some((candidate) => candidate.sourceName.includes("tradeoffs.txt")),
      "Expected filesystem rag_search to include the matching tradeoffs file."
    );

    const answer = await handlers.ragAnswer({
      query: "What database does the session service use?",
      paths: [tempRoot],
    });
    assert(answer.evidence.length > 0, "Expected filesystem rag_answer to produce evidence.");
    assert(
      answer.evidence.some((block) => block.fileName.includes("architecture.md")),
      "Expected filesystem rag_answer to cite the architecture file."
    );

    console.log("MCP filesystem smoke test passed.");
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MCP filesystem smoke test failed: ${message}`);
  process.exit(1);
});
