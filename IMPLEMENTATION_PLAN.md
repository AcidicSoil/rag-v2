# RAG Plugin Implementation Plan

## Objective
Upgrade the current LM Studio document RAG plugin from a simple prompt-preprocessor flow into a stronger, measurable, and safer RAG system while preserving a working fast path.

The plan is intentionally staged:
- keep the current prompt preprocessor working first
- improve retrieval quality and reliability inside the current architecture
- only later add agentic retrieval with a tools provider


## Active execution task list

### Immediate implementation slice
- [x] Review the existing plan, current codebase, and prior maintenance notes.
- [x] Identify the smallest high-value implementation slice that fits the current architecture.
- [x] Implement Phase 1A foundation: heuristic answerability gate types, logic, and config.
- [x] Wire the answerability gate into the prompt preprocessor before retrieval.
- [x] Validate the new gate with TypeScript and targeted code review.
- [x] Create `LIVE_TEST_SCRIPT.md` for repeatable LM Studio runtime validation.
- [ ] Refine the heuristic thresholds and messages based on validation findings.

### Next queued tasks
- [ ] Add Phase 1A eval cases for no-match and ambiguous prompts.
- [ ] Implement Phase 1B deterministic multi-query rewrite scaffolding.
- [ ] Add Phase 1C evidence dedupe and neighbor expansion.
- [ ] Add Phase 1D retrieved-text sanitization and grounding wrapper.
- [ ] Build Phase 0 evaluation harness and baseline metrics output.

---

## Current baseline

### Existing behavior
- `src/index.ts`
  - registers config schematics
  - registers the prompt preprocessor
- `src/config.ts`
  - plugin config fields for embedding selection, unloading, retrieval limit, and threshold
- `src/promptPreprocessor.ts`
  - decides whether to inject full file content or run retrieval
  - parses documents
  - retrieves relevant chunks
  - adds citations

### Recently fixed issues
- missing `LLMDynamicHandle` import
- downloaded embedding model lookup now uses the typed embedding API and `modelKey`
- context measurement now appends the active user prompt before applying the model prompt template

### Constraint to keep in mind
The prompt preprocessor is still the best fit for the simple fast path. More advanced iterative retrieval should be added later via a tools provider rather than overloading the preprocessor.

---

## Deliverables by phase

## Phase 0 — Baseline evaluation and instrumentation

### Goal
Create a repeatable way to measure whether changes improve the plugin.

### Work items
1. Add an evaluation corpus.
2. Add a simple runner for end-to-end plugin pipeline evaluation.
3. Add metrics capture for retrieval quality, answer grounding, and latency.

### Files to add
- `eval/cases/basic.jsonl`
- `eval/cases/hard.jsonl`
- `scripts/eval.ts`
- `src/metrics.ts`
- `src/types/eval.ts`

### Eval case schema
Each case should include:
- `id`
- `files`
- `question`
- `expected_answer_points`
- `expected_sources`
- `answerability`
- `difficulty`

### Metrics to track
- retrieval hit rate
- citation coverage
- unsupported-claim count
- no-match correctness
- average latency
- average injected tokens
- chunk redundancy rate

### Acceptance criteria
- a single command runs the eval suite
- baseline metrics are saved to JSON
- current plugin behavior is captured before further changes

### Suggested task checklist
- [ ] create `eval/` folder structure
- [ ] define JSONL schema
- [ ] add 30–50 initial cases
- [ ] add `scripts/eval.ts`
- [ ] write eval output to `eval/results/`
- [ ] document how to run evals in `README.md`

---

## Phase 1 — v2.1 fast-path upgrade inside the prompt preprocessor

### Goal
Improve answerability handling, retrieval quality, evidence quality, and safety without changing plugin type.

### 1A. Answerability / retrieval-utility gate

#### Goal
Predict whether retrieval is likely useful before paying the full retrieval cost.

#### Behavior
Classify each request into one of:
- no retrieval needed
- retrieval likely useful
- likely unanswerable from provided files
- ambiguous / clarification needed

#### Files to add
- `src/gating.ts`
- `src/types/gating.ts`

#### Changes to existing files
- `src/promptPreprocessor.ts`
  - call gate before retrieval strategy selection
  - allow early return for no-match / clarification cases
- `src/config.ts`
  - add gate-related config fields

#### New config fields
- `answerabilityGateEnabled`
- `answerabilityGateThreshold`
- `ambiguousQueryBehavior`

#### Suggested implementation order
1. heuristic gate first
2. optional small-model judge later

#### Acceptance criteria
- no-match questions avoid unnecessary retrieval
- ambiguous questions can produce a clarification instruction path
- eval shows improved no-match handling

#### Checklist
- [ ] implement query heuristic features
- [ ] add gate result type
- [ ] wire gate into preprocessor
- [ ] add config fields
- [ ] add eval cases for no-match and ambiguous prompts

---

### 1B. Multi-query rewrite and fusion

#### Goal
Retrieve from multiple query variants and fuse the results.

#### Query variants
- literal rewrite
- keyword-focused rewrite
- acronym-expanded rewrite
- decomposed sub-question rewrite

#### Files to add
- `src/queryRewrite.ts`
- `src/fusion.ts`
- `src/types/retrieval.ts`

#### Changes to existing files
- `src/promptPreprocessor.ts`
  - replace single-query retrieval path with multi-query candidate generation
- `src/config.ts`
  - add fusion configuration

#### New config fields
- `multiQueryEnabled`
- `multiQueryCount`
- `fusionMethod`
- `maxCandidatesBeforeRerank`

#### Acceptance criteria
- retrieval can run on multiple rewrites
- results are deduplicated and fused
- citation recall improves on eval set without large latency regression

#### Checklist
- [ ] implement rewrite generator interface
- [ ] implement initial deterministic rewrites
- [ ] add reciprocal-rank fusion
- [ ] add dedupe step after fusion
- [ ] expose config fields

---

### 1C. Evidence packaging, dedupe, and neighbor expansion

#### Goal
Pass better evidence to the model than raw top chunks.

#### Behavior
Each evidence block should include:
- file name
- section or heading if available
- page number if available
- matched chunk text
- optional neighboring chunk text
- provenance label for citation formatting

#### Files to add
- `src/evidence.ts`
- `src/types/evidence.ts`

#### Changes to existing files
- `src/promptPreprocessor.ts`
  - use evidence packaging before injecting retrieval content

#### New config fields
- `neighborWindow`
- `dedupeSimilarityThreshold`
- `maxEvidenceBlocks`

#### Acceptance criteria
- repeated or near-identical chunks are reduced
- answers get better local context around retrieved evidence
- citation quality improves

#### Checklist
- [ ] add evidence block type
- [ ] add near-duplicate filtering
- [ ] add neighbor expansion
- [ ] include structural metadata in formatted retrieval content

---

### 1D. Retrieved-text safety and injection hardening

#### Goal
Treat file content as untrusted data.

#### Files to add
- `src/safety.ts`
- `src/types/safety.ts`

#### Changes to existing files
- `src/promptPreprocessor.ts`
  - sanitize and wrap evidence before injecting it
- `src/config.ts`
  - add safety options

#### New config fields
- `sanitizeRetrievedText`
- `stripInstructionalSpans`
- `strictGroundingMode`

#### Acceptance criteria
- retrieved text is normalized before injection
- the injected prompt explicitly treats retrieved content as data, not instructions
- malicious-looking spans are reduced or flagged

#### Checklist
- [ ] normalize unicode and spacing
- [ ] sanitize markdown/html-ish content
- [ ] add instruction wrapper around evidence blocks
- [ ] optionally downweight imperative text spans

---

## Phase 2 — v2.2 retrieval core rebuild

### Goal
Upgrade the underlying retrieval engine with adaptive chunking, hybrid retrieval, and reranking.

### 2A. Adaptive and structure-aware chunking

#### Goal
Move from flat text assumptions to document-structure-aware chunking.

#### Files to add
- `src/chunking.ts`
- `src/documentModel.ts`
- `src/types/document.ts`

#### Chunking modes
- prose mode
- section-heading mode
- page-plus-section mode
- fallback fixed-token mode

#### New config fields
- `chunkingMode`
- `targetChunkTokens`
- `maxChunkTokens`
- `structureAwareChunking`

#### Acceptance criteria
- chunks preserve major structure boundaries where possible
- section metadata is preserved for later ranking and citation formatting

#### Checklist
- [ ] define normalized document section model
- [ ] add parser-to-structure conversion helpers
- [ ] implement heading-aware chunker
- [ ] implement prose chunker
- [ ] add chunk metadata

---

### 2B. Hybrid retrieval

#### Goal
Combine semantic retrieval with lexical retrieval.

#### Files to add
- `src/lexicalRetrieve.ts`
- `src/hybridRetrieve.ts`
- `src/indexing.ts`

#### Approach
- semantic retrieval from LM Studio embedding/file APIs
- local lexical scoring over parsed chunks
- merge and score both candidate sets

#### New config fields
- `hybridEnabled`
- `lexicalWeight`
- `semanticWeight`
- `hybridCandidateCount`

#### Acceptance criteria
- lexical-only matches improve for exact terms and rare phrases
- merged candidate pool outperforms semantic-only baseline on evals

#### Checklist
- [ ] implement lexical scoring over chunk text and headings
- [ ] merge semantic and lexical candidate lists
- [ ] expose weights in config
- [ ] add eval cases for exact-match terminology queries

---

### 2C. Reranking for evidence suitability

#### Goal
Select evidence that is sufficient and complementary, not just topically similar.

#### Files to add
- `src/rerank.ts`
- `src/types/rerank.ts`

#### Reranking strategy
Version 1:
- heuristic reranker using:
  - lexical overlap
  - heading match
  - completeness score
  - diversity penalty
  - section relevance

Version 2:
- optional model-based reranker for top candidate set

#### New config fields
- `rerankEnabled`
- `rerankTopK`
- `rerankStrategy`

#### Acceptance criteria
- top evidence set is less redundant
- answer-supporting evidence improves on eval set

#### Checklist
- [ ] define rerank feature set
- [ ] implement heuristic reranker
- [ ] integrate with evidence packaging
- [ ] add optional model-based rerank hook

---

## Phase 3 — v3 agentic retrieval with tools provider

### Goal
Support iterative, multi-hop, or clarification-heavy retrieval workflows.

### Rationale
This should be implemented as a tools provider rather than forcing it into the prompt preprocessor.

### Files to add
- `src/toolsProvider.ts`
- `src/tools/searchFiles.ts`
- `src/tools/readSection.ts`
- `src/tools/readNeighbors.ts`
- `src/tools/listHeadings.ts`
- `src/tools/verifyClaim.ts`
- `src/types/tools.ts`

### Changes to existing files
- `src/index.ts`
  - register tools provider when enabled
- `src/config.ts`
  - add agentic mode settings

### New config fields
- `agenticModeEnabled`
- `maxToolCalls`
- `toolReadWindow`
- `verificationEnabled`

### Initial tool set
- `search_files(query)`
- `read_section(file, sectionId)`
- `read_neighbors(file, chunkId, window)`
- `list_headings(file)`
- `verify_claim(claim, evidenceIds)`

### Acceptance criteria
- complex questions can retrieve iteratively
- multi-hop answers improve compared with single-shot retrieval
- tool traces are observable in LM Studio

### Checklist
- [ ] add tools-provider registration
- [ ] define tool schemas
- [ ] implement file search tool
- [ ] implement structured read tools
- [ ] gate advanced mode behind config

---

## Phase 4 — Verification and grounded generation

### Goal
Reduce unsupported claims in generated answers.

### Files to add
- `src/verify.ts`
- `src/claimSplit.ts`
- `src/types/verify.ts`

### Behavior
- generate a draft answer
- split into claims or sentences
- verify each claim against selected evidence
- rewrite, remove, or downgrade unsupported claims

### New config fields
- `claimVerificationEnabled`
- `maxClaimsToVerify`
- `unsupportedClaimBehavior`

### Acceptance criteria
- unsupported-claim rate decreases on evals
- citation linkage remains intact

### Checklist
- [ ] add claim splitter
- [ ] add evidence-check function
- [ ] add unsupported-claim policy behaviors
- [ ] record verification outcomes in eval logs

---

## Phase 5 — Reliability and security hardening

### Goal
Make the plugin safer and more robust against hostile or messy documents.

### Files to add
- `src/sanitize.ts`
- `src/policy.ts`
- `src/types/policy.ts`

### Work items
- parse-time sanitization
- suspicious-span detection
- attribution-gated answering
- quarantine handling for risky document types

### Acceptance criteria
- risky content is flagged or neutralized before reaching generation
- grounded-answer behavior stays consistent under hostile inputs

### Checklist
- [ ] add document sanitization pipeline
- [ ] add suspicious span rules
- [ ] add strict attribution mode
- [ ] add security-focused eval cases

---

## Config roadmap

## Immediate config additions for v2.1
Add these to `src/config.ts`:
- `answerabilityGateEnabled`
- `answerabilityGateThreshold`
- `ambiguousQueryBehavior`
- `multiQueryEnabled`
- `multiQueryCount`
- `fusionMethod`
- `maxCandidatesBeforeRerank`
- `neighborWindow`
- `dedupeSimilarityThreshold`
- `maxEvidenceBlocks`
- `sanitizeRetrievedText`
- `stripInstructionalSpans`
- `strictGroundingMode`

## Later config additions
- `chunkingMode`
- `targetChunkTokens`
- `maxChunkTokens`
- `structureAwareChunking`
- `hybridEnabled`
- `lexicalWeight`
- `semanticWeight`
- `hybridCandidateCount`
- `rerankEnabled`
- `rerankTopK`
- `rerankStrategy`
- `agenticModeEnabled`
- `maxToolCalls`
- `toolReadWindow`
- `verificationEnabled`
- `claimVerificationEnabled`
- `maxClaimsToVerify`
- `unsupportedClaimBehavior`

---

## Recommended implementation order

### Milestone 1
Phase 0 + Phase 1A
- baseline eval harness
- answerability gate

### Milestone 2
Phase 1B + Phase 1C
- multi-query rewrite
- fusion
- evidence dedupe and neighbor expansion

### Milestone 3
Phase 1D + cleanup
- sanitization and strict grounding behavior
- polish current prompt-preprocessor flow

### Milestone 4
Phase 2A + Phase 2B + Phase 2C
- chunking
- hybrid retrieval
- reranking

### Milestone 5
Phase 3 + Phase 4
- tools provider
- verification pipeline

### Milestone 6
Phase 5
- security and reliability hardening

---

## Definition of success
The plugin should improve along these axes while remaining usable inside LM Studio:
- better no-match behavior
- higher citation coverage
- lower unsupported-claim rate
- better retrieval for rare or exact terminology
- less redundant evidence injection
- manageable latency
- safer handling of hostile document content

---

## Immediate next action
Start with:
1. `Phase 0` baseline eval harness
2. `Phase 1A` answerability gate
3. `Phase 1B` multi-query rewrite and fusion
4. `Phase 1C` evidence packaging and neighbor expansion
5. `Phase 1D` retrieved-text safety wrapper

This is the best first cut because it materially improves the current plugin without forcing an architectural jump before there is measurement in place.
