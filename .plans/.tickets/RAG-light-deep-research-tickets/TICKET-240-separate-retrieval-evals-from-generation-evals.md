---
ticket_id: "tkt_ragcore_0240_eval"
title: "Separate-retrieval-evals-from-generation-evals"
agent: "codex"
done: false
goal: "The system is evaluated with explicit retrieval metrics and generation metrics so quality can be improved without relying on anecdotal good answers."
---

## Tasks
- Create an evaluation dataset for representative retrieval and answer-generation cases.
- Define retrieval-specific metrics separately from generation-specific metrics.
- Add offline evaluation runs that can compare retrieval changes without conflating them with model output changes.
- Include failure cases for ingestion, chunking, exact-match lookup, ranking, weak queries, and freshness-sensitive queries.

## Acceptance criteria
- Retrieval quality and generation quality are measured separately.
- A reusable evaluation set exists for core RAG behaviors and known failure modes.
- Retrieval changes can be compared offline before deployment decisions are made.
- The evaluation set includes more than a handful of manually inspected happy-path examples.

## Tests
- Run the offline evaluation set against the current retrieval pipeline and record retrieval and generation results separately.
- Introduce a retrieval configuration change and verify the evaluation output can isolate whether the change helped retrieval, generation, or neither.
- Confirm that known failure-mode cases are included and do not rely solely on ad hoc manual inspection.

## Notes
- Source: "Teams ship without evals"; "separate retrieval metrics from generation metrics"; "offline datasets"; "BEIR"; "Ragas"; "ARES."
- Constraints: Do not treat a few manually inspected answers as sufficient validation.
- Evidence: LangSmith RAG eval; Phoenix evals; Ragas; ARES; BEIR; source file sections 1, 2J, and 5.
- Dependencies: TICKET-100-preserve-structured-ingestion-and-citation-anchors.md; TICKET-120-tune-chunking-and-structured-retrieval.md; TICKET-140-add-hybrid-retrieval-with-lexical-and-dense-fusion.md; TICKET-160-rerank-initial-candidates-before-context-assembly.md; TICKET-180-add-query-transforms-for-underspecified-requests.md; TICKET-200-route-freshness-sensitive-questions-to-updated-sources.md; TICKET-220-enforce-metadata-filters-and-access-boundaries.md
- Unknowns: Metric definitions; evaluation corpus size; pass/fail thresholds.
