# MCP / Plugin Parity Implementation Task List

## Scope reviewed
- `.plans/.tickets/Core Runtime Capabilities-tickets/TICKET-100-core-runtime-capabilities.md`
- `.plans/.tickets/Core Runtime Capabilities-tickets/TICKET-120-shared-rag-orchestrator.md`
- `.plans/.tickets/Core Runtime Capabilities-tickets/TICKET-140-lmstudio-mcp-runtime.md`
- `.plans/.tickets/Core Runtime Capabilities-tickets/TICKET-160-default-runtime-degraded-mode.md`
- `.plans/.tickets/Core Runtime Capabilities-tickets/TICKET-180-mcp-contract-parity.md`
- `.plans/.tickets/Core Runtime Capabilities-tickets/TICKET-200-mcp-handlers-use-orchestrator.md`
- `.plans/.tickets/Core Runtime Capabilities-tickets/TICKET-220-user-review-plugin-mcp-parity.md`

## Execution order
1. **Core contracts and shared request/output modeling**
   - Expand `packages/core/src/runtimeContracts.ts` with optional parity capability interfaces.
   - Add shared request / output contract files in core.
   - Export the new shared types from `packages/core/src/index.ts`.
   - Keep the degraded lexical runtime type-compatible.

2. **Shared orchestrator in core**
   - Create `packages/core/src/orchestrator.ts`.
   - Move route selection, retrieval fanout, rerank / dedupe / evidence shaping, corrective retry hooks, and output shaping into core.
   - Define adapter-facing and MCP-facing output modes around the shared contracts.

3. **LM Studio adapter migration**
   - Introduce an LM Studio-backed runtime surface that maps the adapter’s current parser, semantic retrieval, rerank, context sizing, citations, and safety behaviors onto the core capability interfaces.
   - Reduce `packages/adapter-lmstudio/src/promptPreprocessor.ts` to adapter glue over the shared orchestrator.

4. **MCP runtime split**
   - Add `packages/mcp-server/src/lmstudioRuntime.ts` for plugin-parity runtime services.
   - Keep `packages/mcp-server/src/defaultRuntime.ts` as the explicit degraded lexical fallback.

5. **MCP contract and tool surface parity**
   - Replace the narrow retrieval override schema with grouped parity option sets.
   - Add `rag_prepare_prompt` and its structured output.

6. **MCP handler refactor**
   - Refactor `packages/mcp-server/src/handlers.ts` to delegate to the shared orchestrator for `rag_answer`, `rag_search`, and `rag_prepare_prompt`.
   - Preserve `rerank_only` as a focused utility path.

7. **Validation and cleanup**
   - Typecheck all packages.
   - Run targeted MCP smoke tests.
   - Remove dead helper paths that become redundant after orchestration centralization.

## Current implementation focus
- [x] Step 1 landed: shared request / output contract files were added, runtime capability interfaces were expanded, and MCP was updated with an initial `rag_prepare_prompt` surface.
- [x] Step 2 landed: shared core orchestrator added in `packages/core/src/orchestrator.ts`.
- [x] Step 3 landed structurally: the LM Studio adapter retrieval path now delegates through the shared orchestrator.
- [x] Step 4 landed structurally: MCP now has both the degraded default runtime and an LM Studio-backed runtime entry.
- [x] Step 5 landed: MCP contract/tool surface widened with grouped options and `rag_prepare_prompt`.
- [x] Step 6 landed: MCP handlers delegate to the shared orchestrator.
- [x] Follow-on improvement started and landed: MCP runtimes now normalize user paths consistently, expand `~`, and recurse directories in both degraded and LM Studio-backed modes.
- [ ] Remaining proof work: validate the LM Studio-backed MCP runtime and adapter path against a live LM Studio session, since local CI here only proves static checks and non-LM-Studio smoke coverage.

## Non-goals for this pass
- Ticket 220 is a user-review gate and will remain for human validation after implementation work is complete.
