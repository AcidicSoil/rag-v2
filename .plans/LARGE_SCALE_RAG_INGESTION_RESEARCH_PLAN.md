# Large-Scale RAG Ingestion Research Plan

## Goal
Ingest and serve very large corpora without destroying the model context window.

The design target is:
- **ingest once, retrieve many times**
- **never treat raw corpus size as prompt size**
- **separate overview questions from lookup questions**
- **compress aggressively before prompt assembly, not after the fact**

## Current repo position
This repository already has strong foundations:
- filesystem browse / inspect / bounded read tools
- route-aware large-corpus handling (`sample`, `global-summary`, `hierarchical-retrieval`)
- directory manifests and file synopses
- hybrid retrieval support
- heuristic + optional model-assisted rerank
- plugin/MCP shared orchestrator

This means the next step is not "add basic RAG". It is to evolve the system into a **progressive ingestion + multistage retrieval** pipeline.

## Research-backed takeaways

### 1. Long context is not the same as effective context
Even long-context models degrade when relevant information is buried in the middle of very long inputs. So the solution is **better retrieval and compression**, not simply pasting more corpus text into the prompt.

### 2. Use hierarchical representations for global questions
For "what is in this corpus overall?" style questions, chunk retrieval alone is the wrong primitive. A better approach is to retrieve across:
- corpus manifests
- file synopses
- section summaries
- chunk-level evidence only when needed

### 3. Preserve chunk context at embedding time
Naive small independent chunks lose surrounding context. Better ingestion should preserve neighborhood context when generating embeddings or retrieval metadata.

### 4. Use hybrid retrieval and reranking before prompt assembly
A scalable pipeline should retrieve broadly, rerank narrowly, and prompt with only the best evidence. Sparse+dense fusion and a reranker are more efficient than raising prompt size.

### 5. Cache representations and invalidate incrementally
Large-corpus systems should persist manifests, summaries, embeddings, and indexes by path/content hash or mtime so repeated use does not re-ingest everything.

## Core recommendation
The best path for this repo is a **five-layer ingestion stack**:

1. **Manifest layer**
   - directory/file inventory
   - extension mix
   - size stats
   - representative files
   - oversized-file flags

2. **Synopsis layer**
   - bounded file head/tail samples
   - format detection
   - short file-level synopsis
   - optional field/schema hints for structured corpora

3. **Section/chunk layer**
   - parent/child chunking
   - chunk embeddings
   - sparse terms / BM25 support
   - retrieval metadata

4. **Hierarchy layer**
   - section summaries
   - file summaries
   - optional corpus/topic summaries
   - optional cluster/community reports for huge corpora

5. **Serving layer**
   - route selection
   - query rewrite / decomposition
   - sparse+dense retrieval
   - rerank
   - strict prompt budget enforcement

## Recommended architecture for this repo

### Phase 1 — Make ingestion explicitly offline/persistent
Current behavior is still too request-coupled.

Add an ingestion/indexing subsystem that can persist:
- directory manifests
- file synopses
- document chunk maps
- embeddings
- sparse lexical indexes
- hierarchical summaries

Recommended cache keys:
- normalized path
- file size
- modified time
- optional content hash for high-confidence invalidation

Outcome:
- first touch inspects/samples
- later runs reuse indexes instead of reparsing large corpora

### Phase 2 — Add parent/child retrieval as the default for large text corpora
For large text files and datasets, index:
- **parent sections** (broader semantic units)
- **child chunks** (fine-grained retrieval units)

Retrieval flow:
1. retrieve candidate child chunks
2. lift to parent sections/files
3. rerank on parent + child evidence
4. prompt with short parent context plus minimal child evidence

Outcome:
- reduces prompt token waste
- preserves surrounding context better than raw chunk-only retrieval

### Phase 3 — Add contextual chunk generation / embedding
Upgrade ingestion from naive chunking to contextual chunking:
- chunk with overlap and structural awareness
- attach heading / document / nearby summary context as metadata
- optionally adopt late chunking or contextual embedding generation where your embedding stack allows it

Practical first step for this repo:
- enrich chunk metadata with:
  - file synopsis
  - section heading
  - nearby heading trail
  - document type / detected format

Outcome:
- better retrieval quality without larger prompt payloads

### Phase 4 — Separate global-summary retrieval from local lookup retrieval
Formalize two serving modes:

#### Global / overview mode
Use:
- manifests
- synopses
- file summaries
- corpus summaries

Avoid:
- raw chunk flooding

#### Local / lookup mode
Use:
- query rewrite / decomposition
- chunk retrieval
- parent-section expansion
- rerank

Outcome:
- overview questions stop competing with lookup queries for the same retrieval strategy

### Phase 5 — Add strict prompt budget orchestration
Every route should assemble context from a budget, not a fixed top-K.

Recommended budgeting:
- reserve tokens for system/user/instructions
- reserve tokens for answer generation
- allocate the remaining retrieval budget dynamically
- prefer more sources with shorter excerpts over fewer giant excerpts
- cap duplicate evidence from the same file/section

Budget policy example:
- 15% instructions / wrappers
- 20–30% answer allowance
- 55–65% retrieval evidence budget

Within evidence budget:
- summary routes: mostly manifests/synopses
- lookup routes: mostly parent+child evidence

## Retrieval stack recommendation

### Baseline stack to target
1. query classification (overview vs lookup vs structured extraction)
2. optional query rewrite / decomposition
3. hybrid sparse+dense retrieval
4. rerank top candidates
5. parent/section expansion
6. prompt assembly under token budget

### Best next retrieval upgrades
- **Contextual retrieval** style enrichment for chunks and BM25 terms
- **Late chunking** or equivalent contextual embedding production for long documents
- **ColBERT-style late interaction** only if you later need higher recall/precision at larger scale and can afford index complexity
- **HyDE** only as an optional fallback for weak zero-shot retrieval cases, not as the default path

## Structured-data specific ingestion guidance
For corpora like chat exports / JSONL / event logs:
- do not treat each giant file as plain prose
- parse into record-level units with stable metadata
- build indexes over:
  - conversation/session id
  - timestamp ranges
  - participant/role
  - topic / tags / inferred schema
  - text content

Recommended representations:
- file synopsis
- schema synopsis
- time-range synopsis
- topic histogram / sample entities
- record-level chunks for retrieval

Outcome:
- overview questions can use summaries/histograms
- lookup questions can retrieve exact records
- prompt context stays tiny compared to corpus size

## What to avoid
- ingesting whole giant files directly into prompt context
- using one universal chunk size for every file type
- relying on embeddings alone for exact ids / timestamps / rare strings
- returning top-K chunks without dedupe, parent expansion, or rerank
- rebuilding the whole index on every request
- answering overview questions from raw retrieval snippets only

## Proposed implementation sequence

### Stage A — Persistent ingestion/index layer
1. add an index manifest format
2. persist directory manifests + file synopses
3. persist chunk maps and retrieval metadata
4. add invalidation by mtime/size/hash

### Stage B — Parent/child retrieval path
1. add structural chunker
2. add parent-section index
3. return parent+child candidates from retrieval
4. update reranker and evidence packer to use parent/child diversity

### Stage C — Structured corpus ingestion
1. add JSONL / JSON transcript-aware parser
2. derive schema + field summaries
3. index records with metadata filters
4. add time/topic/entity summary documents

### Stage D — Budgeted prompt assembly
1. centralize retrieval token budget policy
2. add per-route budget templates
3. cap per-file contribution
4. add evidence compression for repeated/similar chunks

### Stage E — Optional advanced retrieval upgrades
1. contextual chunk metadata expansion
2. contextual BM25 / retrieval enrichment
3. late chunking evaluation path
4. optional ColBERT-style high-recall tier for very large corpora

## Validation plan
You should measure improvement with route-specific evals:

### Overview evals
- "what is in this dataset overall?"
- "what themes dominate this corpus?"
- "what file types and modalities are present?"

### Lookup evals
- exact id / timestamp lookup
- topic-specific retrieval
- cross-file evidence linking

### Budget evals
- prompt token counts by route
- evidence-block count by route
- answer quality vs prompt size

### Indexing evals
- cold-ingest latency
- warm-query latency
- cache hit rates
- invalidation correctness

## Concrete recommendation for this repo
Best next move:
- **build persistent progressive indexing first**
- then **add parent/child retrieval for large text corpora**
- then **add structured corpus ingestion for JSONL/chat datasets**

That sequence gives the largest win per unit of complexity and fits the architecture you already have.

## Success criteria
- corpus size can grow by orders of magnitude without comparable prompt growth
- overview questions are answered from manifests/summaries, not raw text dumps
- lookup questions retrieve precise evidence without flooding the prompt
- repeated queries reuse persisted indexes instead of re-ingesting everything
- prompt assembly is budgeted and route-aware by default
