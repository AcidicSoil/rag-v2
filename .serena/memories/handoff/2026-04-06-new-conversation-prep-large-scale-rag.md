New-conversation prep handoff summary:

What was completed in the just-finished conversation:
1. Wrote a large-scale RAG ingestion research/architecture plan:
   - `.plans/LARGE_SCALE_RAG_INGESTION_RESEARCH_PLAN.md`
   Main recommendation: progressive persistent indexing, not larger prompt context.

2. Implemented persistent lightweight large-corpus analysis:
   - runtime contract: `RagLargeCorpusAnalysisStore`
   - persisted manifests / file synopses / route recommendations / notes
   - MCP filesystem-backed implementation:
     - `packages/mcp-server/src/largeCorpusAnalysisStore.ts`
   - wired into default + LM Studio MCP runtimes

3. Implemented persistent hierarchical parent/child retrieval indexing:
   - runtime contract: `RagHierarchicalIndexStore`
   - persisted hierarchical index reuse/rebuild plumbing in core large-corpus flow
   - MCP filesystem-backed implementation:
     - `packages/mcp-server/src/hierarchicalIndexStore.ts`
   - wired into default + LM Studio MCP runtimes

4. Implemented structured JSONL/chat ingestion first slice:
   - plan: `.plans/STRUCTURED_JSONL_CHAT_INGESTION_TASK_LIST.md`
   - path/plugin loaders now annotate docs with `path` + `extension`
   - core local retrieval now uses record-aware chunking for `.jsonl`
   - JSONL chunk metadata includes:
     - `structuredFormat: "jsonl"`
     - `recordIndex`
     - `structuredFields`
     - `structuredSummary`
   - large-corpus JSONL synopses now include `Observed fields: ...`

Important files changed in this phase:
- `packages/core/src/runtimeContracts.ts`
- `packages/core/src/orchestrator.ts`
- `packages/core/src/largeCorpus.ts`
- `packages/core/src/localRetrieval.ts`
- `packages/mcp-server/src/defaultRuntime.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`
- `packages/mcp-server/src/largeCorpusAnalysisStore.ts`
- `packages/mcp-server/src/hierarchicalIndexStore.ts`
- `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
- `scripts/smoke-large-corpus-routing.ts`

Plans/task lists created this conversation:
- `.plans/LARGE_SCALE_RAG_INGESTION_RESEARCH_PLAN.md`
- `.plans/PERSISTENT_LARGE_CORPUS_ANALYSIS_STORE_TASK_LIST.md`
- `.plans/PERSISTENT_HIERARCHICAL_INDEX_TASK_LIST.md`
- `.plans/STRUCTURED_JSONL_CHAT_INGESTION_TASK_LIST.md`

Validation that passed at the end:
- `npm run typecheck:core`
- `npm run typecheck:adapter`
- `npm run typecheck:mcp`
- `npm run smoke:large-corpus`

Most important next recommendation:
- implement field-aware structured retrieval / query decomposition for structured corpora
  - exact id/session/timestamp targeting
  - structured-query-first retrieval before fallback lexical search
  - optional time/topic/entity summary docs
This is the best next slice because the system is now record-aware and schema-aware, but not yet field-filter-aware.
