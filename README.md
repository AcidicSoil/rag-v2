# RAG v2 - LM Studio Plugin

`rag-v2` is an LM Studio prompt-preprocessor plugin that improves document-grounded chat with a stronger fast-path RAG pipeline.

It keeps the simple workflow that makes prompt preprocessors convenient, but adds better retrieval decisions, multi-query candidate generation, optional hybrid semantic-plus-lexical retrieval, evidence cleanup, safer prompt injection, and lightweight evaluation so changes can be validated instead of guessed.

## What this plugin does

When a user attaches documents in LM Studio, the plugin decides how to inject helpful context into the model prompt:

- for small inputs, it can inject the full document content directly
- for larger inputs, it runs retrieval and injects only the most relevant evidence
- for casual, ambiguous, or likely unanswerable prompts, it can avoid wasted retrieval or steer the conversation more safely

The result is a document-RAG workflow that is faster on easy cases, more selective on large cases, and more grounded when evidence is weak.

## Showcase of the current feature set

### 1) Two context-injection strategies
The plugin chooses between two main paths:

- **Inject full content**: best for small files that comfortably fit in context
- **Retrieval path**: best for larger files where only a few evidence chunks should be injected

This preserves a low-friction fast path while still supporting larger documents.

### 2) Answerability gate
Before retrieval, the plugin can classify the user prompt into one of four buckets:

- **no-retrieval-needed**: casual or conversational prompts like `thanks`
- **ambiguous**: short or unclear follow-ups that do not identify which file to use
- **likely-unanswerable**: prompts that appear external or time-sensitive relative to the attached files
- **retrieval-useful**: prompts that likely should be answered from the provided documents

This helps the plugin avoid unnecessary retrieval work and reduces confident wrong answers for prompts that are not really document-grounded.

### 3) Deterministic multi-query retrieval
For retrieval-heavy prompts, the plugin can generate multiple query variants instead of relying on a single embedding lookup.

Current rewrite styles include:

- **original**
- **keywords**
- **decomposed**
- **quoted-span**

These rewrites are fused into a shared candidate pool, which improves recall on prompts that contain mixed wording, quoted spans, or multi-part questions.

### 4) Optional hybrid retrieval
When enabled, the plugin can blend two retrieval styles instead of depending on embeddings alone:

- **semantic retrieval** from LM Studio's file retrieval pipeline
- **local lexical retrieval** over parsed document content

The lexical side is especially useful for:

- exact terms and rare phrases
- quoted spans
- section titles and heading breadcrumbs
- cases where a chunk is textually relevant even if embedding similarity is weaker

Hybrid retrieval merges both candidate pools with configurable semantic and lexical weights before reranking.

### 5) Fusion and reranking
After retrieval, the plugin can:

- fuse results across multiple query variants
- optionally merge semantic and lexical candidate pools in hybrid mode
- rerank fused candidates with a lightweight heuristic reranker

The current reranker favors evidence that is not just topically similar, but also more useful for answering:

- lexical overlap with the user question
- heading match
- completeness of the candidate chunk
- section relevance
- diversity penalty to reduce redundant evidence

This helps promote evidence that better supports an answer instead of blindly trusting the highest semantic score.

### 6) Evidence packaging and dedupe
Retrieved chunks are not injected as raw unstructured text.

Instead, the plugin:

- removes near-duplicate evidence from the same file
- builds labeled evidence blocks
- includes provenance cues like file name and score
- limits the number of blocks injected into the final prompt

This keeps the model context cleaner and makes citation grounding more useful.

### 7) Safer retrieved-text injection
Attached files are treated as untrusted input, not instructions.

The plugin can:

- sanitize noisy retrieved text
- strip obvious instruction-like spans from retrieved evidence
- wrap injected evidence with stronger grounding instructions

Grounding modes currently include:

- `off`
- `warn-on-weak-evidence`
- `require-evidence`

This reduces the chance that hostile or noisy document text will steer the model away from the actual user task.

### 8) Built-in validation workflow
The repo now includes both smoke tests and a lightweight eval harness.

That makes it possible to validate retrieval-quality changes locally before relying on LM Studio UI behavior alone.

## How the pipeline works

At a high level, the plugin follows this flow:

1. inspect the user prompt and attached files
2. optionally run the answerability gate
3. choose full-content injection or retrieval
4. optionally generate multiple retrieval rewrites
5. optionally merge semantic and lexical candidates in hybrid mode
6. fuse and rerank candidate evidence
7. dedupe and sanitize evidence blocks
8. inject grounded evidence plus the user query back into the model prompt

Most of the retrieval-quality logic is centralized in `src/promptPreprocessor.ts`, with supporting modules for gating, rewriting, fusion, hybrid retrieval, reranking, evidence handling, safety, and evaluation.

## Getting started

### Development
Run the plugin in dev mode:

```bash
lms dev
```

This should start the plugin watcher and register the prompt preprocessor with LM Studio.

### MCP server (stdio)
The repository now also includes an SDK-backed MCP stdio server entrypoint for local MCP hosts.

Run it directly with:

```bash
npm run mcp:stdio
```

This starts the MCP server over stdio and exposes four tools:

- `rag_answer`
- `rag_search`
- `corpus_inspect`
- `rerank_only`

Important:

- do not print to stdout from the MCP server path outside the protocol itself
- use stderr for logs and debugging output
- the current MCP runtime supports inline documents, pre-chunked candidates, and real filesystem `paths`

### LM Studio `mcp.json` example
LM Studio supports local MCP servers through `mcp.json` using Cursor-style notation.

A ready-to-copy example is included at:

```text
examples/lmstudio.mcp.json
```

Example:

```json
{
  "mcpServers": {
    "rag-v2-local": {
      "command": "npm",
      "args": ["run", "mcp:stdio"],
      "cwd": "/absolute/path/to/rag-v2"
    }
  }
}
```

Replace the `cwd` value with the absolute path to this repository before adding it to your LM Studio `mcp.json`.

### MCP host notes
The MCP path is currently best suited for local hosts that can launch stdio servers with a working directory, such as LM Studio and other local MCP-compatible desktop clients.

The current MCP runtime supports three corpus-input styles:

- inline `documents`
- filesystem `paths`
- pre-supplied `chunks`

### Publishing
Publish or update the plugin on LM Studio Hub:

```bash
lms push
```

## Validation and testing

### Smoke tests
Component-level smoke tests are available for the main retrieval-quality slices:

```bash
npm run smoke:multi-query
npm run smoke:evidence
npm run smoke:safety
npm run smoke:rerank
npm run smoke:hybrid
npm run smoke:core
npm run smoke:core-policy
npm run smoke:mcp
npm run smoke:mcp-filesystem
```

These are intended to quickly verify deterministic logic in isolation.

### Eval suites
Run the lightweight regression harness with:

```bash
npm run eval
```

The eval runner reads every JSONL suite in `eval/cases/` and writes the latest aggregated results to:

```text
eval/results/all-latest.json
```

Current suites include:

- `basic.jsonl` for core sanity coverage
- `hard.jsonl` for tougher ambiguity, no-match, rewrite, rerank, and hybrid-retrieval checks

### Live LM Studio validation
For manual runtime validation in the actual LM Studio UI, use:

- `LIVE_TEST_SCRIPT.md`
- `manual-tests/README.md`
- `manual-tests/fixtures/`

These files provide repeatable prompts and fixtures for validating gate behavior, retrieval behavior, and grounding behavior against the running plugin.

## Configuration

The plugin can be configured from the LM Studio UI.

### Embedding and retrieval base settings
- **Embedding Model**: choose a specific embedding model or use auto-detect
- **Manual Model ID (Optional)**: override auto-detection with an exact model ID
- **Auto-Unload Model**: unload the embedding model after retrieval finishes
- **Retrieval Limit**: maximum number of chunks to retrieve per retrieval run
- **Retrieval Affinity Threshold**: minimum similarity score for a chunk to survive filtering

### Answerability gate settings
- **Answerability Gate**: enable or disable pre-retrieval prompt classification
- **Gate Confidence Threshold**: minimum confidence required for early gate actions
- **Ambiguous Query Behavior**: choose whether ambiguous prompts ask for clarification or continue best-effort

### Multi-query retrieval settings
- **Multi-Query Retrieval**: enable deterministic query rewrites
- **Multi-Query Count**: cap how many rewrite variants are used
- **Fusion Method**: choose how multi-query results are combined
- **Max Candidates Before Rerank**: maximum number of fused candidates kept before reranking

### Hybrid retrieval settings
- **Hybrid Retrieval**: blend semantic retrieval with local lexical candidate scoring
- **Lexical Weight**: control how strongly local lexical matches affect the merged candidate pool
- **Semantic Weight**: control how strongly LM Studio semantic retrieval affects the merged candidate pool
- **Hybrid Candidate Count**: cap how many merged semantic and lexical candidates are retained

### Reranking and evidence settings
- **Rerank Fused Candidates**: enable heuristic reranking after fusion
- **Rerank Top K**: number of reranked candidates retained
- **Rerank Strategy**: choose the current reranking strategy
- **Evidence Dedupe Threshold**: threshold used to drop near-duplicate evidence from the same file
- **Max Evidence Blocks**: cap how many evidence blocks are injected

### Safety and grounding settings
- **Sanitize Retrieved Text**: normalize retrieved text before injection
- **Strip Instruction-Like Spans**: replace obvious instruction-like retrieved content with a neutral placeholder
- **Strict Grounding Mode**: control how strongly the final prompt requires evidence-backed answers

## Repository highlights

- `src/promptPreprocessor.ts`: main prompt-preprocessor pipeline
- `src/gating.ts`: answerability and ambiguity heuristics
- `src/queryRewrite.ts`: deterministic query rewrites
- `src/fusion.ts`: multi-query fusion logic
- `src/lexicalRetrieve.ts`: local lexical chunking and scoring
- `src/hybridRetrieve.ts`: semantic-plus-lexical candidate merging
- `src/rerank.ts`: heuristic evidence reranking
- `src/evidence.ts`: evidence formatting and dedupe
- `src/safety.ts`: sanitization and grounding helpers
- `src/core/`: transport-agnostic retrieval and policy helpers
- `src/mcp/`: MCP contracts, handlers, runtimes, and stdio server entrypoints
- `scripts/`: smoke tests and eval runner
- `eval/cases/`: regression case suites
- `manual-tests/`: live-test fixtures and guidance
- `examples/lmstudio.mcp.json`: local MCP host config example

## Current status

The repository currently includes:

- answerability gating
- multi-query retrieval scaffolding
- optional hybrid semantic-plus-lexical retrieval
- fusion and heuristic reranking
- evidence dedupe and packaging
- safer retrieved-text handling
- smoke tests for major retrieval-quality components
- multi-suite regression eval coverage
- an SDK-backed MCP stdio server path with local filesystem loading
- LM Studio-compatible `mcp.json` example configuration

A focused LM Studio live-validation pass is still the best way to tune defaults and confirm end-to-end behavior against real attached files.

## Author

- **GitHub**: [AcidicSoil](https://github.com/AcidicSoil)
- **X (Twitter)**: [@d1rt7d4t4](https://x.com/d1rt7d4t4)
- **Discord**: the_almighty_shade (ID: 187893603920642048)

## Community & Help

- [lmstudio-js GitHub](https://github.com/lmstudio-ai/lmstudio-js)
- [Documentation](https://lmstudio.ai/docs)
- [Discord](https://discord.gg/6Q7Xn6MRVS)
- [Twitter](https://twitter.com/LMStudioAI)
