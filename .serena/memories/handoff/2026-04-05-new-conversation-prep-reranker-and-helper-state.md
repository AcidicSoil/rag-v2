New-conversation prep summary for the current repo state:

The session focused on reranker behavior/parity and LM Studio model-resolution cleanup after the large-corpus work had already landed.

What was implemented this session:
- Core rerank behavior now correctly respects `options.rerank.enabled` in `packages/core/src/orchestrator.ts`.
- Shared rerank request options now include `modelSource` and `modelId` in `packages/core/src/requestOptions.ts`.
- Shared runtime contracts now include `RagRerankModelResolver` and `RagRerankModelResolution` in `packages/core/src/runtimeContracts.ts`.
- Adapter runtime (`packages/adapter-lmstudio/src/orchestratorRuntime.ts`) now:
  - exposes `rerankModelResolver`
  - supports `active-chat-model`, `auto-detect`, and `manual-model-id`
  - passes rerank model selection through shared request options
  - uses cached rerank model resolution with optional auto-unload
- Adapter config (`packages/adapter-lmstudio/src/config.ts`) gained `modelRerankMode` and clarified rerank model semantics.
- MCP contracts/SDK/handlers now accept and merge rerank model source/model ID fields:
  - `packages/mcp-server/src/contracts.ts`
  - `packages/mcp-server/src/sdkServer.ts`
  - `packages/mcp-server/src/handlers.ts`
- MCP LM Studio runtime (`packages/mcp-server/src/lmstudioRuntime.ts`) now:
  - exposes `rerankModelResolver`
  - supports `active-chat-model`, `auto-detect`, and `manual-model-id`
  - caches rerank model resolution by source/model key
- Shared LM Studio model-resolution helper module was added:
  - `packages/adapter-lmstudio/src/lmstudioModelResolution.ts`
  - both adapter runtime and MCP LM Studio runtime now use it for embedding/rerank selection heuristics

Plan/task files created:
- `.plans/RERANKER_MODEL_UTILIZATION_TASK_LIST.md`
- `.plans/LMSTUDIO_MODEL_RESOLUTION_HELPERS_TASK_LIST.md`

Validation status at handoff:
- `npm run typecheck:core` ✅
- `npm run typecheck:adapter` ✅
- `npm run typecheck:mcp` ✅
- `npm run typecheck:packages` ✅
- `npm run smoke:rerank` ✅
- `npm run smoke:model-rerank` ✅
- `npm run smoke:rerank-config` ✅
- `npm run smoke:mcp` ✅

Important architectural note:
- The shared LM Studio helper currently lives under `packages/adapter-lmstudio/src/` and MCP imports it from there. That works, but it is probably the next cleanup target if a more neutral shared location/package is preferred.

Recommended next implementation slice:
- Add targeted smoke tests for helper branch selection and failure/fallback behavior (manual model missing, no downloaded model available, auto-detect branch selection), because this gives the most confidence with minimal architectural churn.
