---
ticket_id: "tkt_e24cb3a8eaf17ba9"
title: "Add-caching-and-cost-controls-to-the-retrieval-core"
agent: "codex"
done: false
goal: "The retrieval core can control cost and latency through bounded retrieval, caching, and graceful degradation."
---

## Tasks
- Add cost controls for maximum retrieved results and context tokens on the grounded path.
- Add caching for repeated queries or stable retrieval sub-queries where appropriate.
- Enforce timeouts or equivalent limits for expensive retrieval, reranking, or evaluation paths.
- Define a degraded response mode that can fall back to search-only behavior when generation is not required or is too costly.

## Acceptance criteria
- The system enforces retrieval or context-size bounds instead of allowing unbounded token growth.
- Repeated or stable queries can benefit from caching.
- Expensive paths fail within bounded limits and can degrade gracefully when configured to do so.

## Tests
- Run the same stable query set twice and verify caching is exercised on the second pass where enabled.
- Submit a request designed to exceed normal context or result limits and verify the caps are enforced.
- Force a timeout or expensive-path guardrail and verify the configured degraded behavior is returned instead of an uncontrolled failure.

## Notes
- Source: "caching strategy", "cap max_num_results / context tokens", "enforce timeouts", and "degrade gracefully to search-only responses".
- Constraints: Cache invalidation policy and timeout values are not provided.
- Evidence: Source report sections Latency-Scalability-and-Cost; Cost-Estimation-Factors-and-Optimization; Production-Readiness-Prioritized-Checklist.
- Dependencies: TICKET-120-hybrid-retrieval-and-reranking.md; TICKET-170-rag-observability.md.
- Unknowns: Whether generationless fallback is acceptable on all product surfaces is not provided.
