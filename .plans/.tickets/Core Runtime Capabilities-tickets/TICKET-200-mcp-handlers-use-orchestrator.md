---
ticket_id: "tkt_mcp_parity_handler_refactor"
title: "mcp-handlers-delegate-to-the-shared-orchestrator"
agent: "codex"
done: false
goal: "MCP handlers map requests onto the shared orchestrator and return parity-aligned outputs instead of hardcoded thin-flow behavior."
---

## Tasks
- Refactor `packages/mcp-server/src/handlers.ts` to call the shared orchestration entrypoint instead of directly invoking retriever search, fixed `heuristic-v1`, simple route derivation, and the stub answer-composition path.
- Map orchestrator outputs into the MCP tool responses for `rag_answer`, `rag_search`, and `rag_prepare_prompt`.
- Preserve the source-plan output distinctions for answer synthesis, search results, and prepared prompt generation.

## Acceptance criteria
- MCP handlers call the shared orchestration path for supported outputs.
- The direct thin-flow logic called out in the source plan is removed from the main MCP handler path.
- MCP tool responses are shaped from orchestrator outputs rather than ad hoc retrieval logic.

## Tests
- Verify `handlers.ts` contains the orchestrator call path described in the source plan.
- Confirm `rag_answer`, `rag_search`, and `rag_prepare_prompt` each return data derived from the shared orchestrator output.
- Review the handler flow to ensure the stub answer path is no longer the primary implementation.

## Notes
- Source: "Refactor-handlers-not-just-schemas" and the provided `orchestrateRagRequest(...)` sketch.
- Constraints:
  - Stop doing direct `runtime.retriever.search(...)` in the main path.
  - Stop hardcoding fixed `heuristic-v1`, simple `deriveRoute(...)`, and stub answer composition as the primary flow.
- Evidence:
  - `packages/mcp-server/src/handlers.ts`
- Dependencies:
  - `TICKET-120-shared-rag-orchestrator.md`
  - `TICKET-180-mcp-contract-parity.md`
- Unknowns:
  - Exact helper extraction boundaries inside `handlers.ts` beyond the orchestrator entrypoint.
