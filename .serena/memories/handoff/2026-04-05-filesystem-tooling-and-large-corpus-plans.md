# Handoff — Filesystem tooling expansion, plugin parity, and large-corpus RAG planning (2026-04-05)

## What landed after the MCP parity refactor

### Filesystem-first MCP surface
Added dedicated filesystem tools so users do not need to misuse RAG tools as directory browsers.

#### New MCP tools
- `filesystem_browse`
- `file_info`
- `read_file`

#### Key capabilities now supported
- `~` / `~/...` path expansion
- cwd reporting and resolved-path reporting
- shallow or recursive directory browsing
- entry caps and truncation reporting
- directory summary fields:
  - `directoryCount`
  - `fileCount`
  - `topExtensions`
- file metadata inspection for files and directories
- bounded text excerpt reading for text-like files

### Shared/server filesystem implementation
Added/updated:
- `packages/mcp-server/src/pathResolution.ts`
  - browse helper
  - file info helper
  - bounded text read helper
  - recursive supported-text discovery
  - traversal guardrails
- `packages/mcp-server/src/defaultRuntime.ts`
- `packages/mcp-server/src/lmstudioRuntime.ts`
- `packages/mcp-server/src/contracts.ts`
- `packages/mcp-server/src/handlers.ts`
- `packages/mcp-server/src/sdkServer.ts`

### Traversal hardening for corpus ingestion
Corpus loading now differs from raw filesystem browsing.

#### Guardrails added
- discovery file-count cap
- max depth cap
- fail-soft error collection on unreadable entries
- ignored heavy directories during corpus ingestion:
  - `.git`
  - `node_modules`
  - `dist`
  - `build`
  - `.next`
  - `.nuxt`
  - `coverage`
  - `tmp`
  - `temp`
  - `vendor`
  - `target`
  - `.cache`

#### Important behavior distinction
- `filesystem_browse` can still show directories like `node_modules`
- corpus ingestion for RAG tools skips those ignored heavy dirs

### Plugin-side parity work
The LM Studio adapter runtime had placeholder browser methods after MCP was upgraded. That was fixed.

#### Added
- `.plans/PLUGIN_FILESYSTEM_PARITY_TASK_LIST.md`
- `packages/adapter-lmstudio/src/filesystem.ts`

#### Updated
- `packages/adapter-lmstudio/src/orchestratorRuntime.ts`
  - real implementations for:
    - `browser.browse`
    - `browser.fileInfo`
    - `browser.readFile`

Important note: the plugin entrypoint is still a prompt preprocessor, so this is internal runtime/helper parity, not a second standalone tool UI like MCP.

## Planning artifacts added

### Task lists / plans created
- `.plans/FILESYSTEM_BROWSING_TASK_LIST.md`
- `.plans/FILE_INSPECTION_TASK_LIST.md`
- `.plans/PLUGIN_FILESYSTEM_PARITY_TASK_LIST.md`
- `.plans/LARGE_CORPUS_RAG_IMPLEMENTATION_PLAN.md`
- `.plans/LARGE_CORPUS_RAG_TASK_LIST.md`

## Large-corpus RAG direction (planned, not yet implemented)
The latest MCP-only export and direct inspection of `dataset-dashboard/raw-chat-data` showed that inspection is now much better, but large-corpus semantic handling still needs a dedicated next phase.

### Planned direction
1. corpus classification + route recommendation
2. large-file sampling and synopsis generation
3. directory manifest generation
4. new orchestrator routes for:
   - `sample`
   - `hierarchical-retrieval`
   - `global-summary`
5. hierarchical retrieval/index representation
6. global corpus summarization mode
7. cached progressive ingestion/indexing
8. adequacy / critique loops

### Why this is needed
Current filesystem-first workflow is now good for:
- browse
- inspect
- bounded sample

But large files/dirs such as `raw-chat-data` still need smarter semantic routing than:
- brute-force ingestion
- or attaching a giant file as direct context

### First implementation slice planned
- corpus classification contracts/helper module
- large-file sampling for `.jsonl`, `.json`, `.html`
- directory manifest generation
- route recommendation wiring into shared orchestrator

## Validation completed at end of this work
- `npm run typecheck:mcp`
- `npm run typecheck:adapter`
- `npm run typecheck:core`
- `npm run smoke:mcp`
- `npm run smoke:mcp-filesystem`

All passed at the end of the last turn.

## Latest export review conclusion
The latest MCP-only export confirmed that:
- `filesystem_browse` works on `raw-chat-data`
- `file_info` and `read_file` now support a real browse → inspect → sample workflow
- directory summaries reduced the need to infer structure from truncated listings
- remaining weakness is large-corpus semantic routing (overview/global questions vs targeted/local questions)

## Best next move in a future conversation
Start implementing `.plans/LARGE_CORPUS_RAG_TASK_LIST.md`, beginning with:
1. corpus classification / route recommendation
2. large-file sampling + synopsis
3. directory manifest generation
4. orchestrator route plumbing
