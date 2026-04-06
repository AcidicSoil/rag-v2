---
ticket_id: "tkt_ee89c62fbdebb94f"
title: "Implement-hybrid-retrieval-and-reranking"
agent: "codex"
done: false
goal: "The retrieval core can retrieve broadly, refine results, and assemble a higher-precision evidence set for generation."
---

## Tasks
- Implement broad retrieval that supports sparse and dense retrieval together, with fused ranking.
- Add a second-stage reranking step so a broader candidate set is narrowed before generation.
- Add diversity-aware or deduping context selection so redundant chunks do not dominate the final evidence set.
- Build a context assembly step that produces a trimmed evidence bundle for generation.

## Acceptance criteria
- Queries can execute with hybrid retrieval instead of dense-only retrieval.
- A reranking step reduces the candidate set before generation.
- The final assembled context contains fewer redundant chunks than the initial broad retrieval set.

## Tests
- Run a benchmark query set and verify the system returns a broad candidate pool before reranking.
- Inspect a sampled query and verify the reranked context is smaller and less redundant than the initial retrieval set.
- For identifier-heavy or jargon-heavy queries, compare dense-only vs hybrid retrieval and verify the hybrid path is available for evaluation.

## Notes
- Source: "Hybrid retrieval", "RRF", "Two-stage retrieval + reranking", and "MMR".
- Constraints: The source does not require a specific reranker, vector database, or orchestration framework.
- Evidence: Source report sections Retrieval-Quality-and-Reranking; Hybrid-Search-and-Rerank.
- Dependencies: TICKET-100-retrieval-core-contracts.md; TICKET-110-ingestion-and-indexing-stability.md.
- Unknowns: Fusion formula details and final top-k thresholds are not provided.
