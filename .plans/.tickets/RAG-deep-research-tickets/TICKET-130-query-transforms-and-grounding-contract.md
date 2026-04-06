---
ticket_id: "tkt_cc4d3bf55fcfdd95"
title: "Implement-query-transforms-and-grounded-generation"
agent: "codex"
done: false
goal: "The system can improve weak queries before retrieval and constrain answers to supported evidence at generation time."
---

## Tasks
- Add query-improvement support for weak or ambiguous retrieval inputs using rewrite, decomposition, or HyDE-style transformation as supported by the chosen stack.
- Separate instructions from evidence in the generation prompt or equivalent request structure.
- Require the answering path to say it does not know when the answer is not in the retrieved sources.
- Require citations or equivalent source attribution in the grounded response path.

## Acceptance criteria
- Weak queries can be transformed before retrieval through a supported query-improvement path.
- Grounded responses do not present unsupported claims as sourced answers.
- Responses on the grounded path either cite retrieved evidence or explicitly state that the answer is not in the sources.

## Tests
- Run poorly formed or conversationally elliptical queries and verify a query-improvement step executes before retrieval.
- Run a query whose answer is absent from the corpus and verify the response states that the answer is not in the sources.
- Inspect a grounded response and verify each supported claim is attributed to retrieved evidence.

## Notes
- Source: "Rewrite‑Retrieve‑Read", "HyDE", "Separate instructions from evidence", and "If the answer is not in the sources, say you don’t know".
- Constraints: The source does not require all query-transformation variants to ship simultaneously.
- Evidence: Source report sections Retrieval-Quality-and-Reranking; Context-Window-Limits-and-Prompt-Engineering; Production-Readiness-Prioritized-Checklist.
- Dependencies: TICKET-120-hybrid-retrieval-and-reranking.md.
- Unknowns: Exact citation format and UI surface are not provided.
