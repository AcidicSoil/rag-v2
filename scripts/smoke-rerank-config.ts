import { orchestrateRagRequest } from "../packages/core/src/orchestrator";
import { createDefaultMcpRuntime } from "../packages/mcp-server/src/defaultRuntime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const runtime = createDefaultMcpRuntime();
  const chunks = [
    {
      sourceId: "c1",
      sourceName: "architecture.md",
      content: "ClickHouse powers aggregate dashboards.",
      score: 0.95,
    },
    {
      sourceId: "c2",
      sourceName: "architecture.md",
      content:
        "The session service uses PostgreSQL and accepts higher write latency in exchange for consistency during failover.",
      score: 0.82,
    },
    {
      sourceId: "c3",
      sourceName: "architecture.md",
      content: "The session service uses PostgreSQL for durable state.",
      score: 0.8,
    },
  ];

  const disabled = await orchestrateRagRequest(
    {
      query: "What database is used by the session service and what tradeoff is mentioned?",
      chunks,
      outputMode: "search-results",
      options: {
        rerank: {
          enabled: false,
          strategy: "heuristic-v1",
          topK: 3,
        },
      },
    },
    runtime
  );

  assert(
    disabled.candidates[0]?.content.includes("ClickHouse"),
    "Expected rerank-disabled flow to preserve incoming candidate order."
  );
  assert(
    disabled.diagnostics.notes?.some((note) => note.includes("Rerank disabled")),
    "Expected diagnostics to record rerank-disabled behavior."
  );

  const enabled = await orchestrateRagRequest(
    {
      query: "What database is used by the session service and what tradeoff is mentioned?",
      chunks,
      outputMode: "search-results",
      options: {
        rerank: {
          enabled: true,
          strategy: "heuristic-v1",
          topK: 3,
        },
      },
    },
    runtime
  );

  assert(
    enabled.candidates[0]?.content.includes("higher write latency"),
    "Expected rerank-enabled flow to move the most complete answer-supporting candidate to the top."
  );

  console.log("Rerank config smoke test passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Rerank config smoke test failed: ${message}`);
  process.exit(1);
});
