# Reranker Model Utilization Task List

## Scope reviewed
- `.plans/IMPLEMENTATION_TASK_LIST.md`
- `packages/core/src/orchestrator.ts`
- `packages/core/src/runtimeContracts.ts`
- `packages/core/src/requestOptions.ts`
- `packages/adapter-lmstudio/src/config.ts`
- `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
- `packages/lmstudio-shared/src/modelRerank.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`
- `packages/mcp-server/src/contracts.ts`
- `packages/mcp-server/src/handlers.ts`

## Problem statement
The repo currently supports heuristic reranking by default and optional LLM-assisted reranking, but it does not fully utilize reranker models in a clean or fully configurable way.

Current gaps:
- `rerankEnabled` is surfaced in config and request options but is not honored in shared core rerank execution.
- The adapter uses an LLM for model-assisted reranking, but the model-selection path is ad hoc rather than a dedicated resolved/cached runtime path.
- There is no explicit rerank-model mode that distinguishes active chat model vs configured model vs auto-detected model.
- Diagnostics do not clearly report which rerank model path was used.
- MCP LM Studio runtime still uses the default active model for model-assisted reranking and does not yet expose a matching configuration surface.

## Execution order
1. **Honor rerank enable/disable in shared core**
   - Gate heuristic reranking on `options.rerank.enabled`.
   - Preserve current defaults so existing behavior is unchanged unless explicitly disabled.
   - Keep dedupe active after rerank/no-rerank selection.

2. **Add a dedicated adapter rerank-model resolution path**
   - Introduce a cached rerank model resolver in `packages/adapter-lmstudio/src/orchestratorRuntime.ts`.
   - Support three modes:
     - active/default chat model
     - explicit configured model ID
     - auto-detect loaded/downloaded LLM
   - Reuse the resolver across rerank calls in the same request lifecycle.

3. **Expand plugin config for rerank model selection**
   - Add a `modelRerankMode` selector.
   - Retain `modelRerankModelId` for manual selection.
   - Clarify UI text so users understand this is LLM-assisted reranking, not embedding retrieval.

4. **Improve diagnostics and fallback notes**
   - Report whether reranking was disabled, heuristic-only, or model-assisted.
   - Report which rerank model source was used when model-assisted reranking runs.
   - Keep fallback notes explicit when rerank model resolution or completion fails.

5. **Targeted validation**
   - Typecheck all packages.
   - Add/update smoke coverage for:
     - rerank disabled path
     - model-assisted rerank path selection behavior
     - fallback-to-heuristic note path

## Current implementation focus
- [x] Step 1: honor `rerankEnabled` in shared core.
- [x] Step 2: add cached adapter rerank-model resolution.
- [x] Step 3: widen adapter config for rerank model mode.
- [x] Step 4: improve rerank diagnostics.
- [x] Step 5: validate with typechecks and smoke coverage.

## Non-goals for this pass
- Adding a separate non-LLM cross-encoder reranker engine.
- Building a full MCP-side rerank model configuration surface matching the plugin UI.
- Changing the degraded default runtime beyond honoring the shared rerank enable flag.


## Follow-on parity work landed after the initial pass
- [x] Added shared `rerankModelResolver` capability in `packages/core/src/runtimeContracts.ts`.
- [x] Wired core diagnostics to report resolved rerank model usage when model-assisted reranking is active.
- [x] Added MCP-side rerank model source parity and runtime resolution/caching.
- [ ] Remaining follow-up: decide whether to factor embedding and rerank model resolution into a common shared helper/resolver abstraction.
