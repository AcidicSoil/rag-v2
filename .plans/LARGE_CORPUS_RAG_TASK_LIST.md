# Large Corpus RAG Task List

## Scope reviewed
- latest MCP-only chat export for `raw-chat-data`
- MCP/browser/file inspection improvements already landed
- plugin parity work completed for internal filesystem helpers
- current shared core orchestrator and MCP runtime split

## Key observations from latest export
- The new browse → inspect → read flow works and was actually used.
- The assistant was able to inspect `dataclaw_export.jsonl` via `file_info` and `read_file`.
- Directory summaries improved reasoning on large export folders, but the assistant still tried to move too quickly from coarse inspection to semantic conclusions.
- `rag_answer` remained stub-like when only metadata text was supplied as the corpus.
- `rag_prepare_prompt` over a huge `conversations.json` path fell into an attached full-context style path instead of a large-corpus-aware summary/retrieval strategy.

## Execution order

### 1. Corpus classification and route recommendation
- Add a corpus classification module in core.
- Inputs:
  - path(s)
  - file metadata
  - extension mix
  - size estimates
  - sample windows
- Outputs:
  - corpus kind
  - likely modality mix
  - oversized-file flags
  - recommended route

### 2. Large-file sampling and synopsis
- Add helpers for bounded head/tail/random/stratified sampling of large text-like files.
- Detect structure:
  - jsonl
  - json array/object
  - html
  - markdown
  - transcript/log/code
- Produce a stable file synopsis object.

### 3. Directory manifest generation
- Build directory-level manifests:
  - file counts
  - extension distribution
  - dominant modalities
  - representative file candidates
  - oversized file list
- Preserve browsing behavior, but give the orchestrator richer route context.

### 4. New orchestrator output routes
- Add new routes / modes in core output contracts:
  - `sample`
  - `hierarchical-retrieval`
  - `global-summary`
- Make route selection explicit for large-corpus questions.

### 5. Hierarchical retrieval/index representation
- Add parent/child chunk support.
- Add optional summary nodes for large files or file groups.
- Retrieve across:
  - summary nodes
  - parent sections
  - raw chunks

### 6. Global corpus summarization mode
- Add corpus-wide summary generation for questions like:
  - “what is in this dataset?”
  - “what themes dominate this corpus?”
  - “what kinds of conversations are present?”
- Keep this separate from local file retrieval.

### 7. Cached progressive ingestion
- Cache:
  - manifests
  - synopses
  - chunk indexes
  - hierarchical summaries
- Use path hash + mtime/file counts for invalidation.

### 8. Adequacy / critique loop
- Add a post-retrieval adequacy check.
- If evidence is weak:
  - refine retrieval
  - switch to a different route
  - answer with explicit insufficiency if needed

### 9. Validation
- Add smoke tests for:
  - oversized JSONL
  - binary-heavy export directory
  - global question vs local question routing
  - cache hit / cache invalidation

## First implementation slice
1. Corpus classification contracts and helper module
2. Large-file sampling utility for `.jsonl`, `.json`, `.html`
3. Directory manifest generation
4. Route recommendation plumbing into shared orchestrator

## Success criteria
- Huge files do not go straight to brute-force ingestion
- Huge directories do not require full recursive embedding to answer overview questions
- The system can distinguish:
  - overview questions
  - targeted lookup questions
- The same core route logic remains reusable by both MCP and plugin paths
