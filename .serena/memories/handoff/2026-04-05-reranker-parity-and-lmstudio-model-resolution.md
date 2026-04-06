Implemented reranker/utilization and LM Studio model-resolution follow-on work across core, adapter, and MCP.

Summary of changes:
- Shared core rerank behavior:
  - `packages/core/src/orchestrator.ts` now honors `options.rerank.enabled`.
  - Added diagnostics notes for rerank enabled/disabled behavior.
  - When `heuristic-then-llm` is active and a resolver exists, orchestrator now records resolved rerank model usage.
- Shared core contracts/options:
  - `packages/core/src/requestOptions.ts` gained shared rerank model selection fields:
    - `rerank.modelSource`
    - `rerank.modelId`
  - `packages/core/src/runtimeContracts.ts` gained:
    - `RagRerankModelResolution`
    - `RagRerankModelResolver`
    - runtime capability slot `rerankModelResolver`
- Adapter LM Studio runtime:
  - Added plugin config support for rerank model source selection via `modelRerankMode` while retaining `modelRerankModelId`.
  - `packages/adapter-lmstudio/src/orchestratorRuntime.ts` now exposes `rerankModelResolver` and uses shared request-option rerank fields.
  - Adapter request options now include rerank `modelSource` / `modelId`.
  - Added request-lifecycle rerank model caching and preserved auto-unload behavior.
- MCP parity:
  - `packages/mcp-server/src/contracts.ts`, `packages/mcp-server/src/sdkServer.ts`, and `packages/mcp-server/src/handlers.ts` now accept and merge MCP-side rerank model source/model ID fields.
  - `packages/mcp-server/src/lmstudioRuntime.ts` now exposes `rerankModelResolver` and supports:
    - `active-chat-model`
    - `auto-detect`
    - `manual-model-id`
  - MCP LM Studio runtime also caches rerank model resolution by source/model key.
- Shared LM Studio helper extraction:
  - Created `packages/adapter-lmstudio/src/lmstudioModelResolution.ts`.
  - Moved duplicated LM Studio model-selection heuristics there for:
    - adapter embedding resolution
    - auto-detected embedding resolution
    - rerank LLM resolution
  - Migrated both adapter runtime and MCP LM Studio runtime to use this helper module.

Plans/task lists added:
- `.plans/RERANKER_MODEL_UTILIZATION_TASK_LIST.md`
- `.plans/LMSTUDIO_MODEL_RESOLUTION_HELPERS_TASK_LIST.md`

Validation completed:
- `npm run typecheck:core`
- `npm run typecheck:adapter`
- `npm run typecheck:mcp`
- `npm run typecheck:packages`
- `npm run smoke:rerank`
- `npm run smoke:model-rerank`
- `npm run smoke:rerank-config`
- `npm run smoke:mcp`
All passed at the end of the session.

Current architectural state:
- Reranking is no longer effectively always-on; shared core respects disable/enable.
- Adapter and MCP now share the same rerank model-source semantics.
- Embedding/rerank LM Studio auto-detect/manual/default heuristics have a single helper implementation, reducing drift.
- There is still no non-LLM dedicated reranker engine/cross-encoder path.
- The shared LM Studio helper currently lives under `packages/adapter-lmstudio/src/`, which works but is not the cleanest long-term shared location.
