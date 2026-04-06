# Structured JSONL / Chat Ingestion Task List

## Scope reviewed
- `.plans/LARGE_SCALE_RAG_INGESTION_RESEARCH_PLAN.md`
- `.plans/PERSISTENT_HIERARCHICAL_INDEX_TASK_LIST.md`
- `packages/mcp-server/src/defaultRuntime.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`
- `packages/core/src/localRetrieval.ts`
- `packages/core/src/largeCorpus.ts`
- current large-corpus smoke coverage

## Problem statement
JSONL/chat exports are currently ingested as plain text documents. That loses:
- record boundaries
- stable field cues like conversation/session id, timestamp, role, topic
- schema-level understanding for overview questions
- exact-match retrieval benefits for structured fields

A full structured index/filter engine is a later stage. The best immediate slice is to make ingestion and chunking **record-aware** for JSONL/chat datasets while preserving current orchestrator/retrieval architecture.

## Execution order
1. Add lightweight structured metadata extraction for JSONL/chat-like documents.
2. Annotate path-loaded documents with extension/format metadata so the core can recognize structured files.
3. Teach local retrieval chunking to emit record-aware chunks for JSONL documents instead of generic text windows.
4. Extend large-corpus summary synthesis with schema/field hints for structured JSONL corpora.
5. Add smoke coverage proving exact-field/record retrieval and structured overview behavior.

## Current implementation focus
- [ ] Step 1: structured metadata extraction helpers.
- [ ] Step 2: annotate loaders with format metadata.
- [ ] Step 3: record-aware JSONL chunking.
- [ ] Step 4: structured summary hints.
- [ ] Step 5: validation.

## Success criteria
- JSONL/chat corpora retrieve by record-level content more precisely than plain-text chunking.
- Overview routes expose schema/field hints for structured exports.
- Existing non-JSONL retrieval behavior remains unchanged.
