---
ticket_id: "tkt_ragcore_0260_tracing"
title: "Add-online-tracing-and-monitoring-for-rag-flows"
agent: "codex"
done: false
goal: "Online traces make it possible to inspect retrieval, ranking, context assembly, and answer grounding in production-like flows."
---

## Tasks
- Add tracing or monitoring that captures retrieval inputs, transformed queries, candidate sets, reranked results, and final context assembly.
- Record enough metadata to debug answer-grounding and retrieval-failure paths.
- Ensure traces cover both offline-evaluation runs and production-like executions where possible.
- Make trace data usable for diagnosing latency, retrieval-quality, and routing issues.

## Acceptance criteria
- Retrieval and generation steps are inspectable through traces rather than inferred from final answers alone.
- Trace records include the major retrieval pipeline stages needed to debug failures.
- Operational monitoring exists for production-like RAG behavior, not only offline experimentation.
- Traces can be used to distinguish ingestion, retrieval, ranking, routing, and prompting failures.

## Tests
- Execute a representative RAG flow and verify the trace captures query input, retrieval candidates, reranked results, and final context payload.
- Use a known failure case and verify the trace makes the failure surface visible.
- Review trace outputs and confirm they are sufficient to explain why a specific answer was or was not grounded.

## Notes
- Source: "online tracing/monitoring"; "online traces"; "teams ship without evals"; "separate retrieval metrics from generation metrics."
- Constraints: Do not limit observability to only final model output.
- Evidence: LangSmith; Phoenix; source file sections 2J and 5.
- Dependencies: TICKET-240-separate-retrieval-evals-from-generation-evals.md
- Unknowns: Trace sink; retention policy; required redaction behavior for sensitive trace data.
