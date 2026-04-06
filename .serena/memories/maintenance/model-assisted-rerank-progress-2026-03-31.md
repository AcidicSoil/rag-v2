# Model-Assisted Rerank Progress — 2026-03-31

## Context
Continued the `rag-v2` implementation after hybrid retrieval and heuristic reranking were already in place. The user asked to create a task list from the implementation plan, research the direction, start implementing, then summarize changes and write memory.

## Research conclusion used for planning
Reviewed current reranking direction and treated learned rerankers as an optional second-stage path, not a replacement for the existing fast retriever. The implementation choice was to keep the current heuristic reranker as the default baseline and add a small model-assisted rerank hook that can be enabled explicitly.

## Task list executed
- reviewed the current plan, repo state, and handoff notes
- researched/confirmed the current reranking direction
- added rerank strategy scaffolding for an optional model-assisted stage
- implemented a best-effort LLM-assisted rerank hook after heuristic narrowing
- added deterministic parsing/merge smoke coverage
- validated with TypeScript, smoke test, and existing eval suites

## Code changes

### 1) Rerank strategy expansion
Updated `src/types/rerank.ts`:
- added `heuristic-then-llm` to `rerankStrategies`
- added `ModelRerankScore` type

### 2) Config fields for model-assisted reranking
Updated `src/config.ts`:
- `rerankStrategy` now supports:
  - `heuristic-v1`
  - `heuristic-then-llm`
- added `modelRerankTopK`
- added `modelRerankModelId`

### 3) New model-rerank module
Added `src/modelRerank.ts`:
- `buildModelRerankPrompt(userQuery, entries)`
- `parseModelRerankResponse(response)`
- `applyModelRerankScores(heuristicEntries, modelScores, topK)`
- `performModelAssistedRerank(model, userQuery, heuristicEntries, topK, abortSignal)`

Behavior:
- model-assisted rerank is optional
- only runs when `rerankEnabled` is true and `rerankStrategy === "heuristic-then-llm"`
- narrows candidates heuristically first, then asks an LLM for JSON relevance scores
- blends model score and heuristic score (currently model-weighted)
- falls back to heuristic-only reranking if the model call or parsing fails

### 4) Prompt preprocessor integration
Updated `src/promptPreprocessor.ts`:
- imported `performModelAssistedRerank`
- read new config fields
- when strategy is `heuristic-then-llm`, it:
  - loads the configured rerank model if provided, else uses the active/default LM Studio model
  - model-reranks only the top `modelRerankTopK` heuristic candidates
  - logs parsed-score count / raw response for debugging
  - falls back cleanly to heuristic reranking on failure

### 5) Heuristic reranker compatibility
Updated `src/rerank.ts`:
- `heuristic-then-llm` now still uses the heuristic reranker as its first-stage scorer rather than bypassing it

### 6) Deterministic smoke coverage
Added `scripts/smoke-model-rerank.ts`:
- validates prompt construction
- validates fenced-JSON parsing
- validates score-merge behavior elevating the correct evidence

Updated `package.json`:
- added `npm run smoke:model-rerank`

### 7) Plan tracking
Updated `IMPLEMENTATION_PLAN.md`:
- refreshed immediate execution task list for this slice
- marked the model-assisted rerank implementation, tests, and validation tasks complete

## Validation completed
- `npx -y -p typescript tsc --noEmit` passed
- `npm run smoke:model-rerank` passed
- `npm run eval` still passed
- aggregate eval remained at 13/13 passing

## Important implementation notes
- this is not a dedicated cross-encoder reranker; it is an optional LLM-assisted rerank hook suitable for local experimentation within LM Studio
- the fast/default path remains the heuristic reranker
- runtime behavior is intentionally best-effort and failure-tolerant
- the next practical step is live LM Studio validation plus tuning of:
  - `modelRerankTopK`
  - fallback behavior
  - prompt wording / score blend
  - whether a dedicated local rerank model should later replace or augment the generic LLM hook

## Suggested next step
Do a focused LM Studio live pass with:
- `rerankEnabled = true`
- `rerankStrategy = heuristic-then-llm`
- `modelRerankTopK = 3`
- hybrid retrieval optionally on for quoted-span / exact-term prompts

Then tune defaults based on observed latency, score quality, and failure rate.
