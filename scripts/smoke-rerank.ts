import type { RetrievalResultEntry } from "@lmstudio/sdk";
import { rerankRetrievalEntries } from "../packages/adapter-lmstudio/src/rerank";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeEntry(
  content: string,
  score: number,
  sourceIdentifier: string,
  sourceName: string
): RetrievalResultEntry {
  return {
    content,
    score,
    source: {
      identifier: sourceIdentifier,
      name: sourceName,
    } as any,
  };
}

function main() {
  const userQuery = "what database is used by the session service and what tradeoff is mentioned?";
  const entries: Array<RetrievalResultEntry> = [
    makeEntry(
      "# Session Service\nThe session service uses PostgreSQL for durable session state. The tradeoff is higher write latency in exchange for consistency during failover.",
      0.79,
      "file-a-1",
      "large-architecture-doc.md"
    ),
    makeEntry(
      "# Session Service\nThe session service uses PostgreSQL for durable session state.",
      0.81,
      "file-a-2",
      "large-architecture-doc.md"
    ),
    makeEntry(
      "# Analytics\nThe analytics pipeline writes events into ClickHouse for aggregate dashboards.",
      0.84,
      "file-a-3",
      "large-architecture-doc.md"
    ),
  ];

  const ranked = rerankRetrievalEntries(userQuery, entries, {
    topK: 3,
    strategy: "heuristic-v1",
  });

  assert(ranked.length === 3, "Expected reranker to preserve the requested candidate count.");
  assert(
    ranked[0]?.entry.content.includes("higher write latency") &&
      ranked[0]?.entry.content.includes("PostgreSQL"),
    "Expected the most complete query-matching session-service evidence to rank first."
  );
  assert(
    ranked[1]?.features.diversityPenalty >= 0,
    "Expected reranker to annotate diversity penalty information."
  );
  assert(
    ranked[2]?.entry.content.includes("ClickHouse"),
    "Expected the lexically weaker analytics evidence to rank behind the session-service evidence."
  );

  console.log("Rerank smoke test passed.\n");
  for (const [index, item] of ranked.entries()) {
    console.log(
      `${index + 1}. ${item.entry.source.name} :: ${item.rerankScore.toFixed(3)} ` +
        `(semantic=${item.originalScore.toFixed(3)}, overlap=${item.features.lexicalOverlap.toFixed(2)}, diversityPenalty=${item.features.diversityPenalty.toFixed(2)})`
    );
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Rerank smoke test failed: ${message}`);
  process.exit(1);
}
