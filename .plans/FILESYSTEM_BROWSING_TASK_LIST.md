# Filesystem Browsing / Traversal Hardening Task List

## Scope reviewed
- prior MCP testing log showing repo-cwd-relative behavior and failures on broad directory targets
- `packages/mcp-server/src/sdkServer.ts`
- `packages/mcp-server/src/contracts.ts`
- `packages/mcp-server/src/handlers.ts`
- `packages/mcp-server/src/defaultRuntime.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`
- `packages/mcp-server/src/pathResolution.ts`
- `packages/core/src/runtimeContracts.ts`

## Problem statement
Current MCP tools treat filesystem paths only as corpus-ingestion inputs. That causes three gaps:
1. `.` resolves relative to the server cwd, which can make behavior look repo-scoped.
2. There is no dedicated browse/list primitive for inspecting a target before RAG ingestion.
3. Large directories can be too expensive because loaders recurse immediately instead of first exposing structure and limits.

## Execution order
1. **Filesystem browse contract and MCP tool surface**
   - Add shared runtime/tool handler types for a filesystem browsing operation.
   - Add MCP request/response schemas.
   - Register a dedicated MCP tool (filesystem-first, not RAG-first).

2. **Shared filesystem browse implementation hooks**
   - Extend `pathResolution.ts` with listing helpers and entry metadata.
   - Implement browse behavior in both default and LM Studio-backed runtimes.
   - Include path expansion, cwd reporting, resolved path reporting, recursive/depth control, and entry caps.

3. **Traversal hardening for corpus ingestion**
   - Introduce discovery limits / guardrails for recursive corpus loading.
   - Keep broad directory traversal from causing stack overflows or huge ingestion attempts.
   - Surface truncation / guardrail notes where practical.

4. **Validation and smoke coverage**
   - Add filesystem browse smoke coverage.
   - Keep existing MCP handler/filesystem smoke tests passing.
   - Re-run package typechecks.

## Current implementation focus
- Start with step 1 + step 2 because they unlock proper directory inspection without overloading RAG tools.
- If time remains in this pass, begin step 3 with safe defaults for traversal limits.

## Success criteria
- A user can browse a path like `~/projects` and see the resolved absolute target.
- Browsing can list immediate children or recurse with explicit depth/entry limits.
- Browsing is available in both degraded and LM Studio-backed runtimes.
- RAG tools no longer need to be used as a surrogate directory lister.
