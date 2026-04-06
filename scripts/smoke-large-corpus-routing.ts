import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { clearLargeCorpusAnalysisCacheForTests } from "../packages/core/src/largeCorpus";
import { orchestrateRagRequest } from "../packages/core/src/orchestrator";
import { createDefaultMcpRuntime } from "../packages/mcp-server/src/defaultRuntime";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function main() {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "rag-v2-large-corpus-"));
  const runtime = createDefaultMcpRuntime();

  try {
    const exportDir = path.join(tempRoot, "official-export");
    await fs.mkdir(exportDir, { recursive: true });
    await fs.writeFile(
      path.join(exportDir, "chat.html"),
      "<html><body><h1>Chat export</h1><p>Conversation summary.</p></body></html>"
    );
    await fs.writeFile(
      path.join(exportDir, "image-1.png"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47])
    );
    await fs.writeFile(
      path.join(exportDir, "image-2.jpg"),
      Buffer.from([0xff, 0xd8, 0xff, 0xe0])
    );
    await fs.writeFile(
      path.join(exportDir, "image-3.webp"),
      Buffer.from("RIFFWEBP")
    );

    const globalResult = await orchestrateRagRequest(
      {
        query: "What themes dominate this export overall?",
        paths: [exportDir],
        outputMode: "prepared-prompt",
      },
      runtime
    );

    assert(
      globalResult.route === "global-summary",
      "Expected overview question on directory to use global-summary route."
    );
    assert(
      globalResult.preparedPrompt.includes("manifest:"),
      "Expected prepared prompt to include generated directory manifest context."
    );

    const attachedDocumentResult = await orchestrateRagRequest(
      {
        query: "What is in these attached files overall? Give me a high-level inventory.",
        documents: [
          {
            id: "attached-1",
            name: "dataset-export-1.jsonl",
            content: Array.from({ length: 9000 }, (_, index) =>
              JSON.stringify({
                conversation_id: `conv-${index + 1}`,
                user_id: index % 3 === 0 ? "user-a" : "user-b",
                timestamp: `2025-02-${String((index % 5) + 1).padStart(2, "0")}T12:00:00Z`,
                topic: index % 2 === 0 ? "billing" : "support",
                content: "Attached export record with repeated structured chat content.",
              })
            ).join("\n"),
            metadata: {
              path: "dataset-export-1.jsonl",
            },
          },
        ],
        outputMode: "prepared-prompt",
      },
      runtime
    );

    assert(
      attachedDocumentResult.route === "global-summary",
      "Expected overview question on attached documents to use global-summary route."
    );
    assert(
      attachedDocumentResult.preparedPrompt.includes("synopsis:dataset-export-1.jsonl"),
      "Expected prepared prompt to include generated file synopsis context for attached documents."
    );
    assert(
      attachedDocumentResult.preparedPrompt.includes("Observed fields:"),
      "Expected attached-document synopsis context to expose observed JSONL fields."
    );
    assert(
      attachedDocumentResult.preparedPrompt.includes("structured-topic-summary:dataset-export-1.jsonl") &&
        attachedDocumentResult.preparedPrompt.includes("billing") &&
        attachedDocumentResult.preparedPrompt.includes("support"),
      "Expected attached-document summary context to include sampled topic summaries for structured JSONL corpora."
    );
    assert(
      attachedDocumentResult.preparedPrompt.includes("structured-time-summary:dataset-export-1.jsonl") &&
        attachedDocumentResult.preparedPrompt.includes("2025-02-"),
      "Expected attached-document summary context to include sampled time summaries for structured JSONL corpora."
    );
    assert(
      attachedDocumentResult.preparedPrompt.includes("structured-entity-summary:dataset-export-1.jsonl") &&
        attachedDocumentResult.preparedPrompt.includes("user-a"),
      "Expected attached-document summary context to include sampled entity summaries for structured JSONL corpora."
    );
    assert(
      attachedDocumentResult.diagnostics.notes?.some((note) => note.includes("document analysis classified")),
      "Expected diagnostics to record document-backed large-corpus analysis."
    );

    const attachedTopicSearchResult = await orchestrateRagRequest(
      {
        query: "What topics dominate across this attached dataset?",
        documents: [
          {
            id: "attached-1",
            name: "dataset-export-1.jsonl",
            content: Array.from({ length: 9000 }, (_, index) =>
              JSON.stringify({
                conversation_id: `conv-${index + 1}`,
                user_id: index % 3 === 0 ? "user-a" : "user-b",
                timestamp: `2025-02-${String((index % 5) + 1).padStart(2, "0")}T12:00:00Z`,
                topic: index % 2 === 0 ? "billing" : "support",
                content: "Attached export record with repeated structured chat content.",
              })
            ).join("\n"),
            metadata: {
              path: "dataset-export-1.jsonl",
            },
          },
        ],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      attachedTopicSearchResult.route === "global-summary",
      "Expected overview topic question on attached documents to use global-summary route."
    );
    assert(
      attachedTopicSearchResult.candidates.some((candidate) =>
        candidate.sourceName.includes("structured-topic-summary:")
      ),
      "Expected global-summary search-results to return ranked structured topic summary candidates."
    );
    assert(
      attachedTopicSearchResult.evidence.length > 0,
      "Expected global-summary search-results to emit evidence blocks from selected summary documents."
    );

    const attachedTimeSearchResult = await orchestrateRagRequest(
      {
        query: "What topics dominate in February across this attached dataset?",
        documents: [
          {
            id: "attached-1",
            name: "dataset-export-1.jsonl",
            content: Array.from({ length: 9000 }, (_, index) =>
              JSON.stringify({
                conversation_id: `conv-${index + 1}`,
                user_id: index % 3 === 0 ? "user-a" : "user-b",
                timestamp: `2025-02-${String((index % 5) + 1).padStart(2, "0")}T12:00:00Z`,
                topic: index % 2 === 0 ? "billing" : "support",
                content: "Attached export record with repeated structured chat content.",
              })
            ).join("\n"),
            metadata: {
              path: "dataset-export-1.jsonl",
            },
          },
        ],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      attachedTimeSearchResult.candidates.some((candidate) =>
        candidate.sourceName.includes("structured-time-summary:") &&
        candidate.content.includes("2025-02")
      ),
      "Expected month-name overview queries to surface matching structured time summaries."
    );

    const jsonlPath = path.join(tempRoot, "dataclaw_export.jsonl");
    const repeatedLine = JSON.stringify({
      conversation_id: "conv-1",
      role: "user",
      content: "Session tool usage and metadata sample.",
    });
    const targetLine = JSON.stringify({
      conversation_id: "conv-999",
      session_id: "session-999",
      timestamp: "2025-02-03T10:15:00Z",
      topic: "routing",
      role: "assistant",
      content:
        "Target tool usage entry with export routing evidence and hierarchy marker.",
    });
    const largeJsonl = [
      ...Array.from({ length: 8500 }, () => repeatedLine),
      targetLine,
      ...Array.from({ length: 499 }, () => repeatedLine),
    ].join("\n");
    await fs.writeFile(jsonlPath, `${largeJsonl}\n`, "utf8");

    const localResult = await orchestrateRagRequest(
      {
        query:
          "Find the specific export routing evidence and hierarchy marker entry in this file.",
        paths: [jsonlPath],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      localResult.route === "hierarchical-retrieval",
      "Expected oversized text file with local lookup query to use hierarchical-retrieval route."
    );
    assert(
      localResult.diagnostics.notes?.some((note) => note.includes("scope=local")),
      "Expected diagnostics to record large-corpus local classification."
    );
    assert(
      localResult.diagnostics.notes?.some((note) => note.includes("Built hierarchical index")),
      "Expected diagnostics to report hierarchical index construction."
    );
    assert(
      localResult.candidates.length > 0,
      "Expected hierarchical retrieval to produce candidates."
    );
    assert(
      localResult.candidates.some(
        (candidate) =>
          candidate.content.includes("hierarchy marker") &&
          candidate.metadata?.retrievalMode === "hierarchical-retrieval"
      ),
      "Expected hierarchical retrieval to surface the target chunk with hierarchical metadata."
    );
    assert(
      localResult.candidates.some(
        (candidate) =>
          Array.isArray(candidate.metadata?.structuredFields) &&
          String(candidate.metadata?.structuredSummary ?? "").includes("conversation_id=") &&
          typeof candidate.metadata?.structuredRecord === "object"
      ),
      "Expected JSONL retrieval chunks to carry structured field metadata."
    );

    const structuredExactResult = await orchestrateRagRequest(
      {
        query:
          "Find conversation conv-999 timestamp 2025-02-03 topic routing entry with hierarchy marker.",
        paths: [jsonlPath],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      structuredExactResult.candidates.length > 0,
      "Expected structured exact retrieval query to produce candidates."
    );
    assert(
      structuredExactResult.candidates[0]?.metadata?.retrievalMode === "structured-query-first",
      "Expected exact structured query to use structured-query-first retrieval."
    );
    assert(
      Array.isArray(structuredExactResult.candidates[0]?.metadata?.structuredQueryMatches) &&
        structuredExactResult.candidates[0]!.metadata!.structuredQueryMatches.length >= 1,
      "Expected exact structured query to annotate matched structured fields."
    );
    assert(
      structuredExactResult.candidates[0]?.content.includes("conv-999") &&
        structuredExactResult.candidates[0]?.content.includes("2025-02-03T10:15:00Z"),
      "Expected exact structured query to surface the targeted JSONL record."
    );

    const explicitStructuredResult = await orchestrateRagRequest(
      {
        query:
          'Find conversation_id:"conv-999" topic:"routing" timestamp:"2025-02-03" hierarchy marker.',
        paths: [jsonlPath],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      explicitStructuredResult.candidates[0]?.metadata?.retrievalMode === "structured-query-first",
      "Expected explicit field:value query to use structured-query-first retrieval."
    );
    assert(
      Array.isArray(explicitStructuredResult.candidates[0]?.metadata?.structuredQueryMatches) &&
        explicitStructuredResult.candidates[0]!.metadata!.structuredQueryMatches.includes("conversation_id=conv-999") &&
        explicitStructuredResult.candidates[0]!.metadata!.structuredQueryMatches.includes("timestamp=2025-02-03") &&
        explicitStructuredResult.candidates[0]!.metadata!.structuredQueryMatches.includes("topic=routing"),
      "Expected explicit field:value query to preserve multiple structured matches through fusion and dedupe."
    );

    const cachedLocalResult = await orchestrateRagRequest(
      {
        query:
          "Find the specific export routing evidence and hierarchy marker entry in this file.",
        paths: [jsonlPath],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      cachedLocalResult.diagnostics.notes?.some((note) =>
        note.includes("Reused cached large-corpus analysis")
      ),
      "Expected repeated large-corpus request to reuse cached analysis."
    );

    clearLargeCorpusAnalysisCacheForTests();
    const persistedRuntime = createDefaultMcpRuntime();
    const persistedLocalResult = await orchestrateRagRequest(
      {
        query:
          "Find the specific export routing evidence and hierarchy marker entry in this file.",
        paths: [jsonlPath],
        outputMode: "search-results",
      },
      persistedRuntime
    );

    assert(
      persistedLocalResult.diagnostics.notes?.some((note) =>
        note.includes("Reused persisted large-corpus analysis")
      ),
      "Expected fresh-runtime large-corpus request to reuse persisted analysis."
    );
    assert(
      persistedLocalResult.diagnostics.notes?.some((note) =>
        note.includes("Reused persisted hierarchical index") ||
        note.includes("Rebuilt hierarchical index")
      ),
      "Expected persisted-analysis reuse to report hierarchical index reuse or rebuild."
    );
    assert(
      persistedLocalResult.candidates.some(
        (candidate) =>
          candidate.content.includes("hierarchy marker") &&
          candidate.metadata?.retrievalMode === "hierarchical-retrieval"
      ),
      "Expected persisted-analysis reuse to rebuild hierarchical retrieval context and surface the target chunk."
    );

    const correctiveResult = await orchestrateRagRequest(
      {
        query:
          "Find the hierarchy marker entry and the nonexistent sentinel field in this file.",
        paths: [jsonlPath],
        outputMode: "search-results",
      },
      runtime
    );

    assert(
      correctiveResult.diagnostics.notes?.some((note) =>
        note.includes("Weak hierarchical evidence triggered a corrective retry")
      ),
      "Expected weak hierarchical evidence to trigger a corrective retry."
    );

    console.log("Large-corpus routing smoke test passed.");
    console.log(`Global route: ${globalResult.route}`);
    console.log(`Local route: ${localResult.route}`);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Large-corpus routing smoke test failed: ${message}`);
  process.exit(1);
});
