Session follow-up summary after the initial structured JSONL/chat retrieval slice and early overview-summary work.

Primary objective completed in this follow-up:
- extended structured-corpus support from exact JSONL retrieval into query-aware large-corpus overview selection and synthesized structured overview results.

High-level progression in this follow-up:
1. Hardened structured retrieval metadata survival across fusion/dedupe paths.
2. Added explicit field:value structured query parsing.
3. Added sampled structured summary docs for topic/time/entity overview.
4. Made global-summary routes query-aware when selecting summary docs.
5. Added lightweight overview query decomposition (topic/time/entity hints, including month-name normalization).
6. Added cross-summary synthesis so overview routes can emit a combined structured overview result.

Key implementation details:

A) Structured retrieval metadata normalization
- Updated `packages/core/src/retrievalPipeline.ts` to merge duplicate candidate metadata instead of dropping it during:
  - `fuseRagCandidates`
  - hybrid merge
  - dedupe
- Preserved / unioned structured metadata fields such as:
  - `structuredQueryMatches`
  - `structuredFields`
  - `structuredRecord`
  - `parentSummary`
- Updated local preferred/fallback candidate merge in `packages/core/src/localRetrieval.ts` so duplicate structured chunks preserve structured-query match metadata.

B) Explicit field-aware structured query parsing
- Extended `packages/core/src/localRetrieval.ts` to parse explicit structured query forms such as:
  - `field:value`
  - `field="value"`
  - `field='value'`
- Supported aliases for:
  - conversation/session ids
  - message/id
  - timestamp/date
  - role
  - topic
  - user id
- Reduced ambiguous bare `id` capture by separating message-id and plain-id handling.
- Structured-query-first retrieval now works more reliably for exact JSONL/chat targeting.

C) Sampled structured overview summary documents
- Extended `packages/core/src/largeCorpus.ts` to build additional summary docs for sampled JSONL corpora:
  - `structured-topic-summary:*`
  - `structured-time-summary:*`
  - `structured-entity-summary:*`
- These are derived from sampled synopsis windows, not full-corpus aggregation, keeping them lightweight and persistable.
- Added parsing support for normalized synopsis sample windows so sampled JSON objects can still be recovered even after whitespace normalization.

D) Query-aware summary selection for overview routes
- Updated `packages/core/src/orchestrator.ts` so `sample` / `global-summary` no longer treat all summary docs equally.
- Added intent-aware and lexical-aware selection that prioritizes relevant summary families for overview queries, including:
  - topic-focused queries -> `structured-topic-summary`
  - time-focused queries -> `structured-time-summary`
  - entity-focused queries -> `structured-entity-summary`
  - broad inventory/overview queries -> `structured-file-summary` plus synopsis/manifests
- `global-summary` search-results mode now returns ranked summary candidates and evidence instead of an empty candidate list.

E) Lightweight overview query decomposition
- Added lightweight hint extraction in `packages/core/src/orchestrator.ts` for overview queries:
  - topic terms
  - entity terms
  - time terms
- Included month-name normalization (for example `February` -> `-02`) so overview queries can better match sampled time summaries that store `YYYY-MM` / `YYYY-MM-DD` style buckets.
- This improves selection for questions like:
  - "What topics dominate in February?"
  - "Which users appear in billing threads?"

F) Cross-summary synthesized overview output
- Added cross-summary synthesis in `packages/core/src/orchestrator.ts` so overview routes can combine selected summary families into a synthesized structured overview artifact.
- Synthesized overview currently merges strongest available sections from:
  - file/overview summary
  - topic summary
  - time summary
  - entity summary
- This synthesized overview is now used in:
  - prepared-prompt context
  - search-results candidates
  - answer-envelope output
- Diagnostics now note when a synthesized structured overview has been built.

Most important files changed in this follow-up:
- `packages/core/src/localRetrieval.ts`
- `packages/core/src/retrievalPipeline.ts`
- `packages/core/src/largeCorpus.ts`
- `packages/core/src/orchestrator.ts`
- `scripts/smoke-large-corpus-routing.ts`

Behavioral outcome after this follow-up:
- exact structured JSONL queries are less brittle
- explicit field-targeted structured retrieval works
- structured-query metadata survives fusion and dedupe better
- sampled structured summaries now exist for topic/time/entity overview
- overview/global-summary selection prefers relevant summary families
- overview queries can use lightweight decomposition hints (including month-name -> time-bucket matching)
- overview search-results and answer mode can surface a synthesized combined structured overview instead of only isolated summary docs

Validation completed successfully during this follow-up:
- `npm run typecheck:core`
- `npm run typecheck:adapter`
- `npm run typecheck:mcp`
- `npm run smoke:large-corpus`

Recommended next step for the next conversation:
- make synthesized overview section assembly query-aware at the section level so mixed questions like:
  - "Which users appear in billing threads in February?"
  can downweight irrelevant sections and produce a tighter combined structured overview.
- A likely implementation direction is:
  1. score synthesized sections against extracted topic/time/entity hints
  2. omit low-relevance sections from the synthesized overview
  3. optionally expose section provenance in synthesized metadata for stronger explainability.
