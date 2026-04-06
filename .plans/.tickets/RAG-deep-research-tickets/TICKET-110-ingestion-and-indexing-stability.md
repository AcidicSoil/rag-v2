---
ticket_id: "tkt_d7bb59d697af294e"
title: "Implement-stable-ingestion-and-indexing"
agent: "codex"
done: false
goal: "The ingestion path creates stable, repeatable chunks and index records that support updates without drift or ghost chunks."
---

## Tasks
- Implement ingestion so documents are parsed and chunked into smaller spans with overlap instead of relying on coarse page-only units.
- Generate stable document IDs and stable chunk IDs using content identity, document versioning, and chunk offsets.
- Ensure updates and deletions reconcile deterministically so stale or duplicate chunks are not left behind.
- Reject or quarantine writes that violate the retrieval-core schema contract.

## Acceptance criteria
- Repeated ingestion of the same source content does not create duplicate live chunks.
- Document updates replace or retire superseded chunks without leaving ghost chunks in the index.
- Chunking behavior and write validation follow the contract established in TICKET-100.

## Tests
- Ingest a fixture document twice and verify chunk identities remain stable across runs.
- Modify a fixture document, re-run ingestion, and verify superseded chunks are no longer retrievable.
- Attempt a write with schema-mismatched metadata or embedding dimensions and verify it is rejected or quarantined.

## Notes
- Source: "PDF loaders that split per page are often too coarse", "stable document IDs", "stable chunk IDs", and "reject writes that violate the contract".
- Constraints: Chunk size and overlap values are not provided and must remain configurable.
- Evidence: Source report sections Indexing-and-Ingestion; Concrete-Code-Examples-and-Configs.
- Dependencies: TICKET-100-retrieval-core-contracts.md.
- Unknowns: Target file formats beyond the report examples are not provided.
