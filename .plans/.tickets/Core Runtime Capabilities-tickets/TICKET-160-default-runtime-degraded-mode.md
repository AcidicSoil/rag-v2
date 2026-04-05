---
ticket_id: "tkt_mcp_parity_default_runtime_degraded"
title: "default-runtime-is-an-explicit-degraded-fallback"
agent: "codex"
done: false
goal: "The default MCP runtime remains available as a deterministic degraded mode with clearly limited behavior."
---

## Tasks
- Update `packages/mcp-server/src/defaultRuntime.ts` so it is explicitly documented and implemented as the degraded fallback runtime.
- Preserve the degraded behavior named in the source plan: lexical-only retrieval, no semantic retrieval, no LM Studio parser, no model rerank, no active-model context-fit routing, and no LM Studio citations.
- Ensure the fallback runtime stays compatible with the expanded core runtime contracts.

## Acceptance criteria
- `defaultRuntime.ts` remains usable after the parity refactor.
- The fallback runtime behavior matches the degraded-mode limitations named in the source plan.
- The degraded runtime can coexist with the LM Studio-backed runtime without blocking parity work.

## Tests
- Verify the fallback runtime still executes through the shared core contracts.
- Review the fallback implementation to confirm each excluded capability from the source plan is absent.
- Confirm the fallback path remains deterministic and lexical-only.

## Notes
- Source: "Keep `defaultRuntime.ts`, but make it explicitly degraded."
- Constraints:
  - lexical only
  - no semantic retrieval
  - no LM Studio parser
  - no model rerank
  - no context-fit routing against active model
  - no LM Studio citations
- Evidence:
  - `packages/mcp-server/src/defaultRuntime.ts`
- Dependencies:
  - `TICKET-100-core-runtime-capabilities.md`
  - `TICKET-120-shared-rag-orchestrator.md`
- Unknowns: Not provided
