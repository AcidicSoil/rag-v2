const { LMStudioClient } = require("@lmstudio/sdk");
const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "../src/config.ts");
const AUTO_DETECT_ID = "AUTO_DETECT";

async function main() {
  console.log("🔍 Scanning for embedding models...");

  let modelOptions = [
    {
      value: AUTO_DETECT_ID,
      displayName: "Auto-Detect (Use first loaded/available)",
    },
  ];

  try {
    // connect to the local LM Studio instance
    const client = new LMStudioClient();
    const downloadedModels = await client.system.listDownloadedModels();

    // Filter for embedding models
    const embeddingModels = downloadedModels.filter((m) => {
      const id = m.path || m.modelKey || "";
      return id.toLowerCase().includes("embed") || m.type === "embedding";
    });

    // Add found models to the list
    embeddingModels.forEach((m) => {
      const fullPath = m.path || m.modelKey;
      const name = fullPath.split(/[/\\]/).pop().replace(".gguf", "");
      modelOptions.push({
        value: fullPath,
        displayName: name,
      });
    });

    console.log(`✅ Found ${embeddingModels.length} embedding models.`);
  } catch (error) {
    console.warn(
      "⚠️  Could not connect to LM Studio. Using default Auto-Detect configuration."
    );
    console.warn(
      "   (Make sure LM Studio is running if you want the list to populate)"
    );
  }

  // Generate the content for src/config.ts
  const fileContent = `import { createConfigSchematics } from "@lmstudio/sdk";

export const AUTO_DETECT_MODEL_ID = "${AUTO_DETECT_ID}";

export const configSchematics = createConfigSchematics()
  .field(
    "embeddingModel",
    "select",
    {
      displayName: "Embedding Model",
      subtitle: "Select a model or use Auto-Detect.",
      options: ${JSON.stringify(modelOptions, null, 2)},
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
`;

  fs.writeFileSync(CONFIG_PATH, fileContent);
  console.log(`📄 Updated src/config.ts`);
}

main();
