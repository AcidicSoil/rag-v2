Session summary: LM Studio shared-package boundary cleanup completed after the earlier model-resolution helper extraction.

What changed in this follow-up:
1. Created/expanded `packages/lmstudio-shared/` as the neutral home for LM Studio cross-runtime utilities.
2. Previously moved model-resolution logic already lives there (`modelResolution.ts`, `AUTO_DETECT_MODEL_ID`).
3. In this slice, also moved the remaining MCP-reused LM Studio utilities out of adapter internals:
   - added `packages/lmstudio-shared/src/rerankTypes.ts`
   - added `packages/lmstudio-shared/src/modelRerank.ts`
   - added `packages/lmstudio-shared/src/lmstudioCoreBridge.ts`
   - updated `packages/lmstudio-shared/src/index.ts`
4. Updated imports in:
   - `packages/mcp-server/src/lmstudioRuntime.ts`
   - `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
   - `packages/adapter-lmstudio/src/rerank.ts`
   - `scripts/smoke-model-rerank.ts`
5. Slimmed `packages/adapter-lmstudio/src/lmstudioCoreBridge.ts` so it now only wraps adapter-local `toEvidenceBlocks()` and re-exports the shared LM Studio/core conversion helpers.
6. Removed old adapter-local shared files:
   - `packages/adapter-lmstudio/src/lmstudioModelResolution.ts` (earlier slice)
   - `packages/adapter-lmstudio/src/modelRerank.ts`
   - `packages/adapter-lmstudio/src/types/rerank.ts`
7. Updated package wiring:
   - root `package.json` now includes `typecheck:lmstudio-shared` and includes it in `typecheck:packages`
   - `packages/adapter-lmstudio/package.json` depends on `@rag-v2/lmstudio-shared`
   - `packages/mcp-server/package.json` depends on `@rag-v2/lmstudio-shared`
   - `packages/lmstudio-shared/package.json` depends on `@lmstudio/sdk` and `@rag-v2/core`
8. Updated `.plans/LMSTUDIO_MODEL_RESOLUTION_HELPERS_TASK_LIST.md` to reflect:
   - targeted helper smoke coverage completed
   - helper move into neutral shared package completed
   - remaining LM Studio-only shared utilities move completed

Validation performed and passing at end of session:
- `npm run typecheck:adapter`
- `npm run typecheck:mcp`
- `npm run typecheck:lmstudio-shared`
- `npm run smoke:model-rerank`
- `npm run smoke:lmstudio-model-resolution`
- `npm run smoke:mcp`

Important debugging notes from the session:
- During the helper move, `packages/adapter-lmstudio/src/config.ts` was temporarily broken by an overwrite:
  - first a missing `)` / `.build()` tail issue
  - then a dropped set of config schema fields that caused typed `pluginConfig.get(...)` failures
- Those regressions were fixed before completion; final validation passed cleanly.

Current architectural recommendation:
- Stop the shared-package boundary cleanup here for now.
- `lmstudio-shared` now contains the LM Studio cross-runtime primitives.
- Keep adapter-local evidence shaping/types where they are unless MCP or another runtime actually needs them.
- Next worthwhile options:
  1. add runtime-level assertions for fallback/diagnostic note text if stronger end-to-end proof is wanted
  2. consider a more generic model-resolution abstraction only if future duplication appears
  3. only move adapter evidence types/shaping into `lmstudio-shared` if another runtime starts consuming them
