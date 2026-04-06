---
ticket_id: "tkt_f4d40f53a9dde921"
title: "Add-embedding-versioning-and-dual-index-migration"
agent: "codex"
done: false
goal: "Embedding changes and preprocessing drift can be introduced safely through versioned indices, monitored drift, and staged cutovers."
---

## Tasks
- Version embedding models and index contracts so index contents can be tied to one embedding model and dimension set.
- Add drift monitoring for embedding distribution shift, retrieval overlap, or equivalent online relevance indicators.
- Implement a dual-index migration flow that supports shadow queries and cutover for embedding-model changes.
- Prevent partial or mixed-model re-embedding from silently mutating an existing index.

## Acceptance criteria
- Index metadata clearly identifies the embedding model and dimension contract in use.
- Embedding changes can be evaluated on a shadow index before cutover.
- The system can detect or flag drift instead of allowing silent retrieval-quality degradation.

## Tests
- Build a second index with a different embedding configuration and verify shadow queries can compare overlap or downstream evaluation results.
- Attempt to mix embeddings with incompatible model or dimension contracts in one live index and verify it is blocked.
- Review drift telemetry and verify it surfaces changes in retrieval overlap or embedding behavior.

## Notes
- Source: "bind a vector index to a single embedding model/dimension", "dual-index migrations", and "drift monitors".
- Constraints: Exact monitoring thresholds and migration cutover policy are not provided.
- Evidence: Source report sections Embeddings-Drift-and-Index-Consistency; Production-Readiness-Prioritized-Checklist; Troubleshooting-Checklist-and-Runbook.
- Dependencies: TICKET-100-retrieval-core-contracts.md; TICKET-160-rag-evaluation-and-regression-gates.md; TICKET-170-rag-observability.md.
- Unknowns: Embedding provider selection and migration cadence are not provided.
