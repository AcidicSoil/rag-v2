# Prepare-for-new-conversation summary (2026-03-31)

We completed the workspace migration into:
- `packages/core`
- `packages/adapter-lmstudio`
- `packages/mcp-server`

Real implementation files now live in those package directories.
Legacy root paths remain only as temporary compatibility re-export shims:
- `src/*.ts`
- `src/types/*.ts`
- `src/mcp/*.ts`
- `src/core/*.ts`

Completed work:
- moved core files into `packages/core/src`
- moved LM Studio adapter files + adapter-local types into `packages/adapter-lmstudio/src`
- moved MCP files into `packages/mcp-server/src`
- removed the old `core -> mcp` type dependency direction by redefining runtime contract types inside core
- updated root workspace config
- updated scripts to package-native imports where safe
- updated README with workspace structure and LM Studio MCP config examples

Validation completed and passing:
- `npm run smoke:core`
- `npm run smoke:core-policy`
- `npm run smoke:mcp`
- `npm run smoke:mcp-filesystem`
- `npm run smoke:model-rerank`
- `NODE_OPTIONS=--max-old-space-size=8192 npx -y -p typescript tsc --noEmit`

MCP is strongly validated:
- `npm run mcp:stdio` works
- LM Studio loads the MCP server successfully
- the tools enumerate correctly:
  - `rag_answer`
  - `rag_search`
  - `corpus_inspect`
  - `rerank_only`

User validated two working LM Studio MCP config styles:
1. Windows clone + `npm run mcp:stdio`
2. WSL launch via `wsl.exe -d <distro> bash -lc 'cd ... && npm run mcp:stdio'`

Important clarification:
- The WSL launch problem was caused by the wrong distro name, not an LM Studio bug.

What remains:
- remove shim layers incrementally

Recommended next step:
1. remove `src/mcp/*` shims first
2. rerun MCP validation (`smoke:mcp`, `smoke:mcp-filesystem`, `npm run mcp:stdio`)
3. then evaluate/remap the LM Studio plugin entrypoint before removing remaining plugin-side shims

Most detailed handoff memory:
- `handoff/next-conversation-2026-03-31-workspace-cleanup-after-mcp-validation`
