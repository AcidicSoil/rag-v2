import {
  buildRagEvidenceBlocks,
  dedupeRagCandidates,
  fuseRagCandidates,
  mergeHybridRagCandidates,
  rerankRagCandidates,
} from "../src/core/retrievalPipeline";
import {
  toEvidenceBlocks,
  toRetrievalResultEntries,
} from "../src/lmstudioCoreBridge";
import type { RagCandidate } from "../src/core/contracts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function makeCandidate(
  sourceId: string,
  sourceName: string,
  content: string,
  score: number
): RagCandidate {
  return {
    sourceId,
    sourceName,
    content,
    score,
    metadata: {
      source: {
        identifier: sourceId,
        name: sourceName,
      },
    },
  };
}

function main() {
  const semanticRuns = [
    [
      makeCandidate(
        "architecture.md",
        "architecture.md",
        "# Session Service\nThe session service uses PostgreSQL and accepts higher write latency to preserve failover consistency.",
        0.82
      ),
      makeCandidate(
        "architecture.md",
        "architecture.md",
        "Analytics uses ClickHouse for aggregate dashboards.",
        0.61
      ),
    ],
    [
      makeCandidate(
        "architecture.md",
        "architecture.md",
        "The analytics backend uses ClickHouse for aggregate dashboards.",
        0.77
      ),
      makeCandidate(
        "architecture.md",
        "architecture.md",
        "Session service tradeoff: higher write latency in exchange for failover consistency.",
        0.75
      ),
    ],
  ];

  const fused = fuseRagCandidates(
    semanticRuns,
    "reciprocal-rank-fusion",
    4
  );
  assert(fused.length >= 3, "Expected fused candidates from multiple retrieval runs.");

  const lexical = [
    makeCandidate(
      "architecture.md",
      "architecture.md",
      "Tradeoff summary: PostgreSQL gives durable state while accepting higher write latency during failover.",
      0.93
    ),
  ];

  const hybrid = mergeHybridRagCandidates(fused, lexical, {
    semanticWeight: 0.65,
    lexicalWeight: 0.35,
    maxCandidates: 4,
  });
  assert(hybrid.length >= 3, "Expected hybrid merge to retain multiple candidates.");

  const reranked = rerankRagCandidates(
    "Compare the session service tradeoff and analytics backend.",
    hybrid,
    {
      topK: 3,
      strategy: "heuristic-v1",
    }
  );
  assert(reranked.length === 3, "Expected heuristic rerank to return top-k candidates.");
  assert(
    reranked[0]!.features.lexicalOverlap > 0,
    "Expected reranked candidates to include computed lexical-overlap features."
  );

  const deduped = dedupeRagCandidates(
    reranked.map((candidate) => ({
      ...candidate.candidate,
      score: candidate.rerankScore,
    })),
    0.8,
    3
  );
  assert(deduped.length >= 2, "Expected dedupe to retain at least two distinct evidence candidates.");

  const evidenceBlocks = buildRagEvidenceBlocks(deduped);
  const lmStudioEvidenceBlocks = toEvidenceBlocks(evidenceBlocks);
  const roundTrippedEntries = toRetrievalResultEntries(
    deduped.map((candidate) => ({
      ...candidate,
      metadata: {
        source: {
          identifier: candidate.sourceId,
          name: candidate.sourceName,
        },
      },
    }))
  );

  assert(
    lmStudioEvidenceBlocks[0]?.fileName === "architecture.md",
    "Expected bridge conversion to preserve source file names."
  );
  assert(
    roundTrippedEntries[0]?.source.identifier === "architecture.md",
    "Expected bridge conversion to round-trip source identifiers."
  );

  console.log("Core pipeline smoke test passed.\n");
  console.log(`Fused: ${fused.length}`);
  console.log(`Hybrid: ${hybrid.length}`);
  console.log(`Reranked: ${reranked.length}`);
  console.log(`Deduped: ${deduped.length}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Core pipeline smoke test failed: ${message}`);
  process.exit(1);
}
