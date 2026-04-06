---
ticket_id: "tkt_ragcore_0120_chunking"
title: "Tune-chunking-and-structured-retrieval"
agent: "codex"
done: false
goal: "Retrieval chunks preserve meaning while remaining rankable, with hierarchical or recursive retrieval used where document structure requires it."
---

## Tasks
- Define chunk size and overlap settings based on corpus shape and expected query patterns.
- Add or configure hierarchical or recursive retrieval for documents with strong parent/child structure.
- Ensure chunk boundaries preserve semantic units rather than cutting across critical context.
- Add validation cases that expose regressions caused by chunks that are too small or too large.

## Acceptance criteria
- Chunking strategy is explicitly defined rather than left implicit in defaults.
- Documents with strong structural hierarchy can be retrieved through a parent/child or recursive path.
- Retrieval quality checks exist for both narrow fact lookup and broader contextual lookup.
- Chunking changes can be evaluated against known examples before rollout.

## Tests
- Run retrieval checks against the same source documents with at least two chunking configurations and compare precision/coverage outcomes.
- Query a structured document and verify the system can return the relevant child content with enough surrounding parent context.
- Validate that known answer-bearing passages are not split into unusable fragments.

## Notes
- Source: "Chunking is usually the first silent regression"; "tune chunk size/overlap by corpus and query shape"; "use hierarchical or recursive retrieval."
- Constraints: Do not hard-code chunk settings as universally correct; tune by corpus and query shape.
- Evidence: LlamaIndex chunking/basic strategies; recursive retriever; structured retrieval docs; source file section 2B.
- Dependencies: TICKET-100-preserve-structured-ingestion-and-citation-anchors.md
- Unknowns: Target corpus types; expected query distribution; acceptable chunk-count and context-size limits.
