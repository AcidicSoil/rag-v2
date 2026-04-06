# Next conversation start point (2026-04-05)

The current repository state already includes:
- shared core orchestrator parity across MCP and adapter retrieval flow
- filesystem-first MCP tools:
  - `filesystem_browse`
  - `file_info`
  - `read_file`
- path expansion and recursive browsing
- traversal hardening for corpus ingestion
- directory summary fields on browse/file info
- internal plugin/runtime parity for filesystem helpers in `packages/adapter-lmstudio/src/orchestratorRuntime.ts`

## Most relevant plans to pick up next
- `.plans/LARGE_CORPUS_RAG_IMPLEMENTATION_PLAN.md`
- `.plans/LARGE_CORPUS_RAG_TASK_LIST.md`

## Immediate recommended next implementation slice
1. add corpus classification + route recommendation contracts/helper in core
2. add large-file sampling/synopsis utilities for `.jsonl`, `.json`, `.html`
3. add directory manifest generation
4. wire recommended large-corpus route selection into the shared orchestrator

## Why this is next
The latest MCP-only export confirmed that inspection UX is much improved, but semantic handling of very large files/directories is still weak. The remaining gap is not filesystem access; it is large-corpus route selection.

Examples observed:
- `raw-chat-data` can now be browsed, inspected, and sampled safely
- large directories still need a smarter route than brute-force ingestion
- high-level questions over huge files/dirs need summary/hierarchical modes, not just standard retrieval

## Validation status before handoff
Passed:
- `npm run typecheck:mcp`
- `npm run typecheck:adapter`
- `npm run typecheck:core`
- `npm run smoke:mcp`
- `npm run smoke:mcp-filesystem`

## Important implementation distinction
- MCP exposes standalone filesystem tools
- LM Studio plugin currently has matching internal helper/runtime behavior, but not a separate standalone tool surface

## Dataset-specific note
Direct inspection of `dataset-dashboard/raw-chat-data` showed:
- very large monolithic chat exports
- binary-heavy official export directories
- mixed local-vs-global query needs
This is exactly why the large-corpus plan should start with classification + progressive ingestion rather than immediate brute-force retrieval.
