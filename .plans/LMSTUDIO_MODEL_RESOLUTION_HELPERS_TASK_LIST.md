# LM Studio Model Resolution Helper Refactor Task List

## Scope reviewed
- `.plans/RERANKER_MODEL_UTILIZATION_TASK_LIST.md`
- `packages/core/src/runtimeContracts.ts`
- `packages/core/src/requestOptions.ts`
- `packages/core/src/orchestrator.ts`
- `packages/adapter-lmstudio/src/config.ts`
- `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`
- existing smoke scripts touching rerank and MCP handler behavior

## Problem statement
Both the adapter and the MCP LM Studio runtime now support embedding and rerank model resolution, but the selection logic is duplicated.

Current duplication:
- embedding model manual/auto-detect selection logic in the adapter runtime
- embedding model auto-detect logic in the MCP LM Studio runtime
- rerank model source selection (`active-chat-model`, `auto-detect`, `manual-model-id`) in both runtimes
- LM Studio loaded/downloaded-model heuristics are duplicated and can drift

## Execution order
1. **Create shared LM Studio model-resolution helpers**
   - Add a helper module under `packages/adapter-lmstudio/src/` that encapsulates:
     - embedding model selection
     - rerank LLM selection
     - auto-detect heuristics for embedding and chat/instruct models
     - optional cache integration for rerank model resolution
   - Keep it runtime-agnostic enough for both adapter and MCP imports.

2. **Migrate adapter runtime to helpers**
   - Replace inline embedding/rerank selection logic in `orchestratorRuntime.ts`.
   - Preserve request-lifecycle caching and auto-unload behavior.

3. **Migrate MCP LM Studio runtime to helpers**
   - Replace local `resolveEmbeddingModel()` and `resolveRerankModel()` helpers.
   - Preserve per-runtime rerank cache behavior.

4. **Cleanup duplicated logic**
   - Remove dead helper functions and duplicated heuristics from the runtimes.
   - Keep diagnostics behavior unchanged except where helper-backed notes improve consistency.

5. **Validation**
   - Typecheck core, adapter, and MCP packages.
   - Run rerank and MCP smoke coverage.

## Current implementation focus
- [ ] Step 1: add shared helper module.
- [ ] Step 2: migrate adapter runtime.
- [ ] Step 3: migrate MCP LM Studio runtime.
- [ ] Step 4: cleanup duplicated helpers.
- [ ] Step 5: validate with typechecks and smoke tests.

## Non-goals for this pass
- Changing user-facing rerank or embedding config semantics.
- Introducing a non-LLM reranker engine.
- Refactoring non-LM-Studio runtimes.