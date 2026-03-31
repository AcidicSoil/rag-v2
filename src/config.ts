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
  .build();
