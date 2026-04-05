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
- [x] Step 1 started and landed: shared request / output contract files were added, runtime capability interfaces were expanded, and MCP was updated with an initial `rag_prepare_prompt` surface to keep the widened contracts live.
- [ ] Next: implement the shared core orchestrator so both the LM Studio adapter and MCP can consume one orchestration path.
- [ ] After the orchestrator lands, migrate the LM Studio adapter and MCP handlers/runtimes onto it and then widen the grouped MCP option surface to match real runtime support.

## Non-goals for this pass
- Ticket 220 is a user-review gate and will remain for human validation after implementation work is complete.
