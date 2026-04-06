import { createConfigSchematics } from "@lmstudio/sdk";

export const AUTO_DETECT_MODEL_ID = "AUTO_DETECT";

export const configSchematics = createConfigSchematics()
  .field(
    "embeddingModel",
    "select",
    {
      displayName: "Embedding Model",
      subtitle:
        "The plugin will automatically detect and use the first available embedding model.",
      options: [
        {
          value: AUTO_DETECT_MODEL_ID,
          displayName: "Auto-Detect (Use first loaded/available)",
        },
      ],
    },
    AUTO_DETECT_MODEL_ID
  )
  .field(
    "embeddingModelManual",
    "string",
    {
      displayName: "Manual Model ID (Optional)",
      subtitle:
        "Enter a specific model ID here to override the Auto-Detect selection.",
      placeholder: "e.g., text-embedding-nomic-embed-text-v1.5",
    },
    ""
  )
  .field(
    "autoUnload",
    "boolean",
    {
      displayName: "Auto-Unload Model",
      subtitle:
        "Unload the embedding model from memory immediately after retrieval finishes.",
    },
    false
  )
  .field(
    "retrievalLimit",
    "numeric",
    {
      int: true,
      min: 1,
      displayName: "Retrieval Limit",
      subtitle: "Maximum number of chunks to return.",
      slider: { min: 1, max: 10, step: 1 },
    },
    3
  )
  .field(
    "retrievalAffinityThreshold",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Retrieval Affinity Threshold",
      subtitle: "Minimum similarity score for relevance.",
      slider: { min: 0.0, max: 1.0, step: 0.01 },
    },
    0.5
  )
  .field(
    "answerabilityGateEnabled",
    "boolean",
    {
      displayName: "Answerability Gate",
      subtitle:
        "Classify prompts before retrieval to skip casual messages and catch likely no-match cases.",
    },
    true
  )
  .field(
    "answerabilityGateThreshold",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Gate Confidence Threshold",
      subtitle:
        "Minimum gate confidence required before taking an early non-retrieval path.",
      slider: { min: 0.0, max: 1.0, step: 0.01 },
    },
    0.7
  )
  .field(
    "ambiguousQueryBehavior",
    "select",
    {
      displayName: "Ambiguous Query Behavior",
      subtitle:
        "Choose whether ambiguous prompts should trigger a clarification request or continue normally.",
      options: [
        {
          value: "ask-clarification",
          displayName: "Ask for clarification",
        },
        {
          value: "attempt-best-effort",
          displayName: "Attempt best effort",
        },
      ],
    },
    "ask-clarification"
  )
  .field(
    "multiQueryEnabled",
    "boolean",
    {
      displayName: "Multi-Query Retrieval",
      subtitle:
        "Generate a few deterministic query rewrites and fuse the retrieval results.",
    },
    false
  )
  .field(
    "multiQueryCount",
    "numeric",
    {
      int: true,
      min: 1,
      max: 4,
      displayName: "Multi-Query Count",
      subtitle: "Maximum number of query variants to run during retrieval.",
      slider: { min: 1, max: 4, step: 1 },
    },
    3
  )
  .field(
    "fusionMethod",
    "select",
    {
      displayName: "Fusion Method",
      subtitle: "How to combine results from multiple retrieval queries.",
      options: [
        {
          value: "reciprocal-rank-fusion",
          displayName: "Reciprocal rank fusion",
        },
        {
          value: "max-score",
          displayName: "Max score",
        },
      ],
    },
    "reciprocal-rank-fusion"
  )
  .field(
    "maxCandidatesBeforeRerank",
    "numeric",
    {
      int: true,
      min: 1,
      max: 20,
      displayName: "Max Candidates Before Rerank",
      subtitle:
        "Maximum number of fused retrieval candidates to keep before later reranking work is added.",
      slider: { min: 1, max: 20, step: 1 },
    },
    6
    )
  .field(
    "hybridEnabled",
    "boolean",
    {
      displayName: "Hybrid Retrieval",
      subtitle:
        "Blend semantic retrieval with local lexical candidate scoring over parsed file content.",
    },
    false
  )
  .field(
    "lexicalWeight",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Lexical Weight",
      subtitle: "Weight assigned to local lexical candidates in hybrid retrieval.",
      slider: { min: 0.0, max: 1.0, step: 0.05 },
    },
    0.35
  )
  .field(
    "semanticWeight",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Semantic Weight",
      subtitle: "Weight assigned to semantic retrieval candidates in hybrid retrieval.",
      slider: { min: 0.0, max: 1.0, step: 0.05 },
    },
    0.65
  )
  .field(
    "hybridCandidateCount",
    "numeric",
    {
      int: true,
      min: 1,
      max: 20,
      displayName: "Hybrid Candidate Count",
      subtitle: "Maximum number of merged semantic and lexical candidates to keep.",
      slider: { min: 1, max: 20, step: 1 },
    },
    8
  )
  .field(
    "rerankEnabled",
    "boolean",
    {
      displayName: "Rerank Fused Candidates",
      subtitle:
        "Apply a heuristic reranker so evidence selection favors support quality and diversity, not just similarity.",
    },
    true
  )
  .field(
    "rerankTopK",
    "numeric",
    {
      int: true,
      min: 1,
      max: 20,
      displayName: "Rerank Top K",
      subtitle: "Number of fused candidates to keep after reranking.",
      slider: { min: 1, max: 20, step: 1 },
    },
    4
  )
  .field(
    "rerankStrategy",
    "select",
    {
      displayName: "Rerank Strategy",
      subtitle: "Choose how fused retrieval candidates are reranked before evidence packaging.",
      options: [
        {
          value: "heuristic-v1",
          displayName: "Heuristic v1",
        },
        {
          value: "heuristic-then-llm",
          displayName: "Heuristic then LLM",
        },
      ],
    },
    "heuristic-v1"
  )
  .field(
    "modelRerankTopK",
    "numeric",
    {
      int: true,
      min: 1,
      max: 10,
      displayName: "Model Rerank Top K",
      subtitle: "Number of top heuristic candidates to rescore with an LLM when model-assisted reranking is enabled.",
      slider: { min: 1, max: 10, step: 1 },
    },
    3
  )
  .field(
    "modelRerankMode",
    "select",
    {
      displayName: "Model Rerank Model Source",
      subtitle:
        "Choose whether model-assisted reranking uses the active chat model, a manually specified LLM, or an auto-detected local LLM.",
      options: [
        {
          value: "active-chat-model",
          displayName: "Active/default chat model",
        },
        {
          value: "auto-detect",
          displayName: "Auto-detect loaded/downloaded LLM",
        },
        {
          value: "manual-model-id",
          displayName: "Manual model ID",
        },
      ],
    },
    "active-chat-model"
  )
  .field(
    "modelRerankModelId",
    "string",
    {
      displayName: "Model Rerank Model ID",
      subtitle:
        "Used when the rerank model source is set to Manual model ID. This config powers LLM-assisted reranking only.",
      placeholder: "e.g., qwen2.5-7b-instruct",
    },
    ""
  )
  .field(
    "dedupeSimilarityThreshold",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Evidence Dedupe Threshold",
      subtitle:
        "Similarity threshold used to drop near-duplicate retrieved evidence from the same file.",
      slider: { min: 0.0, max: 1.0, step: 0.01 },
    },
    0.85
  )
  .field(
    "maxEvidenceBlocks",
    "numeric",
    {
      int: true,
      min: 1,
      max: 10,
      displayName: "Max Evidence Blocks",
      subtitle: "Maximum number of deduplicated evidence blocks to inject into the prompt.",
      slider: { min: 1, max: 10, step: 1 },
    },
    4
  )
  .field(
    "sanitizeRetrievedText",
    "boolean",
    {
      displayName: "Sanitize Retrieved Text",
      subtitle:
        "Normalize retrieved text before injection to reduce noisy markup and formatting artifacts.",
    },
    true
  )
  .field(
    "stripInstructionalSpans",
    "boolean",
    {
      displayName: "Strip Instruction-Like Spans",
      subtitle:
        "Replace obviously instruction-like retrieved text with a neutral placeholder before injection.",
    },
    true
  )
  .field(
    "strictGroundingMode",
    "select",
    {
      displayName: "Strict Grounding Mode",
      subtitle:
        "Control how strongly the injected prompt should constrain the model to retrieved evidence.",
      options: [
        {
          value: "off",
          displayName: "Off",
        },
        {
          value: "warn-on-weak-evidence",
          displayName: "Warn on weak evidence",
        },
        {
          value: "require-evidence",
          displayName: "Require evidence",
        }
      ],
    },
    "warn-on-weak-evidence"
  )
  .field(
    "correctiveRetrievalEnabled",
    "boolean",
    {
      displayName: "Corrective Retrieval",
      subtitle:
        "Retry retrieval with aspect-focused rewrites when the first evidence set looks weak or incomplete.",
    },
    true
  )
  .field(
    "correctiveMaxAttempts",
    "numeric",
    {
      int: true,
      min: 0,
      max: 2,
      displayName: "Corrective Attempts",
      subtitle: "Maximum number of corrective retrieval retries after the initial pass.",
      slider: { min: 0, max: 2, step: 1 },
    },
    1
  )
  .field(
    "correctiveMinEvidenceScore",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Corrective Min Evidence Score",
      subtitle:
        "Trigger a corrective retry when the average retained evidence score falls below this threshold.",
      slider: { min: 0.0, max: 1.0, step: 0.01 },
    },
    0.6
  )
  .field(
    "correctiveMinAspectCoverage",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Corrective Min Aspect Coverage",
      subtitle:
        "Trigger a corrective retry when retrieved evidence appears to cover too little of a multi-part query.",
      slider: { min: 0.0, max: 1.0, step: 0.05 },
    },
    0.6
  )
  .build();
