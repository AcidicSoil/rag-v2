# Handoff for Next Conversation — 2026-03-31 (model-assisted rerank implemented)

## Project
- Repo/project: `rag-v2` at `/home/user/projects/rag-v2`
- Purpose: LM Studio prompt-preprocessor plugin for document-based RAG
- Stack: TypeScript, LM Studio plugin SDK

## What was already in place before the latest slice
The repo already had:
- answerability gating
- live/manual test assets
- deterministic multi-query retrieval and fusion
- evidence packaging + dedupe
- retrieved-text safety hardening
- lightweight eval harness
- heuristic reranking
- lightweight hybrid semantic+lexical retrieval
- expanded README and implementation plan updates

Validation before the latest slice was already green:
- `npx -y -p typescript tsc --noEmit`
- smoke tests for multi-query, evidence, safety, rerank, hybrid
- `npm run eval` passing all current suites

## Newly implemented in the latest slice

### 1) Optional model-assisted rerank strategy
Added a second-stage rerank option aligned with current practice: keep fast retrieval + heuristic rerank, then optionally ask an LLM to rescore the narrowed top candidates.

Files changed:
- `src/types/rerank.ts`
- `src/config.ts`
- `src/promptPreprocessor.ts`
- `src/rerank.ts`
- `IMPLEMENTATION_PLAN.md`
- `package.json`

Files added:
- `src/modelRerank.ts`
- `scripts/smoke-model-rerank.ts`

### 2) Rerank strategy additions
`src/types/rerank.ts`
- added `heuristic-then-llm` to `rerankStrategies`
- added `ModelRerankScore`

### 3) New config fields
`src/config.ts`
- `rerankStrategy` now supports:
  - `heuristic-v1`
  - `heuristic-then-llm`
- added:
  - `modelRerankTopK`
  - `modelRerankModelId`

### 4) New model-rerank module
`src/modelRerank.ts`
Provides:
- `buildModelRerankPrompt(userQuery, entries)`
- `parseModelRerankResponse(response)`
- `applyModelRerankScores(heuristicEntries, modelScores, topK)`
- `performModelAssistedRerank(model, userQuery, heuristicEntries, topK, abortSignal)`

Behavior:
- narrows candidates heuristically first
- prompts an LLM to return JSON relevance scores
- blends heuristic and model scores (currently model-weighted)
- if model call or parsing fails, caller can fall back to heuristic-only reranking

### 5) Prompt-preprocessor integration
`src/promptPreprocessor.ts`
- imports `performModelAssistedRerank`
- reads `modelRerankTopK` and `modelRerankModelId`
- if `rerankEnabled` and `rerankStrategy === "heuristic-then-llm"`:
  - uses configured model ID if provided, else `ctl.client.llm.model()`
  - model-reranks only top `modelRerankTopK` heuristic candidates
  - logs parsed-score count / raw model response for debugging
  - falls back cleanly to heuristic reranking on any failure

### 6) Heuristic reranker compatibility
`src/rerank.ts`
- updated so `heuristic-then-llm` still uses heuristic reranking as the first stage rather than bypassing it

### 7) Deterministic smoke coverage
Added `scripts/smoke-model-rerank.ts`
- validates prompt construction
- validates JSON/fenced-JSON parsing
- validates score blending that elevates the correct evidence

Added npm script:
- `npm run smoke:model-rerank`

## Validation completed after latest slice
- `npx -y -p typescript tsc --noEmit` passed
- `npm run smoke:model-rerank` passed
- `npm run eval` passed
- eval status remained green at 13/13

## Additional relevant memories
- `maintenance/implementation-progress-2026-03-31`
- `maintenance/model-assisted-rerank-progress-2026-03-31`
- `handoff/next-conversation-2026-03-31-phase-next-step`

## Current status of the repo
The repo now includes:
- answerability gating
- multi-query retrieval
- fusion
- optional hybrid semantic+lexical retrieval
- heuristic reranking
- optional model-assisted rerank hook
- evidence dedupe/packaging
- safer retrieved-text injection
- smoke tests for major retrieval-quality slices
- multi-suite eval coverage
- updated README / plan docs

## Best next step for the next conversation
The strongest next step is a focused LM Studio live validation pass of the newest retrieval-quality path, especially the model-assisted rerank option.

Recommended config for the next pass:
- `multiQueryEnabled = true`
- `hybridEnabled = true` for quoted-span / exact-term cases
- `rerankEnabled = true`
- `rerankStrategy = heuristic-then-llm`
- `modelRerankTopK = 3`
- `sanitizeRetrievedText = true`
- `stripInstructionalSpans = true`
- `strictGroundingMode = require-evidence`

Use:
- `LIVE_TEST_SCRIPT.md`
- `manual-tests/README.md`
- `manual-tests/fixtures/`

## What to do after the live pass
Depending on runtime behavior:
1. tune the defaults for:
   - `modelRerankTopK`
   - score blending in `src/modelRerank.ts`
   - fallback behavior and prompt wording
2. decide whether to keep the generic LLM-assisted hook as the experimental model-rerank path or introduce a more dedicated rerank-model integration later
3. add eval cases reflecting any runtime failures or latency-driven decisions

## Important caveat
This latest slice is **not** a dedicated cross-encoder reranker. It is an optional LLM-assisted rerank hook suitable for local LM Studio experimentation. The fast/default production-like path remains heuristic reranking unless configured otherwise.
