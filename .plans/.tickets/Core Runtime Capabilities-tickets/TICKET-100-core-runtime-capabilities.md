---
ticket_id: "tkt_mcp_parity_core_runtime_capabilities"
title: "core-runtime-capabilities-are-explicitly-modeled"
agent: "codex"
done: false
goal: "Core runtime contracts expose the capability interfaces needed for MCP and the native plugin to share one RAG pipeline."
---

## Tasks
- Expand `packages/core/src/runtimeContracts.ts` to add optional capability interfaces for `documentParser`, `embeddingModelResolver`, `semanticRetriever`, `llmReranker`, `contextSizer`, `citationEmitter`, `answerComposer`, and `policyEngine`.
- Add request and output contract types in `packages/core/src/requestOptions.ts` and `packages/core/src/outputContracts.ts`, or fold them into the core contracts if that is the chosen implementation.
- Preserve compatibility for the current fallback runtime by keeping the new capabilities optional.

## Acceptance criteria
- Core runtime types can represent the richer services used by the native plugin without requiring every runtime to implement them.
- The request and output types needed for shared orchestration are defined in `packages/core`.
- The fallback lexical runtime remains type-compatible after the contract expansion.

## Tests
- Verify the core package type-checks after the runtime contract expansion.
- Confirm code that only uses the fallback lexical runtime does not require the new capabilities to be implemented.
- Review the resulting contracts to ensure each capability named in the source plan is represented exactly once.

## Notes
- Source: "Expand `packages/core/src/runtimeContracts.ts` so MCP can ask for the same services the plugin uses."
- Constraints:
  - Keep the new capabilities optional so the current lexical fallback runtime still works.
  - Do not expose plugin knobs without runtime support.
- Evidence:
  - `packages/core/src/runtimeContracts.ts`
  - `packages/core/src/requestOptions.ts`
  - `packages/core/src/outputContracts.ts`
- Dependencies: Not provided
- Unknowns:
  - Whether `requestOptions.ts` and `outputContracts.ts` should be separate files or folded into existing core files.
