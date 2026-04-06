import { createDefaultMcpRuntime } from "../packages/mcp-server/src/defaultRuntime";
import { createMcpToolHandlers } from "../packages/mcp-server/src/handlers";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const handlers = createMcpToolHandlers(createDefaultMcpRuntime());

  const inspect = await handlers.corpusInspect({
    documents: [
      {
        id: "architecture.md",
        name: "architecture.md",
        content:
          "The session service uses PostgreSQL for durable state. Analytics uses ClickHouse for dashboards.",
      },
    ],
  });
  assert(inspect.fileCount === 1, "Expected corpus inspector to report one file.");

  const search = await handlers.ragSearch({
    query: "session service durable state",
    documents: [
      {
        id: "architecture.md",
        name: "architecture.md",
        content:
          "The session service uses PostgreSQL for durable state. Analytics uses ClickHouse for dashboards.",
      },
    ],
  });
  assert(search.candidates.length > 0, "Expected rag_search to return at least one candidate.");

  const answer = await handlers.ragAnswer({
    query: "What database does the session service use?",
    documents: [
      {
        id: "architecture.md",
        name: "architecture.md",
        content:
          "The session service uses PostgreSQL for durable state. Analytics uses ClickHouse for dashboards.",
      },
    ],
  });
  assert(answer.answer.includes("Stub"), "Expected rag_answer to use the current stub answer composer.");
  assert(answer.evidence.length > 0, "Expected rag_answer to emit evidence blocks.");

  const prepared = await handlers.ragPreparePrompt({
    query: "What database does the session service use?",
    documents: [
      {
        id: "architecture.md",
        name: "architecture.md",
        content:
          "The session service uses PostgreSQL for durable state. Analytics uses ClickHouse for dashboards.",
      },
    ],
    options: {
      rerank: {
        enabled: true,
        strategy: "heuristic-then-llm",
        modelSource: "manual-model-id",
        modelId: "test-rerank-model",
      },
    },
  });
  assert(
    prepared.preparedPrompt.length > 0,
    "Expected rag_prepare_prompt to accept rerank model source options."
  );

  const rerank = await handlers.rerankOnly({
    query: "session service",
    candidates: [
      {
        sourceId: "architecture.md",
        sourceName: "architecture.md",
        content: "The session service uses PostgreSQL for durable state.",
        score: 0.6,
      },
      {
        sourceId: "analytics.md",
        sourceName: "analytics.md",
        content: "Analytics uses ClickHouse for dashboards.",
        score: 0.7,
      },
    ],
  });
  assert(rerank.candidates.length > 0, "Expected rerank_only to return candidates.");
  assert(
    (rerank.reasons?.length ?? 0) > 0,
    "Expected rerank_only to return explanatory ranking reasons."
  );

  console.log("MCP handler smoke test passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`MCP handler smoke test failed: ${message}`);
  process.exit(1);
});
