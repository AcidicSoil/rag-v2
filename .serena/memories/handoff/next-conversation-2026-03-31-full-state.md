# Full handoff summary — 2026-03-31

## User intent / architectural decision
The user asked whether MCP support should live in a new project/repo or under `packages/`.
Decision agreed with user:
- do NOT create a new repo yet
- keep one repo
- next structural step should be a `packages/` workspace layout:
  - `packages/core`
  - `packages/adapter-lmstudio`
  - `packages/mcp-server`

Reasoning:
- LM Studio plugin + MCP server still share substantial logic
- boundaries are still moving
- shared smoke tests/evals/docs are easier in one repo
- separate repos only make sense later if release cadence/ownership/product identity diverge

## Already-implemented work in this conversation series

### 1) Core extraction / transport-agnostic logic
Portable logic has been extracted under `src/core/`:
- `contracts.ts`
- `retrievalPipeline.ts`
- `policyContracts.ts`
- `rewrite.ts`
- `gating.ts`
- `corrective.ts`
- `safety.ts`
- `runtimeContracts.ts`
- `localRetrieval.ts`

This covers:
- fusion
- hybrid merge
- heuristic rerank
- dedupe
- evidence assembly
- rewrite generation
- answerability gate
- corrective assessment / planning
- safety / grounding helpers
- local lexical retrieval over portable documents

### 2) LM Studio adapter path still preserved
The LM Studio plugin path still compiles and uses bridge/wrapper layers so behavior remains intact while logic lives behind core boundaries.
Important bridge file:
- `src/lmstudioCoreBridge.ts`

Wrapper files now mostly delegate to core:
- `src/gating.ts`
- `src/queryRewrite.ts`
- `src/corrective.ts`
- `src/safety.ts`

Main LM Studio entrypoint path remains in:
- `src/index.ts`
- `src/promptPreprocessor.ts`
- `src/config.ts`

### 3) Corrective retrieval implemented earlier
There is already a corrective retrieval layer in the prompt preprocessor path:
- evidence quality grading
- multi-aspect coverage checks
- bounded corrective retry loop
- config knobs added in `src/config.ts`

### 4) MCP path now exists in-repo
Files added for MCP side:
- `src/mcp/contracts.ts`
- `src/mcp/handlers.ts`
- `src/mcp/defaultRuntime.ts`
- `src/mcp/sdkServer.ts`
- `src/mcp/stdioServer.ts`

This MCP path now includes:
- request/response schemas for tools:
  - `rag_answer`
  - `rag_search`
  - `corpus_inspect`
  - `rerank_only`
- runtime interfaces for:
  - loading
  - retrieval
  - answer composition
  - inspection
- handler layer that validates + dispatches
- real filesystem loading for `paths`
- inline `documents` support
- pre-chunked `chunks` support
- shared lexical retrieval over loaded local documents

### 5) Official SDK-backed stdio server
We replaced the hand-rolled stdio JSON-RPC shim with the official MCP SDK path via:
- dependency: `@modelcontextprotocol/sdk`
- server wrapper in `src/mcp/sdkServer.ts`
- entrypoint in `src/mcp/stdioServer.ts`

Important implementation notes:
- The attempted newer split package `@modelcontextprotocol/server` was NOT available from npm in this environment (404). We used published `@modelcontextprotocol/sdk` instead.
- SDK type-level interop with current Zod 3 setup was heavy / awkward.
- At the SDK registration boundary, typing was relaxed using an untyped bound `registerTool` call and `as any` on input schema objects.
- Business logic validation still happens in our own handler/contracts layer, so the relaxation is only at the server wrapper boundary.
- MCP stdio logging should stay on stderr, not stdout.

### 6) Filesystem-backed MCP runtime
`src/mcp/defaultRuntime.ts` now:
- recursively loads text/code files from supplied `paths`
- supports inline docs and prechunked candidates
- filters by common text/code file extensions
- estimates tokens
- uses shared lexical retrieval from `src/core/localRetrieval.ts`

Important bug fixed:
- early filesystem loader normalized file content too aggressively and flattened structure
- fixed by preserving raw line breaks when reading files and only trimming at file boundary

### 7) Launch surface / docs
Added:
- npm script: `npm run mcp:stdio`
- example config: `examples/lmstudio.mcp.json`
- README updated with MCP server usage and LM Studio `mcp.json` example

## Tests / validation status
Smoke tests added and passing:
- `npm run smoke:core`
- `npm run smoke:core-policy`
- `npm run smoke:mcp`
- `npm run smoke:mcp-filesystem`

Also previously present / relevant:
- `npm run smoke:multi-query`
- `npm run smoke:evidence`
- `npm run smoke:safety`
- `npm run smoke:rerank`
- `npm run smoke:hybrid`
- `npm run smoke:corrective`
- `npm run smoke:model-rerank`
- `npm run eval`

Type-check note:
- plain `npx -y -p typescript tsc --noEmit` became memory-heavy after adding the MCP SDK
- successful compile used:
  - `NODE_OPTIONS=--max-old-space-size=8192 npx -y -p typescript tsc --noEmit`

## README / docs state
README now documents:
- plugin path
- MCP stdio path
- `npm run mcp:stdio`
- LM Studio `mcp.json` example
- broader smoke test list
- repo highlights including `src/core/` and `src/mcp/`

## User-approved direction at end of conversation
The user approved the decision to keep one repo and move to `packages/` rather than create a new repo.
Then user asked to “summarize and write memory”, which was done in memory:
- `handoff/next-conversation-2026-03-31-mcp-workspace-direction`

Now user requested `prepare_for_new_conversation`, so this summary is being written.

## Recommended next step in the next conversation
Do the actual workspace/package move within the same repo:
1. create workspace structure (`packages/core`, `packages/adapter-lmstudio`, `packages/mcp-server`)
2. move already-extracted `src/core/*` into `packages/core`
3. move LM Studio plugin-specific entrypoints/config/bridge into `packages/adapter-lmstudio`
4. move MCP contracts/handlers/runtime/server files into `packages/mcp-server`
5. keep root-level docs/evals/manual-tests/examples for now
6. ensure smoke tests and type-check still pass

## Caution points for next agent
- Do not split into separate repos yet unless explicitly requested.
- Preserve current behavior; this should be a packaging/layout refactor first, not a logic rewrite.
- Keep stderr-only logging for MCP stdio path.
- Expect MCP SDK typing to be touchy with current Zod 3 setup.
- If type-check gets OOM, rerun with:
  - `NODE_OPTIONS=--max-old-space-size=8192 npx -y -p typescript tsc --noEmit`
