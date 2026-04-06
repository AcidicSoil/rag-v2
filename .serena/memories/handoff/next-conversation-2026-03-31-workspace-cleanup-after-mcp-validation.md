# Handoff — workspace cleanup after MCP validation (2026-03-31)

## Current architectural direction
Keep one repo.
Use the `packages/` workspace layout rather than splitting into a new repo.

Current package structure now exists:
- `packages/core`
- `packages/adapter-lmstudio`
- `packages/mcp-server`

## What has been completed

### 1) Workspace/package migration landed
Real implementation files now live in package folders:
- `packages/core/src/*`
- `packages/adapter-lmstudio/src/*`
- `packages/adapter-lmstudio/src/types/*`
- `packages/mcp-server/src/*`

The old root/source paths were converted into temporary compatibility shims:
- `src/*.ts`
- `src/types/*.ts`
- `src/mcp/*.ts`
- `src/core/*.ts`

These shims currently re-export from the package-native implementation files.

### 2) Core package boundary improved
The previous `core -> mcp` dependency direction was removed.
`packages/core/src/runtimeContracts.ts` now defines package-local request/runtime contract types rather than importing MCP schema types from the MCP package.

### 3) Repo root updated for workspaces
Root `package.json` now includes npm workspaces:
- `packages/*`

Root scripts still work.
Important current script:
- `npm run mcp:stdio` -> `packages/mcp-server/src/stdioServer.ts`

### 4) Scripts migrated to package-native imports
Smoke/eval scripts were updated to import from package-native paths instead of the old shim paths where safe.

### 5) README updated
README now reflects the workspace layout and includes LM Studio MCP configuration examples for:
- Windows-native launch from a Windows clone
- WSL launch via `wsl.exe`

## MCP validation status
MCP package-native flow is now strongly validated.

### Confirmed working
- `npm run mcp:stdio` works from `packages/mcp-server/src/stdioServer.ts`
- LM Studio loads the MCP server successfully
- LM Studio enumerates these tools successfully:
  - `rag_answer`
  - `rag_search`
  - `corpus_inspect`
  - `rerank_only`

### LM Studio MCP config examples validated by user
#### Windows-native repo clone
```json
{
  "rag-v2-local": {
    "command": "npm",
    "args": ["run", "mcp:stdio"],
    "cwd": "C:\\Users\\user\\projects\\rag-v2"
  }
}
```

#### WSL launch via `wsl.exe`
```json
{
  "rag-v2-local": {
    "command": "wsl.exe",
    "args": [
      "-d",
      "Ubuntu-24.04-D",
      "bash",
      "-lc",
      "cd /home/user/projects/temp/ai-apps/rag-v2 && npm run mcp:stdio"
    ]
  }
}
```

Important note:
- The earlier WSL issue was NOT an LM Studio bug; it was caused by an incorrect distro name.

## Validation completed after migration
Passed:
- `npm run smoke:core`
- `npm run smoke:core-policy`
- `npm run smoke:mcp`
- `npm run smoke:mcp-filesystem`
- `npm run smoke:model-rerank`
- `NODE_OPTIONS=--max-old-space-size=8192 npx -y -p typescript tsc --noEmit`

## What remains before the workspace migration is truly finished
This is the main unfinished area.

### Remaining compatibility shims to remove
Still present:
- `src/*.ts`
- `src/types/*.ts`
- `src/mcp/*.ts`
- `src/core/*.ts`

### Recommended removal order
1. Remove `src/mcp/*` shims first.
   Reason: MCP is already package-native in scripts and validated end-to-end in LM Studio.
2. Re-run MCP validation:
   - `npm run smoke:mcp`
   - `npm run smoke:mcp-filesystem`
   - `npm run mcp:stdio`
3. Then evaluate whether LM Studio plugin entry can move fully off `src/index.ts`.
4. Only after plugin entry behavior is confirmed, remove remaining:
   - `src/*.ts`
   - `src/types/*.ts`
   - `src/core/*.ts`

## Important caution
The user stated that the LM Studio plugin loads without issues, but the conversation did NOT yet include the actual refactor that repoints/removes the plugin shim entry. So do not assume the plugin shim is already removable; verify explicitly in code before deleting it.

## Best next step for the next conversation
Continue the cleanup phase, starting with:
- remove `src/mcp/*` compatibility shims
- re-run MCP validation
- then assess the remaining plugin-side shims and entrypoint strategy

## Nice-to-have later
After shim removal is complete:
- consider a cleaner package import strategy or aliases instead of relative `../../core/src/...` imports
- consider stricter per-package build/typecheck flow or TypeScript project references
