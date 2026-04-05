# Handoff — dual plugin + MCP setup finalized (2026-04-01)

## Final architecture
The repo now intentionally supports **two integration modes** from a single codebase:

1. **LM Studio plugin mode**
   - Repo root remains the LM Studio plugin root.
   - `src/index.ts` is intentionally retained as a minimal plugin-root entry shim.
   - That shim forwards to `packages/adapter-lmstudio/src/index.ts`.

2. **MCP server mode**
   - MCP runs package-natively from `packages/mcp-server/src/stdioServer.ts`.
   - Root script `npm run mcp:stdio` now delegates through the MCP workspace package.

Shared implementation lives in:
- `packages/core`
- `packages/adapter-lmstudio`
- `packages/mcp-server`

## Shim cleanup completed
Removed legacy compatibility shims:
- all `src/mcp/*`
- all `src/core/*`
- all `src/types/*`
- all root `src/*.ts` adapter shims except `src/index.ts`

Remaining shim by design:
- `src/index.ts`

This is no longer treated as migration debt; it is the intentional LM Studio plugin-root entry surface.

## Scripts / ergonomics added
Root `package.json` scripts now explicitly support dual mode:
- `dev` -> `dev:plugin`
- `dev:plugin`
- `push` -> `push:plugin`
- `push:plugin`
- `mcp:stdio`
- `typecheck:core`
- `typecheck:adapter`
- `typecheck:mcp`
- `typecheck:packages`
- `typecheck`

Package scripts added:
- `packages/core/package.json`
  - `typecheck`
- `packages/adapter-lmstudio/package.json`
  - `typecheck`
- `packages/mcp-server/package.json`
  - `stdio`
  - `typecheck`

## TypeScript config adjustments
Per-package typecheck initially failed because adapter and MCP import files from `packages/core/src`, while their tsconfigs constrained `rootDir` to local `src`.

This was fixed by updating:
- `packages/adapter-lmstudio/tsconfig.json`
- `packages/mcp-server/tsconfig.json`

to use:
- `rootDir: ../..`
- includes for both local `src/**/*.ts` and `../core/src/**/*.ts`

This enables package-level typecheck without changing the current import strategy.

## README finalized
README was rewritten into a polished final-state version that now:
- presents the repo as one project with two supported modes
- clearly documents plugin mode vs MCP mode
- explains why `src/index.ts` remains
- documents package-focused validation commands
- includes LM Studio MCP config examples for Windows and WSL
- reflects the workspace layout as the real implementation surface

## Validation status
Confirmed passing after final cleanup and script/config updates:
- `npm run typecheck:core`
- `npm run typecheck:adapter`
- `npm run typecheck:mcp`
- `npm run typecheck`
- `npm run smoke:core`
- `npm run smoke:core-policy`
- `npm run smoke:mcp`
- `npm run smoke:mcp-filesystem`
- `npm run smoke:model-rerank`

Also previously confirmed in LM Studio UI:
- plugin loads
- plugin config UI renders
- MCP integration loads
- MCP tools are registered:
  - `rag_answer`
  - `rag_search`
  - `corpus_inspect`
  - `rerank_only`

## Practical current usage
Plugin mode:
- `npm run dev:plugin`
- `npm run push:plugin`

MCP mode:
- `npm run mcp:stdio`

Validation:
- `npm run typecheck`
- `npm run typecheck:packages`
- smoke suites as needed

## Best next step for a future conversation
The dual-surface architecture and README polish are done.
Next work should be feature-oriented rather than migration cleanup.
Likely next categories:
- improve package build outputs if actual publishing/build artifacts become necessary
- introduce cleaner package import aliases or project references later if desired
- continue retrieval quality, evaluation, or LM Studio UX improvements
