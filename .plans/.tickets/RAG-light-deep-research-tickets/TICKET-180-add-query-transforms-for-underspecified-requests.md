---
ticket_id: "tkt_ragcore_0180_query_transform"
title: "Add-query-transforms-for-underspecified-requests"
agent: "codex"
done: false
goal: "Underspecified or poorly phrased user requests are transformed into retrieval-effective queries before search runs."
---

## Tasks
- Add query rewriting for vague, compressed, or conversational user inputs that are poor retrieval queries.
- Support multi-step retrieval behaviors such as decomposition or transformation when a single raw query is insufficient.
- Add evaluation cases that specifically target weak-query failure modes.
- Preserve the original user request alongside transformed retrieval queries for traceability.

## Acceptance criteria
- The system can apply a query transformation path before retrieval when the raw input is a weak retrieval query.
- Retrieval improvements for underspecified requests can be measured separately from ranking and generation changes.
- Query transformation behavior is traceable back to the original user request.
- Multi-step retrieval is available for queries that cannot be served well by a single retrieval string.

## Tests
- Run retrieval checks on conversational or underspecified queries with and without rewriting and compare candidate quality.
- Validate that transformed queries remain linked to the original request in logs or traces.
- Use a decomposition-style request and verify the retrieval flow executes as multiple retrieval-effective steps when needed.

## Notes
- Source: "User query phrasing is the bottleneck"; "query transforms, multi-step retrieval, rewriting, HyDE, decomposition"; "Rewrite-Retrieve-Read."
- Constraints: Do not replace the original user request with an untraceable transformed query.
- Evidence: Rewrite-Retrieve-Read paper; HyDE paper; LlamaIndex query transformations; source file sections 1, 2E, and 4.
- Dependencies: TICKET-140-add-hybrid-retrieval-with-lexical-and-dense-fusion.md; TICKET-160-rerank-initial-candidates-before-context-assembly.md
- Unknowns: When to trigger query transformation; whether HyDE is required or optional for the target corpus.
