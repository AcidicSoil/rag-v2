---
ticket_id: "tkt_mcp_parity_lmstudio_runtime"
title: "lmstudio-backed-mcp-runtime-provides-plugin-services"
agent: "codex"
done: false
goal: "The MCP server can run through an LM Studio-backed runtime that exposes the same service class the native plugin uses."
---

## Tasks
- Add `packages/mcp-server/src/lmstudioRuntime.ts` with `createLmStudioMcpRuntime()`.
- Implement the LM Studio-backed services named in the source plan: file parsing via LM Studio parsers, embedding model resolution or autodetect, semantic retrieval, optional auto-unload, model-assisted rerank, and active-model context sizing.
- Wire the runtime to the shared core capability interfaces instead of creating MCP-only orchestration logic.

## Acceptance criteria
- The MCP server has an LM Studio-backed runtime file at the path named in the source plan.
- The runtime exposes the service categories required for semantic retrieval and model-assisted behavior instead of relying on lexical-only fallback behavior.
- The runtime integrates through the shared core contracts rather than introducing a second orchestration path.

## Tests
- Verify the LM Studio-backed runtime can be instantiated through `createLmStudioMcpRuntime()`.
- Confirm the runtime surface includes the service categories listed in the source plan.
- Review the MCP runtime wiring to ensure it feeds the shared orchestrator rather than duplicating retrieval flow.

## Notes
- Source: "Replace-the-thin-MCP-runtime-with-two-runtimes" and "That is the only way MCP can actually expose plugin-level behavior instead of pretending with extra schema fields."
- Constraints:
  - Use `@lmstudio/sdk` to provide the LM Studio-backed services.
  - Do not expose plugin-level controls without real runtime support.
- Evidence:
  - `packages/mcp-server/src/lmstudioRuntime.ts`
  - Workspace dependency on `@lmstudio/sdk`
- Dependencies:
  - `TICKET-100-core-runtime-capabilities.md`
  - `TICKET-120-shared-rag-orchestrator.md`
- Unknowns:
  - Any repo-specific LM Studio initialization details beyond the services explicitly listed in the source plan.
