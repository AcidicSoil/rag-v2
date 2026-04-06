Next conversation recommended start point after reranker/helper work:

Highest-value next steps:
1. Move `packages/adapter-lmstudio/src/lmstudioModelResolution.ts` into a cleaner shared location if desired (for example a shared LM Studio utility module/package) so MCP importing from adapter internals is no longer the long-term pattern.
2. Decide whether to introduce a generic shared model-resolution abstraction to unify embedding and rerank resolution patterns more formally.
3. Add focused runtime-level smoke coverage for helper branch selection:
   - adapter manual embedding model path
   - adapter auto-detect rerank model path
   - MCP manual rerank model path
   - fallback note behavior when manual rerank model ID is missing or LM Studio has no matching model
4. If product direction still wants “full reranker support,” scope a separate dedicated non-LLM reranker engine/cross-encoder path instead of only LLM-assisted reranking.

Concrete repo state to remember:
- New plans exist:
  - `.plans/RERANKER_MODEL_UTILIZATION_TASK_LIST.md`
  - `.plans/LMSTUDIO_MODEL_RESOLUTION_HELPERS_TASK_LIST.md`
- Shared contracts now include `rerankModelResolver`.
- Adapter and MCP both pass `rerank.modelSource` / `rerank.modelId` through shared request options.
- Existing smoke coverage already validates:
  - rerank disabled really disables reranking
  - MCP handlers accept rerank model-source options
- All package typechecks and current rerank/MCP smokes passed at end of session.

Suggested immediate implementation slice for the next session:
- Add targeted smoke tests around LM Studio helper branch selection and error/fallback reporting, because that gives the most confidence with the least architectural churn.
