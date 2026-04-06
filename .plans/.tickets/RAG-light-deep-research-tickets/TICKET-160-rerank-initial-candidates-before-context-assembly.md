---
ticket_id: "tkt_ragcore_0160_rerank"
title: "Rerank-initial-candidates-before-context-assembly"
agent: "codex"
done: false
goal: "Relevant evidence is promoted near the top of the candidate set before prompt assembly so useful material is not buried in initial retrieval."
---

## Tasks
- Add a reranking stage after initial retrieval and before prompt/context assembly.
- Limit prompt assembly to the best-ranked evidence rather than passing through the full initial candidate set.
- Add validation cases where initial recall is acceptable but rank order is poor.
- Document the reranking stage as a required retrieval step rather than an optional afterthought.

## Acceptance criteria
- The retrieval pipeline contains an explicit reranking stage.
- Prompt assembly consumes reranked evidence rather than raw first-pass results.
- Known cases where useful evidence is present but poorly ordered are improved by the reranking stage.
- The number of retrieved items passed to generation is reduced to a deliberate, ranked set.

## Tests
- Use a validation query where the correct evidence appears in initial retrieval but not near the top; verify reranking improves its position.
- Compare answer grounding using raw retrieval versus reranked retrieval and confirm the reranked path uses better-supported evidence.
- Inspect final prompt/context payloads and verify they are built from reranked results.

## Notes
- Source: "Initial recall is okay, ranking is bad"; "rerank after retrieval"; "one of the simplest high-return upgrades in production."
- Constraints: Keep reranking as a post-retrieval stage; do not treat larger top-k as a substitute.
- Evidence: Pinecone rerank guide; Cohere and Voyage reranker docs; source file sections 2D and 5.
- Dependencies: TICKET-140-add-hybrid-retrieval-with-lexical-and-dense-fusion.md
- Unknowns: Reranker model/provider; candidate-set size before and after reranking; latency budget for reranking.
