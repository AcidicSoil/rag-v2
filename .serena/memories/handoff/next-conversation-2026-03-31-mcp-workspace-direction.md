# Handoff — MCP workspace direction and current status (2026-03-31)

## Decision
Do NOT create a new repo yet.

Use the existing `rag-v2` repo and introduce a `packages/` workspace layout instead:
- `packages/core`
- `packages/adapter-lmstudio`
- `packages/mcp-server`

Reasoning:
- plugin + MCP server still share a large amount of logic
- boundaries are still being refined
- shared smoke tests/evals are easier in one repo
- separate repos are only worth it later if release cadence/ownership/product identity diverge

## What has already been implemented

### Core extraction
Transport-agnostic logic is now largely extracted under `src/core/`:
- retrieval post-processing contracts
- fusion
- hybrid merge
- heuristic rerank
- dedupe
- evidence assembly
- rewrite generation
- answerability gating
- corrective assessment/planning
- safety/grounding helpers
- local lexical retrieval over portable documents

### LM Studio bridge / adapter preservation
The existing LM Studio plugin path still compiles and continues to use wrappers/bridge layers so behavior remains intact while logic moves behind core boundaries.

### MCP path
There is now an MCP path in-repo:
- contracts/schemas for:
  - `rag_answer`
  - `rag_search`
  - `corpus_inspect`
  - `rerank_only`
- runtime interfaces for loading/retrieval/inspection/answer composition
- handler layer
- official SDK-backed stdio server wrapper
- real filesystem loading for `paths`
- shared lexical retrieval over loaded local documents
- LM Studio-compatible example config at `examples/lmstudio.mcp.json`
- npm script: `npm run mcp:stdio`

## Important implementation notes
- The MCP stdio path now uses the official `@modelcontextprotocol/sdk` wrapper.
- At the SDK registration boundary, typing was relaxed with `as any` / bound untyped registration because the SDK compatibility layer + current Zod 3 setup produced heavy TypeScript friction. Keep business-logic validation in the existing handler/contracts layer.
- Type-checking with the new SDK needed a larger heap in this environment:
  - `NODE_OPTIONS=--max-old-space-size=8192 npx -y -p typescript tsc --noEmit`
- MCP stdio logging should stay on stderr, not stdout.

## Current validation status
Passed:
- `npm run smoke:core`
- `npm run smoke:core-policy`
- `npm run smoke:mcp`
- `npm run smoke:mcp-filesystem`
- `NODE_OPTIONS=--max-old-space-size=8192 npx -y -p typescript tsc --noEmit`

## Recommended next step
Start the actual workspace move inside the same repo:
1. create `packages/core`
2. create `packages/adapter-lmstudio`
3. create `packages/mcp-server`
4. move the already-extracted `src/core/*` into `packages/core`
5. move LM Studio entrypoints/config/bridge into `packages/adapter-lmstudio`
6. move MCP contracts/handlers/runtime/server files into `packages/mcp-server`
7. keep root-level shared docs/evals/manual-tests/examples until the package split stabilizes

## Recommendation on repo strategy
Stay in one repo for now.
Only consider separate repos later if:
- MCP server becomes its own product
- ownership diverges
- release cadence diverges
- the LM Studio adapter becomes just one thin consumer of a broader engine
