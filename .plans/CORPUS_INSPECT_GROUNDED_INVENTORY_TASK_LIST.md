# Corpus Inspect Grounded Inventory Task List

## Scope reviewed
- exported plugin/MCP usage transcript showing an unsupported high-level dataset inventory with no verifiable tool evidence
- `.plans/FILE_INSPECTION_TASK_LIST.md`
- `.plans/FILESYSTEM_BROWSING_TASK_LIST.md`
- `packages/core/src/runtimeContracts.ts`
- `packages/core/src/largeCorpus.ts`
- `packages/mcp-server/src/contracts.ts`
- `packages/mcp-server/src/handlers.ts`
- `packages/mcp-server/src/sdkServer.ts`
- `packages/mcp-server/src/defaultRuntime.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`
- `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
- existing MCP / filesystem smoke scripts

## Problem statement
The current `corpus_inspect` tool returns only route-level metadata (`fileCount`, `estimatedTokens`, route recommendation). That is not enough to answer a user asking "what is in this dataset overall?" with grounded filesystem evidence.

The codebase already has richer large-corpus analysis primitives (`directoryManifests`, `largeFileSynopses`, analysis notes), but those artifacts are only used inside orchestrated request flows and are discarded by `corpus_inspect`.

This gap makes it easier for the assistant to improvise unsupported inventories instead of returning observed corpus facts.

## Execution order
1. **Expose grounded inventory fields in corpus inspect contracts**
   - Extend `CorpusInspectRequest` / MCP schema with an optional `query` to guide large-corpus analysis scope.
   - Extend `CorpusInspectResponse` with optional grounded inventory fields derived from large-corpus analysis:
     - question scope
     - target type
     - modality
     - analysis notes
     - directory manifests
     - large-file synopses
     - oversized paths

2. **Populate corpus analysis for corpus inspect flows**
   - In MCP handlers, load the corpus as before.
   - If `paths` are supplied and a browser is available, run `analyzeLargeCorpus()` using:
     - the provided `query`, or
     - a safe default inspect query representing an overall inventory request.
   - Attach the resulting analysis to the loaded corpus before calling `runtime.inspector.inspect()`.

3. **Return grounded inventory data from runtimes**
   - Update default, LM Studio MCP, and adapter runtime inspectors so they surface the optional analysis fields when present while preserving the existing route summary fields.

4. **Improve tool description / discoverability**
   - Update MCP `corpus_inspect` tool description so it explicitly mentions high-level inventory/manifests for filesystem-backed corpora.

5. **Validation**
   - Add a focused smoke test that inspects a real directory-shaped corpus and asserts grounded manifest/synopsis fields are present.
   - Re-run targeted typechecks and MCP/filesystem smoke coverage.

## Current implementation focus
- [ ] Step 1: extend inspect request/response contracts.
- [ ] Step 2: attach large-corpus analysis in handler flow.
- [ ] Step 3: surface grounded inventory fields from runtimes.
- [ ] Step 4: update MCP tool description.
- [ ] Step 5: validate with smoke coverage and typechecks.

## Success criteria
- `corpus_inspect` can answer a high-level dataset inventory request using observed filesystem/manifold facts instead of route metadata alone.
- Inspect responses remain backward-compatible for existing callers that only read the original summary fields.
- MCP users can distinguish between observed corpus facts (manifests/synopses) and inferred route recommendations.
