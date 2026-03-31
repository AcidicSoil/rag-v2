# RAG v2

`rag-v2` is a document-grounded RAG project for LM Studio with **two supported integration modes**:

- **LM Studio plugin mode**: a prompt-preprocessor plugin that enriches chats using attached files
- **MCP server mode**: a stdio MCP server that exposes the same core retrieval logic as tools

The repository uses a workspace layout:

- `packages/core`: transport-agnostic retrieval, ranking, evidence, and policy logic
- `packages/adapter-lmstudio`: LM Studio plugin adapter and prompt-preprocessor flow
- `packages/mcp-server`: MCP server adapter and stdio entrypoint

The goal is to keep one shared RAG implementation while supporting both LM Studio plugin workflows and MCP-hosted tool workflows.

## What it does

When users provide documents, `rag-v2` can:

- inject full content for small inputs
- retrieve and inject only the most relevant evidence for larger inputs
- avoid wasteful retrieval on conversational, ambiguous, or likely unanswerable prompts
- combine semantic retrieval with local lexical retrieval when helpful
- rerank, dedupe, sanitize, and package evidence before it reaches the model

This makes easy cases faster, large-document cases more selective, and weak-evidence cases more grounded.

## Core capabilities

### Two context strategies
The system chooses between:

- **full-content injection** for small files that fit comfortably in context
- **retrieval-driven injection** for larger files where only the best evidence should be sent to the model

### Answerability gate
Before retrieval, prompts can be classified as:

- `no-retrieval-needed`
- `ambiguous`
- `likely-unanswerable`
- `retrieval-useful`

This reduces unnecessary retrieval and helps avoid confident answers that are not actually grounded in the provided documents.

### Deterministic multi-query retrieval
For retrieval-heavy prompts, the system can generate multiple query variants such as:

- original
- keywords
- decomposed
- quoted-span

These variants are fused into a shared candidate pool to improve recall.

### Optional hybrid retrieval
Hybrid mode combines:

- LM Studio semantic retrieval
- local lexical retrieval over parsed document content

This is especially useful for exact phrases, rare terms, section titles, and quoted spans.

### Fusion and reranking
After retrieval, candidates can be:

- fused across query variants
- merged across semantic and lexical sources
- reranked with a lightweight heuristic reranker

The reranker favors answer-useful evidence, not just semantic similarity.

### Evidence packaging and dedupe
Instead of injecting raw retrieved text, the system:

- removes near-duplicate evidence
- builds labeled evidence blocks
- includes provenance cues such as file name and score
- limits how many evidence blocks are injected

### Safer retrieved-text injection
Retrieved content is treated as untrusted input. The system can:

- sanitize noisy text
- strip obvious instruction-like spans
- apply stricter grounding behavior

Grounding modes currently include:

- `off`
- `warn-on-weak-evidence`
- `require-evidence`

## Repository layout

```text
packages/
  core/
  adapter-lmstudio/
  mcp-server/
src/
  index.ts
scripts/
eval/
manual-tests/
examples/
```

Important note:

- `src/index.ts` is an **intentional LM Studio plugin-root entry shim**
- it forwards to `packages/adapter-lmstudio/src/index.ts`
- it remains at the repo root so LM Studio plugin tooling can treat the repository root as the plugin root

All other legacy compatibility shims have been removed.

## How the pipeline works

At a high level:

1. inspect the user prompt and available documents
2. optionally run the answerability gate
3. choose full-content injection or retrieval
4. optionally generate multiple retrieval rewrites
5. optionally merge semantic and lexical candidates
6. fuse and rerank candidate evidence
7. dedupe and sanitize evidence blocks
8. inject grounded evidence plus the user query back into the prompt or return tool results

Most LM Studio-facing orchestration lives in `packages/adapter-lmstudio/src/promptPreprocessor.ts`. Shared retrieval and policy logic lives in `packages/core/src/`.

## Supported integration modes

### 1) LM Studio plugin mode
Use this when you want document-aware prompt preprocessing directly inside LM Studio.

Run the plugin in dev mode:

```bash
npm run dev:plugin
```

Publish or update the plugin:

```bash
npm run push:plugin
```

### 2) MCP server mode
Use this when you want to expose RAG functionality as MCP tools to LM Studio MCP or another local MCP-compatible host.

Run the stdio MCP server:

```bash
npm run mcp:stdio
```

This exposes four tools:

- `rag_answer`
- `rag_search`
- `corpus_inspect`
- `rerank_only`

Important for MCP mode:

- do not print to stdout outside the MCP protocol
- use stderr for logs and debugging output
- the runtime supports inline `documents`, filesystem `paths`, and pre-supplied `chunks`

## LM Studio MCP configuration

A ready-to-copy example is included at:

```text
examples/lmstudio.mcp.json
```

### Windows-native repo clone

```json
{
  "mcpServers": {
    "rag-v2-local": {
      "command": "npm",
      "args": ["run", "mcp:stdio"],
      "cwd": "C:\\Users\\user\\projects\\rag-v2"
    }
  }
}
```

### WSL launch through `wsl.exe`

```json
{
  "mcpServers": {
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
}
```

Replace the path values with the ones for your machine.

## Development commands

### Primary commands

```bash
npm run dev:plugin
npm run push:plugin
npm run mcp:stdio
npm run typecheck
npm run eval
```

### Package-focused typechecking

```bash
npm run typecheck:core
npm run typecheck:adapter
npm run typecheck:mcp
npm run typecheck:packages
```

- `typecheck:core` validates the shared core package
- `typecheck:adapter` validates the LM Studio adapter package
- `typecheck:mcp` validates the MCP package
- `typecheck:packages` validates all workspace packages
- `typecheck` validates all packages plus the root plugin shim

## Validation and testing

### Smoke tests

```bash
npm run smoke:multi-query
npm run smoke:evidence
npm run smoke:safety
npm run smoke:rerank
npm run smoke:hybrid
npm run smoke:corrective
npm run smoke:core
npm run smoke:core-policy
npm run smoke:mcp
npm run smoke:mcp-filesystem
npm run smoke:model-rerank
```

These are intended to verify deterministic slices of the pipeline quickly.

### Eval suites
Run the lightweight regression harness with:

```bash
npm run eval
```

Inputs live in `eval/cases/`.
Latest aggregated output is written to:

```text
eval/results/all-latest.json
```

Current suites include:

- `basic.jsonl`
- `hard.jsonl`

### Manual LM Studio validation
For live testing in LM Studio, use:

- `LIVE_TEST_SCRIPT.md`
- `manual-tests/README.md`
- `manual-tests/fixtures/`

## Configuration

The LM Studio plugin exposes configuration in the LM Studio UI.

### Embedding and retrieval base settings
- Embedding Model
- Manual Model ID
- Auto-Unload Model
- Retrieval Limit
- Retrieval Affinity Threshold

### Answerability gate settings
- Answerability Gate
- Gate Confidence Threshold
- Ambiguous Query Behavior

### Multi-query settings
- Multi-Query Retrieval
- Multi-Query Count
- Fusion Method
- Max Candidates Before Rerank

### Hybrid retrieval settings
- Hybrid Retrieval
- Lexical Weight
- Semantic Weight
- Hybrid Candidate Count

### Reranking and evidence settings
- Rerank Fused Candidates
- Rerank Top K
- Rerank Strategy
- Evidence Dedupe Threshold
- Max Evidence Blocks

### Safety and grounding settings
- Sanitize Retrieved Text
- Strip Instruction-Like Spans
- Strict Grounding Mode

## Key files

- `packages/adapter-lmstudio/src/promptPreprocessor.ts`: main LM Studio prompt-preprocessor pipeline
- `packages/adapter-lmstudio/src/`: LM Studio adapter logic and local types
- `packages/core/src/`: shared retrieval, ranking, evidence, and policy logic
- `packages/mcp-server/src/`: MCP contracts, handlers, runtimes, and stdio server entrypoints
- `src/index.ts`: intentional repo-root LM Studio plugin entry shim
- `scripts/`: smoke tests and eval runner
- `examples/lmstudio.mcp.json`: LM Studio MCP config example
- `manual-tests/`: live-test fixtures and guidance

## Current status

The repository currently includes:

- answerability gating
- deterministic multi-query retrieval
- optional hybrid semantic-plus-lexical retrieval
- fusion and heuristic reranking
- evidence dedupe and packaging
- retrieved-text sanitization and grounding controls
- smoke tests for major pipeline slices
- regression eval coverage
- an SDK-backed MCP stdio server path with filesystem loading
- LM Studio-compatible MCP examples

## Author

- **GitHub**: [AcidicSoil](https://github.com/AcidicSoil)
- **X**: [@d1rt7d4t4](https://x.com/d1rt7d4t4)
- **Discord**: `the_almighty_shade` (`187893603920642048`)

## Community and help

- [lmstudio-js GitHub](https://github.com/lmstudio-ai/lmstudio-js)
- [LM Studio documentation](https://lmstudio.ai/docs)
- [LM Studio Discord](https://discord.gg/6Q7Xn6MRVS)
- [LM Studio on X](https://twitter.com/LMStudioAI)
