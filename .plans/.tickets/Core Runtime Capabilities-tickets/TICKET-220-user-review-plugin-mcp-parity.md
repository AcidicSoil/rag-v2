---
ticket_id: "tkt_mcp_parity_user_review"
title: "user-validates-plugin-to-mcp-parity-scope"
agent: "user"
done: false
goal: "A human reviewer confirms the MCP parity refactor matches the intended scope before broader adoption."
---

## Tasks
- Review the final MCP surface to confirm it now supports gate, routing, hybrid retrieval, corrective retrieval, model-rerank, safety controls, and `rag_prepare_prompt` as described in the source plan.
- Confirm the native plugin and MCP now share one orchestration path and that the default runtime remains a degraded fallback.
- Approve the parity refactor or capture any remaining scope gaps for follow-up tickets.

## Acceptance criteria
- A human reviewer has explicitly checked the parity outcomes named in the source plan.
- Any remaining gap between native plugin behavior and MCP exposure is either accepted or called out for follow-up work.
- Review confirms the refactor did not reintroduce duplicate orchestration paths.

## Tests
- Compare the implemented MCP surface against the expected result section in the source plan.
- Verify the final design still satisfies the non-negotiables listed in the source plan.
- Record review outcome in the repo's normal CAR workflow.

## Notes
- Source: "Expected-result" and "Non-negotiables"
- Constraints:
  - LM Studio plugin and MCP should share one orchestration path.
  - `rag_prepare_prompt` must exist for plugin-equivalent grounding.
  - Non-LM-Studio environments should still work through `defaultRuntime`.
- Evidence:
  - Shared orchestrator implementation
  - MCP contracts and handlers
  - LM Studio-backed runtime and degraded fallback runtime
- Dependencies:
  - `TICKET-200-mcp-handlers-use-orchestrator.md`
- Unknowns: Not provided
