import { fuseRetrievalEntries } from "../packages/adapter-lmstudio/src/fusion";
import { generateQueryRewrites } from "../packages/adapter-lmstudio/src/queryRewrite";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runQueryRewriteSmokeTest() {
  const prompt =
    'what database is used by the session service and what tradeoff is mentioned in "Platform Architecture Review"?';
  const rewrites = generateQueryRewrites(prompt, 4);

  assert(rewrites.length >= 2, "Expected at least two query rewrites.");
  assert(
    rewrites[0]?.label === "original",
    "Expected the first rewrite to preserve the original query."
  );
  assert(
    rewrites.some((rewrite) => rewrite.label === "keywords"),
    "Expected a keyword-focused rewrite to be generated."
  );
  assert(
    rewrites.some((rewrite) => rewrite.text.toLowerCase().includes("session service")),
    "Expected at least one rewrite to preserve the core subject."
  );

  return {
    name: "query rewrite generation",
    details: rewrites.map((rewrite) => `[${rewrite.label}] ${rewrite.text}`).join("\n"),
  };
}

function runFusionSmokeTest() {
  const repeatedRelevantEntry = {
    score: 0.92,
    content:
      "The session service uses PostgreSQL for durable session state and accepts added write latency for transactional consistency.",
    source: { fileName: "large-architecture-doc.md" },
  };

  const retrievalRuns = [
    [
      repeatedRelevantEntry,
      {
        score: 0.61,
        content: "The analytics service uses ClickHouse for event aggregation.",
        source: { fileName: "large-architecture-doc.md" },
      },
    ],
    [
      {
        score: 0.88,
        content:
          "The session service uses PostgreSQL for durable session state and accepts added write latency for transactional consistency.",
        source: { fileName: "large-architecture-doc.md" },
      },
      {
        score: 0.57,
        content: "Production deploys happen on Thursdays after the change review meeting.",
        source: { fileName: "large-architecture-doc.md" },
      },
    ],
  ];

  const fusedEntries = fuseRetrievalEntries(
    retrievalRuns,
    "reciprocal-rank-fusion",
    3
  );

  assert(fusedEntries.length >= 2, "Expected fused results to include multiple candidates.");
  assert(
    fusedEntries[0]?.content.includes("session service uses PostgreSQL"),
    "Expected the repeated relevant entry to rank first after fusion."
  );
  assert(
    fusedEntries.filter((entry) =>
      entry.content.includes("session service uses PostgreSQL")
    ).length === 1,
    "Expected duplicate retrieval entries to be deduplicated during fusion."
  );

  return {
    name: "retrieval fusion",
    details: fusedEntries
      .map((entry, index) => `${index + 1}. score=${entry.score.toFixed(3)} :: ${entry.content}`)
      .join("\n"),
  };
}

function main() {
  const results = [runQueryRewriteSmokeTest(), runFusionSmokeTest()];

  console.log("Multi-query smoke test passed.\n");
  for (const result of results) {
    console.log(`## ${result.name}`);
    console.log(result.details);
    console.log("");
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Multi-query smoke test failed: ${message}`);
  process.exit(1);
}
