# Persistent Hierarchical Index Task List

## Scope reviewed
- `.plans/PERSISTENT_LARGE_CORPUS_ANALYSIS_STORE_TASK_LIST.md`
- `packages/core/src/localRetrieval.ts`
- `packages/core/src/largeCorpus.ts`
- `packages/core/src/orchestrator.ts`
- `packages/core/src/runtimeContracts.ts`
- `packages/mcp-server/src/largeCorpusAnalysisStore.ts`
- current large-corpus smoke coverage

## Problem statement
Large-corpus analysis is now persisted lightly (manifests, synopses, route recommendations), but hierarchical retrieval still requires rebuilding the parent/child index in memory from source documents after persisted analysis reuse.

That means repeated large local lookup queries still pay the hierarchical index construction cost even when the corpus-level analysis has already been persisted.

## Execution order
1. Add an optional hierarchical index store runtime contract in core.
2. Teach `analyzeLargeCorpus()` to:
   - reuse a persisted hierarchical index when persisted analysis says one is needed
   - persist newly built hierarchical indexes
   - fall back to in-memory rebuild only when persisted index reuse is unavailable
3. Add a filesystem-backed hierarchical index store for MCP runtimes.
4. Wire it into default and LM Studio MCP runtimes.
5. Extend large-corpus smoke coverage to prove persisted hierarchical index reuse after clearing the in-memory analysis cache.

## Current implementation focus
- [ ] Step 1: add runtime contract.
- [ ] Step 2: core persisted hierarchical index reuse/persist path.
- [ ] Step 3: MCP filesystem-backed index store.
- [ ] Step 4: runtime wiring.
- [ ] Step 5: validation.

## Success criteria
- repeated hierarchical retrieval queries can reuse a persisted parent/child index across runtime lifetimes
- diagnostics can distinguish persisted hierarchical-index reuse from in-memory cache reuse
- hierarchical retrieval correctness remains unchanged when persistence is unavailable
