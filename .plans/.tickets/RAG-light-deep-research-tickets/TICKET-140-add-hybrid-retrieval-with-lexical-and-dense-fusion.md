---
ticket_id: "tkt_ragcore_0140_hybrid"
title: "Add-hybrid-retrieval-with-lexical-and-dense-fusion"
agent: "codex"
done: false
goal: "Retrieval combines lexical and dense search so exact-match constraints and semantic similarity are both covered."
---

## Tasks
- Implement or configure hybrid retrieval that combines lexical and dense retrieval signals.
- Add a rank-fusion strategy such as reciprocal rank fusion for the initial hybrid path.
- Ensure exact-match identifiers such as product names, IDs, versions, and error codes are handled by the retrieval pipeline.
- Add configuration and evaluation coverage for hybrid weighting or fusion behavior.

## Acceptance criteria
- Retrieval no longer depends on dense-only search.
- Exact-match queries and semantically phrased queries both return relevant candidates.
- Hybrid behavior is tunable and documented within the system configuration or retrieval module.
- Initial retrieval candidates reflect both lexical and dense evidence sources.

## Tests
- Query for short exact strings such as IDs, versions, or error codes and verify they are retrieved reliably.
- Query for semantically equivalent phrasing and verify relevant candidates still appear in the initial result set.
- Compare dense-only versus hybrid retrieval on a fixed validation set and confirm the hybrid path addresses exact-match misses.

## Notes
- Source: "Dense-only retrieval misses exact-match constraints"; "hybrid retrieval with lexical + dense fusion, ideally RRF first."
- Constraints: Do not remove semantic retrieval coverage while adding lexical matching.
- Evidence: BEIR takeaway that BM25 remains a strong baseline; Elastic hybrid search + RRF docs; OpenAI retrieval controls; source file sections 1, 2C, and 5.
- Dependencies: TICKET-100-preserve-structured-ingestion-and-citation-anchors.md; TICKET-120-tune-chunking-and-structured-retrieval.md
- Unknowns: Retrieval backend choice; exact fusion settings; corpus-specific hybrid weighting.
