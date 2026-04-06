---
ticket_id: "tkt_ragcore_0280_latency_cost"
title: "Bound-latency-and-cost-with-two-stage-retrieval-controls"
agent: "codex"
done: false
goal: "RAG quality improvements are kept within explicit latency and cost bounds using staged retrieval and smaller better-ranked context sets."
---

## Tasks
- Add or confirm a two-stage retrieval pattern that limits expensive processing to a smaller candidate set.
- Reduce context payload size by using better-ranked evidence instead of indiscriminately increasing retrieved text volume.
- Add measurements or checks for latency and cost impact across the main retrieval pipeline stages.
- Document acceptable latency/cost tradeoffs for hybrid retrieval, reranking, and context assembly.

## Acceptance criteria
- The retrieval pipeline has explicit controls that prevent quality work from scaling cost and latency without bounds.
- Expensive stages operate on narrowed candidate sets rather than the full initial retrieval output.
- Prompt/context size is intentionally constrained instead of growing as a substitute for quality.
- Latency and cost impacts are observable for the main retrieval stages.

## Tests
- Compare end-to-end runs before and after staged candidate narrowing and verify the expensive stage input set is smaller.
- Inspect final context payloads and confirm only a deliberate ranked subset is passed to generation.
- Record latency and cost measurements for representative flows and verify they can be attributed to specific retrieval stages.

## Notes
- Source: "Latency/cost blow up as quality improves"; "two-stage retrieval"; "smaller candidate sets after ranking"; "smaller better-ranked evidence sets"; "context compression."
- Constraints: Do not use larger prompts as the default fix for retrieval weakness.
- Evidence: OpenAI prompt caching and flex processing docs; Pinecone production checklist; Lost in the Middle; source file sections 2F, 2K, and 5.
- Dependencies: TICKET-160-rerank-initial-candidates-before-context-assembly.md; TICKET-260-add-online-tracing-and-monitoring-for-rag-flows.md
- Unknowns: Latency budget; cost budget; acceptable context-size limit per target model/runtime.
