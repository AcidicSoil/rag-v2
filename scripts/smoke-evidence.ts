import { buildEvidenceBlocks, dedupeEvidenceEntries, formatEvidenceBlocks } from "../src/evidence";
import type { RetrievalResultEntry } from "@lmstudio/sdk";

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
  const entries: Array<RetrievalResultEntry> = [
    makeEntry(
      "The session service uses PostgreSQL for durable session state.",
      0.91,
      "file-a",
      "large-architecture-doc.md"
    ),
    makeEntry(
      "The session service uses PostgreSQL for durable session state and prioritizes consistency.",
      0.88,
      "file-a",
      "large-architecture-doc.md"
    ),
    makeEntry(
      "The analytics service uses ClickHouse for event aggregation.",
      0.63,
      "file-a",
      "large-architecture-doc.md"
    ),
  ];

  const dedupedEntries = dedupeEvidenceEntries(entries, 0.5, 4);
  assert(dedupedEntries.length === 2, "Expected near-duplicate evidence to be removed.");
  assert(
    dedupedEntries[0]?.content.includes("PostgreSQL"),
    "Expected the strongest PostgreSQL entry to remain."
  );

  const evidenceBlocks = buildEvidenceBlocks(dedupedEntries);
  const formatted = formatEvidenceBlocks(evidenceBlocks);

  assert(
    formatted.includes("Citation 1") && formatted.includes("file: large-architecture-doc.md"),
    "Expected formatted evidence to include citation labels and file names."
  );
  assert(
    formatted.includes("score:"),
    "Expected formatted evidence to include evidence scores."
  );

  console.log("Evidence smoke test passed.\n");
  console.log(formatted);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Evidence smoke test failed: ${message}`);
  process.exit(1);
}
