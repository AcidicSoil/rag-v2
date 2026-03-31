import type { FileHandle, RetrievalResultEntry } from "@lmstudio/sdk";
import {
  assessCorrectiveNeed,
  buildCorrectiveQueryPlan,
} from "../packages/adapter-lmstudio/src/corrective";

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
  const architectureFile = makeFile("architecture.md");
  const prompt = "Compare the session service storage tradeoffs and the analytics backend.";

  const weakAssessment = assessCorrectiveNeed(
    prompt,
    [
      makeEntry(
        "The analytics backend uses ClickHouse for aggregate dashboards.",
        0.42,
        architectureFile
      ),
    ],
    {
      minAverageScore: 0.6,
      minAspectCoverage: 0.75,
      minEntryCount: 2,
    }
  );

  assert(weakAssessment.shouldRetry, "Expected weak evidence to trigger corrective retrieval.");
  assert(
    weakAssessment.reasons.some((reason) => reason.includes("Average evidence score")),
    "Expected weak evidence assessment to report score-based corrective reasoning."
  );
  assert(
    weakAssessment.reasons.some((reason) => reason.includes("covered")),
    "Expected weak evidence assessment to report incomplete aspect coverage."
  );

  const correctivePlan = buildCorrectiveQueryPlan(prompt, 5);
  assert(correctivePlan.rewrites.length >= 3, "Expected corrective plan to generate multiple rewrites.");
  assert(
    correctivePlan.rewrites.some((rewrite) =>
      rewrite.text.toLowerCase().includes("session service storage tradeoffs")
    ),
    "Expected corrective plan to include an aspect-focused rewrite for the first sub-question."
  );
  assert(
    correctivePlan.rewrites.some((rewrite) =>
      rewrite.text.toLowerCase().includes("analytics backend")
    ),
    "Expected corrective plan to include an aspect-focused rewrite for the second sub-question."
  );

  const strongAssessment = assessCorrectiveNeed(
    prompt,
    [
      makeEntry(
        "The session service uses PostgreSQL and accepts higher write latency to preserve failover consistency.",
        0.82,
        architectureFile
      ),
      makeEntry(
        "The analytics backend uses ClickHouse for aggregate dashboards.",
        0.8,
        architectureFile
      ),
    ],
    {
      minAverageScore: 0.6,
      minAspectCoverage: 0.75,
      minEntryCount: 2,
    }
  );

  assert(
    !strongAssessment.shouldRetry,
    "Expected well-covered multi-aspect evidence to avoid corrective retrieval."
  );

  console.log("Corrective retrieval smoke test passed.\n");
  console.log(
    `Weak assessment: retry=${weakAssessment.shouldRetry}, coverage=${weakAssessment.matchedAspectCount}/${weakAssessment.totalAspectCount}, score=${weakAssessment.averageScore.toFixed(2)}`
  );
  console.log(
    `Strong assessment: retry=${strongAssessment.shouldRetry}, coverage=${strongAssessment.matchedAspectCount}/${strongAssessment.totalAspectCount}, score=${strongAssessment.averageScore.toFixed(2)}`
  );
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Corrective retrieval smoke test failed: ${message}`);
  process.exit(1);
}
