# Large Corpus RAG Implementation Plan

## Context
The current MCP and plugin surfaces now support:
- filesystem-first browsing (`filesystem_browse`)
- file metadata inspection (`file_info`)
- bounded text sampling (`read_file`)
- safer corpus discovery with path expansion, directory traversal limits, and ignored heavy directories
- shared core orchestration for MCP and adapter retrieval flow

This is enough to inspect large corpora safely, but not enough to answer high-level questions over very large files/directories efficiently or reliably.

## Problem statement
Large datasets such as `raw-chat-data` contain:
- very large monolithic files (`.jsonl`, `.json`, `.html`)
- binary-heavy export directories dominated by images/attachments
- mixed workloads:
  - local lookup questions (find a session / conversation / tool usage)
  - global understanding questions (what topics dominate this corpus?)

A single retrieval path is not sufficient. We need progressive ingestion and adaptive routing.

## Research-backed design direction

### 1. Adaptive retrieval routing
Use a lightweight gating/routing step to choose among:
- browse/sample only
- direct full-context for small inputs
- standard local retrieval
- hierarchical / summary-backed retrieval
- global corpus summarization mode

This follows the core idea behind Adaptive-RAG and related adaptive augmentation work: retrieval strategy should depend on query/corpus complexity rather than always using a fixed path.

### 2. Retrieval + critique loops
For large or weakly structured corpora, add a post-retrieval adequacy/coverage check that can:
- decide evidence is insufficient
- request another retrieval pass
- switch from local lookup to summary-backed retrieval

This aligns with Self-RAG style retrieval-on-demand and critique-driven evidence control.

### 3. Hierarchical representations for huge files
For oversized text files and large corpora, build multi-level representations:
- manifest / file-level metadata
- sampled synopsis
- chunk-level retrieval index
- parent section summaries
- optional recursive cluster summaries

This is the most relevant practical insight from RAPTOR-style hierarchical retrieval.

### 4. Distinguish local vs global corpus questions
Introduce explicit modes:
- **local search** for file/chunk/entity-specific lookup
- **global search** for corpus-wide themes and summaries

This follows the same separation GraphRAG makes between local/entity-oriented and global/theme-oriented questions.

## Proposed architecture

### Phase A — Progressive corpus classification
Before full ingestion:
1. classify target as file vs directory
2. classify likely modality mix (text-heavy vs binary-heavy vs mixed)
3. estimate size/scale
4. produce a manifest and routing hint

Outputs:
- corpus kind
- file counts / extension mix
- oversized-file flags
- recommended route (`sample`, `full-context`, `retrieval`, `hierarchical`, `global-summary`)

### Phase B — Large-file progressive ingestion
For oversized text-like files:
1. read bounded head/tail/sample windows
2. infer structure (jsonl, json array/object, html, markdown, log, code, transcript)
3. emit a file synopsis
4. choose one of:
   - direct sampled answer mode
   - structured chunk extraction
   - hierarchical summary/index build

### Phase C — Large-directory progressive ingestion
For directories:
1. build manifest (counts, sizes, extension mix, representative files)
2. identify candidate primary text sources
3. skip or downweight binary-heavy artifacts
4. optionally build a directory synopsis and topic map

### Phase D — Retrieval modes
- **Sample mode**: answer from manifest + bounded excerpts only
- **Local retrieval mode**: retrieve chunks from selected files
- **Hierarchical retrieval mode**: retrieve from summaries + chunks + parent sections
- **Global summary mode**: answer corpus-level questions from precomputed summaries / community-style reports

### Phase E — Optional cached background indexing
For repeated use on the same target:
- persist manifests
- persist file synopses
- persist chunk indexes
- persist hierarchical summaries
- invalidate by mtime / file count / path hash

## Suggested implementation sequence
1. Add corpus classification + route recommendation contracts
2. Add large-file sampling/synopsis utilities
3. Add directory manifest generation
4. Add route selection for `sample`, `hierarchical`, and `global-summary`
5. Add cached progressive ingestion/indexing
6. Add critique/coverage retry policies for large-corpus questions

## Immediate design constraints
- never block on whole-directory ingestion for first contact
- keep binary-heavy trees inspectable without trying to embed everything
- preserve current MCP ergonomics: browse → inspect → sample → query
- reuse shared core orchestrator where possible

## Initial success criteria
- oversized files are sampled/summarized before deep retrieval
- binary-heavy directories produce manifest summaries instead of brute-force ingestion
- high-level corpus questions can be answered without flattening all files into one retrieval pool
- local lookup questions still work on specific selected files
