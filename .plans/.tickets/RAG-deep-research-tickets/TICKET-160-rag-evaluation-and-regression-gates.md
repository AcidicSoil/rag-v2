---
ticket_id: "tkt_1aadb8e228bad3d9"
title: "Add-retrieval-and-grounding-evaluation-gates"
agent: "codex"
done: false
goal: "The retrieval core can be evaluated offline with retrieval and groundedness metrics, and regressions can be caught before release."
---

## Tasks
- Create a golden evaluation dataset covering retrieval and grounded-answer cases.
- Measure retrieval quality separately from generation quality using offline evaluation.
- Add groundedness or faithfulness evaluation gates for high-stakes response surfaces.
- Wire regression checks into CI or an equivalent pre-release evaluation workflow.

## Acceptance criteria
- A repeatable offline evaluation dataset exists for the retrieval core.
- Retrieval metrics and groundedness metrics can be reported separately.
- Releases can be blocked or flagged when evaluation results regress beyond the chosen thresholds.

## Tests
- Run the evaluation suite against a frozen index and verify retrieval and generation metrics are reported independently.
- Introduce a known regression in retrieval relevance or groundedness and verify the regression gate detects it.
- Verify high-stakes response paths are covered by faithfulness or groundedness checks.

## Notes
- Source: "Golden evaluation datasets + CI regression tests", "retrieval quality from generation quality", and faithfulness/groundedness guidance.
- Constraints: Exact metric thresholds and benchmark composition are not provided.
- Evidence: Source report sections Metrics-For-Retrieval-and-Generation; Human-Evals-and-LLM-as-Judge; Production-Readiness-Prioritized-Checklist.
- Dependencies: TICKET-120-hybrid-retrieval-and-reranking.md; TICKET-130-query-transforms-and-grounding-contract.md.
- Unknowns: Whether LLM-as-judge evaluation is acceptable for the target cost envelope is not provided.
