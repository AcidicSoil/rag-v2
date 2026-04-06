# Plugin Grounded Corpus Summary Parity Task List

## Scope reviewed
- exported plugin/MCP usage transcript showing unsupported dataset inventory claims
- `.plans/CORPUS_INSPECT_GROUNDED_INVENTORY_TASK_LIST.md`
- `.plans/FILE_INSPECTION_TASK_LIST.md`
- `packages/core/src/orchestrator.ts`
- `packages/core/src/largeCorpus.ts`
- `packages/core/src/runtimeContracts.ts`
- `packages/adapter-lmstudio/src/promptPreprocessor.ts`
- `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
- existing MCP/filesystem/large-corpus behavior

## Problem statement
The MCP path can now return grounded corpus inventories because it can inspect filesystem-backed corpora via `paths` and run large-corpus analysis.

The LM Studio plugin path is lower quality for the same class of requests because attached files are loaded only as inline `documents`. The core orchestrator currently runs `analyzeLargeCorpus()` only for `request.paths`, so plugin-attached corpora never receive large-corpus analysis.

As a result, the plugin cannot naturally reach grounded `global-summary` / `sample` behavior for high-level inventory requests over large attached corpora.

## Execution order
1. **Add document-backed large-corpus analysis fallback in core**
   - Introduce a helper that can build `RagCorpusAnalysis` from inline `RagDocument`s when no filesystem paths are available.
   - Reuse existing question-scope inference, summary-document shaping, modality inference, synopsis generation, and route recommendation logic where possible.

2. **Use the fallback from orchestrator load flow**
   - In `packages/core/src/orchestrator.ts`, after normal corpus loading:
     - prefer path-backed analysis when `request.paths` are available
     - otherwise, run the document-backed analysis when inline documents are present
   - Keep existing behavior unchanged for callers that do not need large-corpus analysis.

3. **Preserve plugin prepared-prompt quality**
   - Ensure the plugin route can now reach `global-summary` / `sample` through the normal orchestrator output path for inventory-style queries.
   - Avoid negative "no citations found" UX when the route succeeds via summary documents instead of retrieval evidence.

4. **Validation**
   - Add a focused smoke test for document-backed large-corpus inventory routing.
   - Re-run core/adapter/MCP typechecks and relevant smoke coverage.

## Current implementation focus
- [ ] Step 1: add document-backed large-corpus analysis.
- [ ] Step 2: wire fallback into orchestrator load flow.
- [ ] Step 3: smooth plugin success/status handling for summary routes.
- [ ] Step 4: validate with smoke tests and typechecks.

## Success criteria
- Attached-file plugin flows can produce grounded large-corpus summary behavior without filesystem paths.
- Inventory-style queries over large attached corpora can route to `global-summary` or `sample` based on observed attached-document characteristics.
- Plugin UX no longer treats a successful summary route as a retrieval failure merely because evidence blocks are empty.
