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
- `scripts/smoke-lmstudio-model-resolution.ts`

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

6. **Follow-up validation coverage**
   - Add targeted helper-branch smoke coverage for:
     - manual embedding model path
     - auto-detect embedding downloaded-model preference
     - manual rerank model path and cache reuse
     - auto-detect rerank loaded/downloaded-model preference
     - missing-model error paths for embedding and rerank helpers

7. **Move helper to a neutral LM Studio shared package**
   - Create `packages/lmstudio-shared/` for LM Studio-specific shared utilities.
   - Move the model-resolution helper and `AUTO_DETECT_MODEL_ID` there.
   - Update adapter and MCP imports to use the neutral shared package path.
   - Remove the old adapter-local helper file so MCP no longer imports adapter internals.

## Current implementation focus
- [x] Step 1: add shared helper module.
- [x] Step 2: migrate adapter runtime.
- [x] Step 3: migrate MCP LM Studio runtime.
- [x] Step 4: cleanup duplicated helpers.
- [x] Step 5: validate with typechecks and smoke tests.
- [x] Step 6: add focused helper-branch smoke coverage.
- [x] Step 7: move helper to a neutral LM Studio shared package.

## Validation completed
- `npm run typecheck:adapter`
- `npm run typecheck:mcp`
- `npm run typecheck:lmstudio-shared`
- `npm run smoke:mcp`
- `npm run smoke:lmstudio-model-resolution`

## Non-goals for this pass
- Changing user-facing rerank or embedding config semantics.
- Introducing a non-LLM reranker engine.
- Refactoring non-LM-Studio runtimes.

## Remaining follow-up options
- Consider whether `lmstudioCoreBridge`, `modelRerank`, and related LM Studio-only helpers should also move out of adapter internals if MCP reuse grows further.
- Decide whether embedding/rerank helper APIs should converge behind a more generic model-resolution abstraction.
- Add runtime-level assertions for note text if stronger end-to-end fallback diagnostics coverage is desired beyond helper-level error-contract validation.
