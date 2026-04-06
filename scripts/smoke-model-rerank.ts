import type { RetrievalResultEntry } from "@lmstudio/sdk";
import {
  applyModelRerankScores,
  buildModelRerankPrompt,
  parseModelRerankResponse,
} from "../packages/lmstudio-shared/src/modelRerank";
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
  const userQuery = "what tradeoff is mentioned for the session service database choice?";
  const entries: Array<RetrievalResultEntry> = [
    makeEntry(
      "# Session Service\nThe session service uses PostgreSQL for durable session state.",
      0.84,
      "file-a-1",
      "large-architecture-doc.md"
    ),
    makeEntry(
      "# Tradeoffs\nHigher write latency is accepted in exchange for consistency during failover.",
      0.76,
      "file-a-2",
      "large-architecture-doc.md"
    ),
    makeEntry(
      "# Analytics\nClickHouse powers aggregate dashboards.",
      0.82,
      "file-a-3",
      "large-architecture-doc.md"
    ),
  ];

  const heuristicRanked = rerankRetrievalEntries(userQuery, entries, {
    topK: 3,
    strategy: "heuristic-then-llm",
  });
  const prompt = buildModelRerankPrompt(userQuery, heuristicRanked);
  assert(
    prompt.includes("Candidate 1") && prompt.includes("Return JSON only"),
    "Expected model rerank prompt to include candidate blocks and JSON instructions."
  );

  const parsed = parseModelRerankResponse(
    "```json\n" +
      '{"scores":[{"index":1,"relevance":0.35,"rationale":"mentions system but not tradeoff"},{"index":2,"relevance":0.1,"rationale":"unrelated analytics detail"},{"index":3,"relevance":0.95,"rationale":"directly states the tradeoff"}]}' +
      "\n```"
  );
  assert(parsed.length === 3, "Expected three parsed model rerank scores.");

  const rescored = applyModelRerankScores(heuristicRanked, parsed, 3);
  assert(
    rescored[0]?.entry.content.includes("Higher write latency"),
    "Expected model-assisted reranking to elevate the direct tradeoff evidence."
  );

  console.log("Model rerank smoke test passed.\n");
  for (const [index, item] of rescored.entries()) {
    console.log(
      `${index + 1}. ${item.entry.source.name} :: ${item.rerankScore.toFixed(3)} :: ${item.entry.content}`
    );
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Model rerank smoke test failed: ${message}`);
  process.exit(1);
}
