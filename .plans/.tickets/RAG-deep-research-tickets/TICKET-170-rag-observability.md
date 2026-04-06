---
ticket_id: "tkt_4f0b3be2b1a8987a"
title: "Instrument-the-retrieval-core-for-observability"
agent: "codex"
done: false
goal: "The retrieval core emits traces and diagnostics across ingestion, retrieval, reranking, and generation so regressions can be debugged."
---

## Tasks
- Instrument ingestion, retrieval, reranking, and generation with end-to-end tracing.
- Capture request diagnostics needed by the runbook, including retrieved document IDs, scores, context length, and tool calls where applicable.
- Expose latency, cost, and quality-oriented telemetry suitable for online monitoring dashboards.

## Acceptance criteria
- End-to-end traces are available across the retrieval lifecycle.
- A failing request can be inspected with retrieved IDs, scores, and final context characteristics.
- Operational dashboards or equivalent telemetry views exist for latency, cost, and quality signals.

## Tests
- Execute a sampled request and verify the trace spans ingestion or lookup, retrieval, reranking, and generation where applicable.
- Inspect trace data for a request and verify retrieved IDs, scores, and final context length are captured.
- Verify telemetry can distinguish latency or cost changes from retrieval-quality regressions.

## Notes
- Source: "Observability instrumentation across ingestion, retrieval, reranking, generation" and runbook Step 1 logging guidance.
- Constraints: Specific tracing backend is not mandated by the source.
- Evidence: Source report sections Observability-Standards-and-Tools; Troubleshooting-Checklist-and-Runbook; Production-Readiness-Prioritized-Checklist.
- Dependencies: TICKET-120-hybrid-retrieval-and-reranking.md; TICKET-130-query-transforms-and-grounding-contract.md.
- Unknowns: Final dashboard tooling and alert thresholds are not provided.
