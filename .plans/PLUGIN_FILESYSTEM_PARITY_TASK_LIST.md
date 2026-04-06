# Plugin Filesystem Parity Task List

## Scope reviewed
- `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
- `packages/adapter-lmstudio/src/promptPreprocessor.ts`
- `packages/mcp-server/src/pathResolution.ts`
- latest MCP-only usage logs for `raw-chat-data`

## Problem statement
The MCP server now supports filesystem-first inspection (`filesystem_browse`, `file_info`, `read_file`) plus directory summaries. The LM Studio plugin path still uses placeholder browser methods inside the adapter runtime, so plugin-side parity is incomplete even though MCP is upgraded.

## Execution order
1. Add shared/local filesystem helper implementations for the adapter runtime.
2. Replace placeholder `browser.browse`, `browser.fileInfo`, and `browser.readFile` methods in `orchestratorRuntime.ts`.
3. Re-run adapter/core/MCP typechecks and MCP filesystem smoke tests.
4. Document the remaining distinction: MCP exposes tools; LM Studio plugin currently uses these helpers internally, not as standalone plugin tools.

## Success criteria
- The adapter runtime no longer returns placeholder "MCP only" browser responses.
- Plugin-side path expansion, file metadata, bounded reading, and directory summaries match MCP semantics closely.
