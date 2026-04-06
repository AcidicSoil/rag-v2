---
ticket_id: "tkt_ragcore_0300_corpus_level"
title: "Add-a-corpus-level-retrieval-path-for-global-questions"
agent: "codex"
done: false
goal: "Corpus-level or global-sensemaking questions are served by a retrieval path designed for dataset-wide synthesis rather than naive top-k chunk lookup."
---

## Tasks
- Identify the query class that represents corpus-level or global-sensemaking requests.
- Add a retrieval path for those requests that does not rely only on standard top-k chunk retrieval.
- Preserve a distinct routing boundary between local passage lookup and corpus-level synthesis.
- Add validation cases for questions about major themes, global patterns, or dataset-wide summaries.

## Acceptance criteria
- The system can distinguish local passage retrieval from corpus-level retrieval use cases.
- Corpus-level questions are not forced through the same naive top-k chunk path used for local lookup.
- A graph-based, summary-based, or equivalently corpus-level retrieval path is available where required by the source use case.
- Validation exists for at least one global question that standard chunk retrieval handles poorly.

## Tests
- Run a corpus-level question and verify the request uses the corpus-level retrieval path rather than only top-k chunk lookup.
- Compare results for a global-sensemaking question using naive chunk retrieval versus the corpus-level path and verify the latter is better aligned with the question type.
- Confirm local fact lookup still uses the normal retrieval path.

## Notes
- Source: "Corpus-level questions do not fit naive top-k chunk retrieval"; "What are the major themes across the whole dataset?"; "GraphRAG or other summary/graph-based retrieval pipelines."
- Constraints: Keep local and global retrieval modes distinct.
- Evidence: Microsoft GraphRAG docs and paper; source file sections 1, 2G, and 4.
- Dependencies: TICKET-240-separate-retrieval-evals-from-generation-evals.md
- Unknowns: Whether GraphRAG is required versus another corpus-level approach; routing heuristic for global questions.
