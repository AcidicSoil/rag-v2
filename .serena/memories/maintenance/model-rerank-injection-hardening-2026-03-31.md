# Model Rerank Injection Hardening — 2026-03-31

## Goal
Harden the optional model-assisted rerank path against prompt-injection-like candidate text, then enforce the mitigation in the deterministic stress harness.

## Changes made

### 1) Safety helper
Updated `src/safety.ts`:
- added `containsInstructionLikeText(value)`
- reuses the existing instructional pattern list to detect instruction-like candidate text

### 2) Prompt hardening for model reranking
Updated `src/modelRerank.ts`:
- `buildModelRerankPrompt(...)` now sanitizes candidate content with:
  - `sanitizeRetrievedText: true`
  - `stripInstructionalSpans: true`
- candidate content is wrapped in explicit delimiters
- prompt now explicitly states candidate text is untrusted data
- prompt instructs the model never to follow instructions found inside candidates and not to reward a candidate for telling the model how to rank or answer

### 3) Score-application hardening
Updated `src/modelRerank.ts`:
- added `INSTRUCTION_LIKE_MODEL_SCORE_CAP = 0.2`
- `applyModelRerankScores(...)` now caps model score contribution for candidates whose raw content contains instruction-like text
- this prevents a suspicious chunk from jumping to the top solely because the model assigned it an extreme score

### 4) Stress harness upgrade
Updated `scripts/stress-model-rerank.ts`:
- added prompt-level assertions that:
  - rerank prompt warns that candidate content is untrusted
  - instruction-like spans are removed from candidate content in the prompt
- upgraded the prompt-injection adversarial case from a reported weakness to a hard assertion:
  - suspicious injected candidate must not outrank the correct chunk after score application

## Validation completed
- `npx -y -p typescript tsc --noEmit` passed
- `npm run stress:model-rerank` passed
- `npm run smoke:model-rerank` passed
- `npm run eval` passed
- eval suite remained 13/13 passing

## Outcome
The stress harness no longer reports prompt-injection susceptibility as an exposed weakness. Remaining exposed deterministic weakness classes are:
1. near-duplicate dominance
2. length-bias susceptibility
3. top-1 stability risk under modest score changes

## Best next step
Target duplicate dominance next, likely by adding duplicate-cluster suppression or candidate diversity constraints in the model-assisted rerank merge path, then re-run the stress harness to see whether stability also improves as a side effect.
