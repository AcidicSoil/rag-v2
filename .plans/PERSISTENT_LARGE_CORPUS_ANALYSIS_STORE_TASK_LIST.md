# Persistent Large-Corpus Analysis Store Task List

## Scope reviewed
- `.plans/LARGE_SCALE_RAG_INGESTION_RESEARCH_PLAN.md`
- `.plans/LARGE_CORPUS_RAG_IMPLEMENTATION_PLAN.md`
- `.plans/LARGE_CORPUS_RAG_TASK_LIST.md`
- current in-memory-only large-corpus cache in `packages/core/src/largeCorpus.ts`
- `packages/core/src/runtimeContracts.ts`
- `packages/core/src/orchestrator.ts`
- `packages/mcp-server/src/defaultRuntime.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`
- large-corpus smoke coverage

## Problem statement
The repo already computes useful large-corpus analysis artifacts (directory manifests, file synopses, route recommendations, notes), but it only caches them in memory per process. That means repeated queries over the same large corpus still lose the analysis on process restart or new client sessions.

A full persistent embedding/index layer is a bigger next stage. The lowest-risk first slice is to persist the lightweight large-corpus analysis artifacts and rehydrate any heavier in-memory structures (like hierarchical indexes) on demand.

## Execution order
1. Add an optional large-corpus analysis store runtime contract in core.
2. Teach `analyzeLargeCorpus()` to:
   - reuse persisted lightweight analysis when available
   - persist freshly computed lightweight analysis
   - rebuild hierarchical index in memory when needed after persisted reuse
3. Add a filesystem-backed analysis store implementation for MCP runtimes.
4. Wire the store into default and LM Studio MCP runtimes.
5. Add smoke coverage proving persisted reuse after clearing in-memory cache.

## Current implementation focus
- [ ] Step 1: add runtime contract.
- [ ] Step 2: persist/reuse lightweight analysis in core.
- [ ] Step 3: add MCP filesystem-backed store.
- [ ] Step 4: wire runtimes.
- [ ] Step 5: validate with typechecks and large-corpus smoke coverage.

## Success criteria
- large-corpus manifest/synopsis analysis survives beyond the current in-memory cache lifetime
- repeated queries can reuse persisted analysis without reparsing/sampling the corpus from scratch
- hierarchical retrieval still works because any heavy in-memory index is rebuilt on demand rather than serialized blindly
