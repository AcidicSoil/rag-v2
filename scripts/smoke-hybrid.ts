import type { FileHandle, RetrievalResultEntry } from "@lmstudio/sdk";
import { mergeHybridCandidates } from "../src/hybridRetrieve";
import { lexicalRetrieve } from "../src/lexicalRetrieve";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeFile(name: string): FileHandle {
  return {
    identifier: name,
    name,
  } as any;
}

function makeEntry(
  content: string,
  score: number,
  file: FileHandle
): RetrievalResultEntry {
  return {
    content,
    score,
    source: file,
  };
}

function main() {
  const architectureFile = makeFile("large-architecture-doc.md");
  const docs = [
    {
      file: architectureFile,
      content: `# Platform Architecture Review
Session Service
The session service uses PostgreSQL for durable session state.

Tradeoffs
Higher write latency is accepted in exchange for consistency during failover.

Analytics
ClickHouse powers aggregate dashboards.`,
    },
  ];

  const lexical = lexicalRetrieve(
    'what tradeoff is described in "Platform Architecture Review" for the session service database choice?',
    docs,
    4
  );
  assert(lexical.length > 0, "Expected lexical retrieval to return at least one candidate.");
  assert(
    lexical[0]?.content.includes("Platform Architecture Review") ||
      lexical[0]?.content.includes("Higher write latency"),
    "Expected lexical retrieval to surface the relevant reviewed chunk."
  );

  const semantic = [
    makeEntry(
      "Analytics uses ClickHouse for aggregate dashboards.",
      0.88,
      architectureFile
    ),
    makeEntry(
      "The session service uses PostgreSQL for durable session state.",
      0.79,
      architectureFile
    ),
  ];

  const hybrid = mergeHybridCandidates(semantic, lexical, {
    semanticWeight: 0.65,
    lexicalWeight: 0.35,
    maxCandidates: 4,
  });

  assert(hybrid.length >= 2, "Expected hybrid merge to retain multiple candidates.");
  assert(
    hybrid.some((entry) => entry.content.includes("Higher write latency")),
    "Expected hybrid candidates to include lexical-only tradeoff evidence."
  );

  console.log("Hybrid smoke test passed.\n");
  for (const [index, entry] of hybrid.entries()) {
    console.log(`${index + 1}. ${entry.source.name} :: ${entry.score.toFixed(3)} :: ${entry.content}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Hybrid smoke test failed: ${message}`);
  process.exit(1);
}
