# Model Rerank Stress Harness — 2026-03-31

## Goal
Add a deterministic stress-test harness for the optional model-assisted rerank path that can expose likely weaknesses without requiring live LM Studio runtime setup.

## Changes made
- added `scripts/stress-model-rerank.ts`
- updated `package.json`
  - added `npm run stress:model-rerank`

## What the stress harness covers

### Robustness invariants (hard-fail)
- parses valid JSON, fenced JSON, and prose-wrapped JSON payloads
- clamps out-of-range relevance scores into `[0, 1]`
- coerces numeric-string relevance values
- treats invalid/truncated model output as empty parsed scores
- verifies empty parsed scores preserve heuristic ordering
- verifies thrown model-call failures remain catchable by the caller

### Adversarial diagnostics (reports exposed weaknesses)
- plausible distractor test: confirms model-assisted rerank can elevate the truly relevant tradeoff chunk
- prompt-injection susceptibility: injected candidate can overtake correct evidence if model scores it highly
- near-duplicate dominance: duplicate cluster can monopolize top results
- length-bias susceptibility: long noisy chunk can outrank short precise evidence
- stability risk: modest score changes can fully flip top-1 across repeated runs on the same candidate pool

## Validation completed
- `npx -y -p typescript tsc --noEmit` passed
- `npm run stress:model-rerank` passed
- `npm run smoke:model-rerank` passed
- `npm run eval` passed
- eval suite remained 13/13 passing

## Current observed stress findings
The deterministic stress harness currently exposes four weakness classes:
1. prompt-injection susceptibility
2. near-duplicate dominance
3. length-bias susceptibility
4. top-1 stability risk under small score changes

## Best next step
Do focused live LM Studio validation for the same weakness classes:
- repeat the same candidate pool / query 50-100 times and measure top-1 flip rate
- probe instruction-like spans inside retrieved chunks
- sweep `modelRerankTopK` upward to find latency + stability breakpoints
- then decide whether to harden prompt/input sanitization, constrain score blending, add duplicate suppression, or expand eval coverage
