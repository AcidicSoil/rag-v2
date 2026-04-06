import { createConfigSchematics } from "@lmstudio/sdk";
import { AUTO_DETECT_MODEL_ID } from "../../lmstudio-shared/src/modelResolution";

export { AUTO_DETECT_MODEL_ID } from "../../lmstudio-shared/src/modelResolution";

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
      min: 2,
      max: 5,
      displayName: "Multi-Query Count",
      subtitle: "How many rewrite variants to generate when multi-query is enabled.",
      slider: { min: 2, max: 5, step: 1 },
    },
    3
  )
  .field(
    "hybridEnabled",
    "boolean",
    {
      displayName: "Hybrid Retrieval",
      subtitle:
        "Combine semantic retrieval with a lightweight lexical pass for better recall on exact terms.",
    },
    false
  )
  .field(
    "semanticWeight",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Hybrid Semantic Weight",
      subtitle: "Blend weight for semantic scores in hybrid retrieval.",
      slider: { min: 0.0, max: 1.0, step: 0.05 },
    },
    0.65
  )
  .field(
    "lexicalWeight",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Hybrid Lexical Weight",
      subtitle: "Blend weight for lexical scores in hybrid retrieval.",
      slider: { min: 0.0, max: 1.0, step: 0.05 },
    },
    0.35
  )
  .field(
    "modelRerankEnabled",
    "boolean",
    {
      displayName: "Model-Assisted Rerank",
      subtitle:
        "Use an LM Studio chat model to rescore the strongest retrieved chunks before answering.",
    },
    false
  )
  .field(
    "modelRerankTopK",
    "numeric",
    {
      int: true,
      min: 2,
      max: 8,
      displayName: "Model Rerank Top K",
      subtitle: "How many top retrieval candidates to rescore with the chat model.",
      slider: { min: 2, max: 8, step: 1 },
    },
    5
  )
  .field(
    "modelRerankMode",
    "select",
    {
      displayName: "Rerank Model Source",
      subtitle:
        "Choose whether reranking uses the active chat model, auto-detects a local chat model, or loads a specific model ID.",
      options: [
        { value: "active-chat-model", displayName: "Use active chat model" },
        { value: "auto-detect", displayName: "Auto-detect available chat model" },
        { value: "manual-model-id", displayName: "Use manual rerank model ID" },
      ],
    },
    "active-chat-model"
  )
  .field(
    "modelRerankModelId",
    "string",
    {
      displayName: "Manual Rerank Model ID",
      subtitle:
        "Optional explicit model ID for model-assisted reranking when manual mode is selected.",
      placeholder: "e.g., lmstudio-community/Qwen2.5-7B-Instruct-GGUF",
    },
    ""
  )
  .field(
    "strictGroundingMode",
    "select",
    {
      displayName: "Strict Grounding Mode",
      subtitle:
        "Choose how strictly answers must stay tied to retrieved evidence.",
      options: [
        { value: "off", displayName: "Off" },
        { value: "warn-on-weak-evidence", displayName: "Warn on weak evidence" },
        { value: "require-evidence", displayName: "Require evidence" },
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
        "Retry retrieval with focused follow-up rewrites when initial evidence looks weak.",
    },
    false
  )
  .field(
    "correctiveMaxAttempts",
    "numeric",
    {
      int: true,
      min: 0,
      max: 4,
      displayName: "Corrective Max Attempts",
      subtitle: "Maximum number of corrective retrieval attempts.",
      slider: { min: 0, max: 4, step: 1 },
    },
    1
  )
  .field(
    "fusionMethod",
    "select",
    {
      displayName: "Fusion Method",
      subtitle: "How retrieval results from multiple queries are merged.",
      options: [
        { value: "reciprocal-rank-fusion", displayName: "Reciprocal Rank Fusion" },
        { value: "max-score", displayName: "Max score" },
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
      subtitle: "Maximum number of retrieval candidates to keep before reranking.",
      slider: { min: 1, max: 20, step: 1 },
    },
    8
  )
  .field(
    "maxEvidenceBlocks",
    "numeric",
    {
      int: true,
      min: 1,
      max: 20,
      displayName: "Max Evidence Blocks",
      subtitle: "Maximum number of evidence blocks to carry into answer composition.",
      slider: { min: 1, max: 20, step: 1 },
    },
    8
  )
  .field(
    "dedupeSimilarityThreshold",
    "numeric",
    {
      min: 0.0,
      max: 1.0,
      displayName: "Dedupe Similarity Threshold",
      subtitle: "Similarity threshold for collapsing near-duplicate evidence chunks.",
      slider: { min: 0.0, max: 1.0, step: 0.01 },
    },
    0.92
  )
  .field(
    "rerankEnabled",
    "boolean",
    {
      displayName: "Rerank Retrieved Chunks",
      subtitle: "Enable reranking before evidence selection.",
    },
    true
  )
  .field(
    "rerankStrategy",
    "select",
    {
      displayName: "Rerank Strategy",
      subtitle: "Choose the reranking approach to apply to retrieved chunks.",
      options: [
        { value: "heuristic-v1", displayName: "Heuristic v1" },
        { value: "heuristic-then-llm", displayName: "Heuristic then LLM" },
      ],
    },
    "heuristic-v1"
  )
  .field(
    "rerankTopK",
    "numeric",
    {
      int: true,
      min: 1,
      max: 20,
      displayName: "Rerank Top K",
      subtitle: "How many top retrieval candidates to send into reranking.",
      slider: { min: 1, max: 20, step: 1 },
    },
    5
  )
  .field(
    "sanitizeRetrievedText",
    "boolean",
    {
      displayName: "Sanitize Retrieved Text",
      subtitle: "Clean retrieved passages before they are used in prompting or evidence output.",
    },
    false
  )
  .field(
    "stripInstructionalSpans",
    "boolean",
    {
      displayName: "Strip Instructional Spans",
      subtitle: "Remove instruction-like spans from retrieved text during sanitization.",
    },
    false
  )
  .field(
    "hybridCandidateCount",
    "numeric",
    {
      int: true,
      min: 1,
      max: 20,
      displayName: "Hybrid Candidate Count",
      subtitle: "Maximum number of candidates to keep in the hybrid retrieval branch.",
      slider: { min: 1, max: 20, step: 1 },
    },
    8
  )
  .build();
