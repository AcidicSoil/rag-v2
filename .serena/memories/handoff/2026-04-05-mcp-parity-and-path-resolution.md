# Handoff — MCP parity refactor plus path resolution follow-up (2026-04-05)

## What landed

### Shared core orchestration
- Added `packages/core/src/requestOptions.ts` for grouped request options and output mode typing.
- Added `packages/core/src/outputContracts.ts` for orchestrator output contracts and diagnostics.
- Expanded `packages/core/src/runtimeContracts.ts` with optional parity capability interfaces:
  - `documentParser`
  - `embeddingModelResolver`
  - `semanticRetriever`
  - `llmReranker`
  - `contextSizer`
  - `citationEmitter`
  - `policyEngine`
- Added `packages/core/src/orchestrator.ts`.
- Exported new core surfaces from `packages/core/src/index.ts`.

### MCP parity work
- `packages/mcp-server/src/contracts.ts`
  - widened MCP request surface with grouped `policy`, `routing`, `retrieval`, `rerank`, and `safety` options
  - kept legacy retrieval aliases for compatibility
  - added `rag_prepare_prompt` input/output schemas
- `packages/mcp-server/src/handlers.ts`
  - `rag_answer`, `rag_search`, and `rag_prepare_prompt` now delegate to the shared core orchestrator
  - `rag_search` explicitly forces retrieval semantics
  - `rag_answer` treats MCP `mode: "auto"` as retrieval-first for MCP behavior compatibility
  - `rerank_only` remains focused utility logic
- `packages/mcp-server/src/sdkServer.ts`
  - registers grouped options on tool schemas
  - registers `rag_prepare_prompt`
  - supports runtime selection via `RAG_V2_MCP_RUNTIME`
    - `default` => degraded lexical runtime
    - `lmstudio` => LM Studio-backed runtime
- Added `packages/mcp-server/src/lmstudioRuntime.ts`
  - LM Studio-backed MCP runtime using actual SDK methods present in repo
  - supports file parsing, embedding model resolution, semantic retrieval, context sizing, model-assisted rerank hook, and citations/evidence flow
- `packages/mcp-server/src/defaultRuntime.ts`
  - remains degraded lexical fallback

### LM Studio adapter migration
- Added `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
  - adapter runtime implementation for shared orchestrator
  - maps plugin config into grouped core request options
  - exposes semantic retrieval, hybrid merge, model rerank, context sizing, and cleanup/auto-unload behavior
- Replaced the large retrieval orchestration body in `packages/adapter-lmstudio/src/promptPreprocessor.ts`
  - retrieval path now calls the shared core orchestrator
  - full-context path and context-fit helper remain in-file

### Path normalization / directory traversal follow-up
- Added `packages/mcp-server/src/pathResolution.ts`
  - `expandUserPath()` supports `~` and `~/...`
  - `resolveUserPath()` normalizes user paths consistently
  - `discoverSupportedTextFiles()` recursively walks directories and returns supported text files
- Updated both runtimes to use shared path handling:
  - `packages/mcp-server/src/defaultRuntime.ts`
  - `packages/mcp-server/src/lmstudioRuntime.ts`
- Result:
  - default runtime recursively searches target directories
  - LM Studio runtime now also recursively searches target directories
  - both runtimes now expand `~`

## Validation completed
- `npm run typecheck`
- `npm run smoke:core`
- `npm run smoke:mcp`
- `npm run smoke:mcp-filesystem`

All passed at the end of the work.

## Behavioral notes
- The shared orchestrator can choose full-context for small corpora.
- MCP `rag_search` and `rag_answer` are intentionally forced/aligned to retrieval-first semantics to preserve expected MCP tool behavior and existing smoke expectations.
- Live LM Studio session validation was not performed here; LM Studio-backed runtime and adapter path are statically validated and integrated, but not exercised against a running LM Studio instance in this environment.

## Useful env/config detail
- MCP runtime selection now depends on:
  - `RAG_V2_MCP_RUNTIME=default`
  - `RAG_V2_MCP_RUNTIME=lmstudio`

## If continuing next
Best next follow-up is live LM Studio validation for:
1. MCP runtime in `lmstudio` mode
2. adapter prompt preprocessor path in LM Studio UI
3. large-directory behavior and any need for traversal limits / ignore patterns
