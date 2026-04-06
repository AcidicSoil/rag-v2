# File Inspection Tooling Task List

## Scope reviewed
- latest MCP usage log showing successful `filesystem_browse` but no first-class file metadata or text sampling step
- `packages/core/src/runtimeContracts.ts`
- `packages/mcp-server/src/contracts.ts`
- `packages/mcp-server/src/handlers.ts`
- `packages/mcp-server/src/sdkServer.ts`
- `packages/mcp-server/src/pathResolution.ts`
- `packages/mcp-server/src/defaultRuntime.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`

## Problem statement
The latest MCP usage shows that after directory browsing, the next useful operations are file metadata inspection and partial text reading. Those capabilities are missing, which makes large-dataset inspection awkward and encourages the assistant to invent tools that do not exist.

## Execution order
1. Add shared runtime contracts for file metadata + partial text reading.
2. Add MCP schemas and handlers.
3. Implement file inspection helpers in shared MCP filesystem utilities.
4. Register `file_info` and `read_file` tools.
5. Add smoke coverage for file metadata and excerpt reading.

## Success criteria
- A user can inspect file metadata after `filesystem_browse`.
- A user can read a bounded text excerpt from large files without ingesting them as RAG corpora.
- The tools work in both default and LM Studio-backed runtimes.
