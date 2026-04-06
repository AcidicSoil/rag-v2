---
ticket_id: "tkt_ragcore_0200_freshness"
title: "Route-freshness-sensitive-questions-to-updated-sources"
agent: "codex"
done: false
goal: "Freshness-sensitive questions do not rely on stale vector-store content when the answer depends on current state."
---

## Tasks
- Build or configure an explicit update pipeline for the retrieval datastore.
- Add asynchronous ingestion or refresh handling for newly changed content.
- Detect or route freshness-sensitive requests to live tools or search instead of relying only on static retrieval.
- Record retrieval-store update state so stale answers can be distinguished from current-source answers.

## Acceptance criteria
- The retrieval system has a defined update path rather than assuming static embeddings stay correct.
- Newly changed content can be ingested without manual full rebuild assumptions.
- Questions that depend on current state can be routed away from stale-only retrieval.
- The system can distinguish stored retrieval answers from live-source answers.

## Tests
- Update a source document, ingest the change, and verify the refreshed content becomes retrievable.
- Use a freshness-dependent query and verify the system routes to a live source or clearly indicates the retrieval basis.
- Remove or replace a source and verify retrieval behavior reflects the updated datastore state.

## Notes
- Source: "Freshness and live knowledge drift"; "static vector stores go stale"; "explicit update pipelines"; "routing to live tools/search when the answer depends on current state."
- Constraints: Do not assume retrieval-store contents are current by default.
- Evidence: OpenAI vector stores/file search/retrieval docs; source file sections 2H and 3.
- Dependencies: TICKET-100-preserve-structured-ingestion-and-citation-anchors.md
- Unknowns: Update cadence; live-tool inventory; consistency guarantees after document removal or replacement.
