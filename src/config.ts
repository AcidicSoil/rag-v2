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
      ],
    },
    "heuristic-v1"
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
  .build();
