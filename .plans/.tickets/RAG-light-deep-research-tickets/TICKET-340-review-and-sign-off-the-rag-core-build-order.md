---
ticket_id: "tkt_ragcore_0340_user_review"
title: "Review-and-sign-off-the-rag-core-build-order"
agent: "user"
done: false
goal: "A human reviewer confirms that the implemented RAG core matches the source priorities, optional advanced paths, and supported interaction surfaces."
---

## Tasks
- Review the implemented core build order against the source priorities: parser quality, hybrid retrieval, reranking, metadata filters or ACL, eval dataset, and online traces.
- Confirm whether advanced paths for corpus-level retrieval, query transformation, freshness routing, and corrective retrieval are required for the target product surfaces.
- Validate that app, client, MCP, and plugin surfaces are covered appropriately or explicitly deferred.
- Record sign-off or required follow-up tickets based on gaps found during review.

## Acceptance criteria
- A reviewer has checked the delivered work against the source priorities and noted any gaps.
- Optional or advanced retrieval paths are explicitly accepted, deferred, or rejected.
- Surface-specific coverage decisions for app, client, MCP, and plugin use are recorded.
- Any uncovered source items are turned into follow-up work rather than being silently dropped.

## Tests
- Review the implemented tickets and verify each source action area is either complete or explicitly deferred.
- Confirm the final review record includes decisions on core versus advanced retrieval features.
- Verify no source action area remains unaccounted for after review.

## Notes
- Source: "My opinionated build order"; "If I were building a serious RAG tool today, I would start with parser quality, hybrid retrieval, reranking, metadata filters / ACL, eval dataset, online traces, and only then more advanced tricks like GraphRAG, HyDE, or corrective/self-reflective routing."
- Constraints: Do not approve work based only on a chat summary; review against delivered artifacts and source coverage.
- Evidence: Source file sections 3, 4, and 5.
- Dependencies: TICKET-100-preserve-structured-ingestion-and-citation-anchors.md; TICKET-120-tune-chunking-and-structured-retrieval.md; TICKET-140-add-hybrid-retrieval-with-lexical-and-dense-fusion.md; TICKET-160-rerank-initial-candidates-before-context-assembly.md; TICKET-180-add-query-transforms-for-underspecified-requests.md; TICKET-200-route-freshness-sensitive-questions-to-updated-sources.md; TICKET-220-enforce-metadata-filters-and-access-boundaries.md; TICKET-240-separate-retrieval-evals-from-generation-evals.md; TICKET-260-add-online-tracing-and-monitoring-for-rag-flows.md; TICKET-280-bound-latency-and-cost-with-two-stage-retrieval-controls.md; TICKET-300-add-a-corpus-level-retrieval-path-for-global-questions.md; TICKET-320-add-retrieval-quality-checks-and-corrective-routing.md
- Unknowns: Review approver; acceptance evidence format; rollout criteria.
