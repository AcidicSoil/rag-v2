---
ticket_id: "tkt_mcp_parity_contract_surface"
title: "mcp-contract-surface-matches-supported-plugin-controls"
agent: "codex"
done: false
goal: "The MCP server exposes the plugin-parity option groups and the missing `rag_prepare_prompt` primitive only where runtime support exists."
---

## Tasks
- Replace the narrow `retrievalOverrides` shape in `packages/mcp-server/src/contracts.ts` with grouped `policy`, `routing`, `retrieval`, `rerank`, and `safety` options matching the source plan.
- Add the `rag_prepare_prompt` tool to `packages/mcp-server/src/sdkServer.ts` while keeping the existing four tools.
- Define the `rag_prepare_prompt` output fields named in the source plan: `route`, `preparedPrompt`, `evidence`, `diagnostics`, and `unsupportedClaimWarnings`.

## Acceptance criteria
- The MCP contract exposes the option groups listed in the source plan instead of the old narrow override shape.
- The MCP server registers exactly one new primitive, `rag_prepare_prompt`, in addition to the existing four tools.
- Newly exposed options only correspond to runtime capabilities that now exist in the parity design.

## Tests
- Verify the MCP tool registry includes `rag_answer`, `rag_search`, `corpus_inspect`, `rerank_only`, and `rag_prepare_prompt`.
- Inspect the contract definitions to confirm the grouped option sets include the fields listed in the source plan.
- Review the surface for unsupported knobs to ensure fake parity is not introduced.

## Notes
- Source: "Widen-the-MCP-contract-to-plugin-parity" and "Do not explode the tool surface."
- Constraints:
  - Add exactly one new primitive.
  - Do not expose plugin knobs without runtime support.
- Evidence:
  - `packages/mcp-server/src/contracts.ts`
  - `packages/mcp-server/src/sdkServer.ts`
- Dependencies:
  - `TICKET-140-lmstudio-mcp-runtime.md`
  - `TICKET-160-default-runtime-degraded-mode.md`
- Unknowns:
  - Whether any legacy schema aliases need to be preserved during migration.
