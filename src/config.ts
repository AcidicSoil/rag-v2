import { createConfigSchematics } from "@lmstudio/sdk";

export const AUTO_DETECT_MODEL_ID = "AUTO_DETECT";

export const configSchematics = createConfigSchematics()
  .field(
    "embeddingModel",
    "select",
    {
      displayName: "Embedding Model",
      subtitle: "Select a model or use Auto-Detect.",
      options: [
  {
    "value": "AUTO_DETECT",
    "displayName": "Auto-Detect (Use first loaded/available)"
  },
  {
    "value": "mradermacher/Euler-Legal-Embedding-V3-GGUF/Euler-Legal-Embedding-V3.Q4_K_S.gguf",
    "displayName": "Euler-Legal-Embedding-V3.Q4_K_S"
  },
  {
    "value": "mradermacher/Nemotron-Research-Reasoning-Qwen-1.5B-Reasoning-Embedding-GGUF/Nemotron-Research-Reasoning-Qwen-1.5B-Reasoning-Embedding.Q8_0.gguf",
    "displayName": "Nemotron-Research-Reasoning-Qwen-1.5B-Reasoning-Embedding.Q8_0"
  },
  {
    "value": "nomic-ai/nomic-embed-text-v1.5-GGUF/nomic-embed-text-v1.5.Q4_K_M.gguf",
    "displayName": "nomic-embed-text-v1.5.Q4_K_M"
  },
  {
    "value": "Aashraf995/KaLM-embedding-multilingual-mini-instruct-v2.5-Q8_0-GGUF/kalm-embedding-multilingual-mini-instruct-v2.5-q8_0.gguf",
    "displayName": "kalm-embedding-multilingual-mini-instruct-v2.5-q8_0"
  },
  {
    "value": "jinaai/jina-embeddings-v4-text-code-GGUF/jina-embeddings-v4-text-code-Q4_K_M.gguf",
    "displayName": "jina-embeddings-v4-text-code-Q4_K_M"
  },
  {
    "value": "jinaai/jina-embeddings-v4-text-retrieval-GGUF/jina-embeddings-v4-text-retrieval-Q4_K_M.gguf",
    "displayName": "jina-embeddings-v4-text-retrieval-Q4_K_M"
  }
],
    },
    AUTO_DETECT_MODEL_ID,
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
    3,
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
    0.5,
  )
  .build();
