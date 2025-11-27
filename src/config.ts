// path: src/config.ts
import { createConfigSchematics } from "@lmstudio/sdk";

const DEFAULT_EMBEDDING_MODEL =
  "text-embedding-nemotron-research-reasoning-qwen-1.5b-reasoning-embedding";

export const configSchematics = createConfigSchematics()
  .field(
    "embeddingModel",
    "select",
    {
      displayName: "Embedding Model",
      subtitle:
        "Select the embedding model to use for retrieval. Must match a locally available embedding model ID.",
      options: [
        {
          value:
            "text-embedding-nemotron-research-reasoning-qwen-1.5b-reasoning-embedding",
          displayName: "Nemotron Reasoning Qwen 1.5B (default)",
        },
        {
          value: "qwen3-embedding-8b",
          displayName: "Qwen3-Embedding-8B",
        },
        {
          value: "kalm-embedding-multilingual-mini-instruct-v2.5",
          displayName: "KaLM-embedding-multilingual-mini-instruct-v2.5",
        },
      ],
    },
    DEFAULT_EMBEDDING_MODEL
  )
  .field(
    "retrievalLimit",
    "numeric",
    {
      int: true,
      min: 1,
      displayName: "Retrieval Limit",
      subtitle:
        "When retrieval is triggered, this is the maximum number of chunks to return.",
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
      subtitle:
        "The minimum similarity score for a chunk to be considered relevant.",
      slider: { min: 0.0, max: 1.0, step: 0.01 },
    },
    0.5
  )
  .build();
