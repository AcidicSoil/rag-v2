---
ticket_id: "tkt_mcp_parity_shared_orchestrator"
title: "shared-rag-orchestration-lives-in-core"
agent: "codex"
done: false
goal: "A single core orchestrator owns the real RAG flow so the native plugin and MCP no longer diverge."
---

## Tasks
- Create `packages/core/src/orchestrator.ts` to own answerability gating, route selection, deterministic multi-query rewrite, semantic retrieval fanout, optional hybrid lexical merge, corrective retry, reranking, dedupe, sanitization, grounding packaging, and output shaping.
- Support the output modes named in the source plan: `prepared-prompt`, `search-results`, and `answer-envelope`.
- Update `packages/adapter-lmstudio/src/promptPreprocessor.ts` so the native plugin becomes thin adapter glue over the shared orchestrator instead of owning the pipeline directly.

## Acceptance criteria
- The core orchestrator can run the end-to-end flow described in the source plan using the capability interfaces provided by the runtime.
- The LM Studio adapter no longer owns a separate orchestration path for the same RAG behavior.
- Output modes from the source plan are produced by the shared path instead of duplicated logic.

## Tests
- Verify the native plugin path invokes the shared orchestrator rather than a duplicate pipeline.
- Confirm each route named in the source plan is handled by the orchestrator: `no-retrieval`, `full-context`, `retrieval`, and `corrective`.
- Inspect the adapter changes to ensure `promptPreprocessor.ts` is reduced to adapter glue.

## Notes
- Source: "Do not patch this piecemeal. The right move is to pull the orchestration out of the LM Studio adapter and make it shared core."
- Constraints:
  - Do not duplicate the plugin pipeline inside MCP.
  - Do not keep stub answer composition as the main path.
- Evidence:
  - `packages/core/src/orchestrator.ts`
  - `packages/adapter-lmstudio/src/promptPreprocessor.ts`
- Dependencies:
  - `TICKET-100-core-runtime-capabilities.md`
- Unknowns:
  - The exact internal decomposition of orchestration helpers beyond the behaviors listed in the source plan.
