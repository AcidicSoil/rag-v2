import { AUTO_DETECT_MODEL_ID } from "../packages/lmstudio-shared/src/modelResolution";
import {
  resolveAutoDetectedEmbeddingModel,
  resolveEmbeddingModelForAdapter,
  resolveRerankLlmModel,
} from "../packages/lmstudio-shared/src/modelResolution";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

async function expectRejects(
  action: () => Promise<unknown>,
  expectedMessageFragment: string
): Promise<void> {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    assert(
      message.includes(expectedMessageFragment),
      `Expected error message to include \"${expectedMessageFragment}\", received \"${message}\".`
    );
    return;
  }

  throw new Error(
    `Expected action to reject with a message including \"${expectedMessageFragment}\".`
  );
}

function createMockLmStudioClient(input?: {
  loadedEmbeddingModels?: Array<{ identifier: string }>;
  downloadedEmbeddingModels?: Array<{ modelKey: string; path: string; displayName: string }>;
  loadedLlmModels?: Array<{ identifier: string }>;
  downloadedLlmModels?: Array<{ modelKey: string; path: string; displayName: string }>;
}) {
  const calls = {
    embeddingModelIds: [] as string[],
    llmModelIds: [] as Array<string | undefined>,
    listDownloadedKinds: [] as string[],
    embeddingListLoadedCount: 0,
    llmListLoadedCount: 0,
  };

  const client = {
    embedding: {
      async model(modelId: string) {
        calls.embeddingModelIds.push(modelId);
        return { identifier: modelId };
      },
      async listLoaded() {
        calls.embeddingListLoadedCount += 1;
        return input?.loadedEmbeddingModels ?? [];
      },
    },
    llm: {
      async model(modelId?: string) {
        calls.llmModelIds.push(modelId);
        return { identifier: modelId ?? "active-chat-model" };
      },
      async listLoaded() {
        calls.llmListLoadedCount += 1;
        return input?.loadedLlmModels ?? [];
      },
    },
    system: {
      async listDownloadedModels(kind: string) {
        calls.listDownloadedKinds.push(kind);
        if (kind === "embedding") {
          return input?.downloadedEmbeddingModels ?? [];
        }
        if (kind === "llm") {
          return input?.downloadedLlmModels ?? [];
        }
        return [];
      },
    },
  };

  return { client: client as any, calls };
}

async function main() {
  {
    const { client, calls } = createMockLmStudioClient();
    const resolution = await resolveEmbeddingModelForAdapter({
      client,
      selectedModelId: AUTO_DETECT_MODEL_ID,
      manualModelId: "manual-embedding-model",
      autoUnload: true,
    });

    assert(resolution.modelId === "manual-embedding-model", "Expected manual embedding model ID.");
    assert(resolution.source === "manual", "Expected manual embedding resolution source.");
    assert(resolution.autoUnload === true, "Expected manual embedding resolution to preserve autoUnload.");
    assert(
      calls.embeddingModelIds.length === 1 && calls.embeddingModelIds[0] === "manual-embedding-model",
      "Expected manual embedding resolution to load the manual model ID exactly once."
    );
    assert(calls.embeddingListLoadedCount === 0, "Expected manual embedding path to skip auto-detect checks.");
  }

  {
    const { client, calls } = createMockLmStudioClient({
      downloadedEmbeddingModels: [
        {
          modelKey: "generic-vector-model",
          path: "/models/generic-vector-model.gguf",
          displayName: "Generic Vector Model",
        },
        {
          modelKey: "text-embed-large",
          path: "/models/text-embed-large.gguf",
          displayName: "Text Embed Large",
        },
      ],
    });
    const resolution = await resolveAutoDetectedEmbeddingModel({
      client,
      autoUnload: true,
    });

    assert(resolution.modelId === "text-embed-large", "Expected embed-like downloaded model to be preferred.");
    assert(resolution.source === "auto-detected", "Expected auto-detected embedding source.");
    assert(resolution.autoUnload === true, "Expected auto-detected embedding resolution to preserve autoUnload.");
    assert(
      calls.embeddingModelIds.length === 1 && calls.embeddingModelIds[0] === "text-embed-large",
      "Expected auto-detected embedding path to load the embed-like downloaded model."
    );
    assert(
      calls.listDownloadedKinds.includes("embedding"),
      "Expected auto-detected embedding path to inspect downloaded embedding models."
    );
  }

  {
    const { client } = createMockLmStudioClient();
    await expectRejects(
      () =>
        resolveAutoDetectedEmbeddingModel({
          client,
        }),
      "No embedding model found"
    );
  }

  {
    const { client, calls } = createMockLmStudioClient();
    const cache = new Map<string, Promise<any>>();
    const [first, second] = await Promise.all([
      resolveRerankLlmModel({
        client,
        modelSource: "manual-model-id",
        modelId: "manual-rerank-model",
        autoUnload: true,
        cache,
      }),
      resolveRerankLlmModel({
        client,
        modelSource: "manual-model-id",
        modelId: "manual-rerank-model",
        autoUnload: true,
        cache,
      }),
    ]);

    assert(first.modelId === "manual-rerank-model", "Expected manual rerank model ID.");
    assert(first.source === "configured", "Expected manual rerank source to be configured.");
    assert(first.autoUnload === true, "Expected manual rerank path to preserve autoUnload.");
    assert(first === second, "Expected rerank cache to reuse the same resolved promise result.");
    assert(
      calls.llmModelIds.length === 1 && calls.llmModelIds[0] === "manual-rerank-model",
      "Expected cached manual rerank resolution to load the manual model only once."
    );
  }

  {
    const { client } = createMockLmStudioClient();
    await expectRejects(
      () =>
        resolveRerankLlmModel({
          client,
          modelSource: "manual-model-id",
        }),
      "no rerank model ID was provided"
    );
  }

  {
    const { client, calls } = createMockLmStudioClient({
      downloadedLlmModels: [
        {
          modelKey: "plain-base-model",
          path: "/models/plain-base-model.gguf",
          displayName: "Plain Base Model",
        },
        {
          modelKey: "assistant-chat-model",
          path: "/models/assistant-chat-model.gguf",
          displayName: "Assistant Chat Model",
        },
      ],
    });
    const resolution = await resolveRerankLlmModel({
      client,
      modelSource: "auto-detect",
      autoUnload: true,
    });

    assert(resolution.modelId === "assistant-chat-model", "Expected instruct/chat/assistant downloaded LLM to be preferred.");
    assert(resolution.source === "auto-detected", "Expected auto-detected rerank source.");
    assert(resolution.autoUnload === true, "Expected downloaded auto-detect rerank path to preserve autoUnload.");
    assert(
      calls.llmModelIds.length === 1 && calls.llmModelIds[0] === "assistant-chat-model",
      "Expected auto-detect rerank path to load the preferred downloaded LLM model."
    );
  }

  {
    const { client, calls } = createMockLmStudioClient({
      loadedLlmModels: [{ identifier: "loaded-chat-model" }],
      downloadedLlmModels: [
        {
          modelKey: "assistant-chat-model",
          path: "/models/assistant-chat-model.gguf",
          displayName: "Assistant Chat Model",
        },
      ],
    });
    const resolution = await resolveRerankLlmModel({
      client,
      modelSource: "auto-detect",
      autoUnload: true,
    });

    assert(resolution.modelId === "loaded-chat-model", "Expected loaded LLM to win auto-detect rerank selection.");
    assert(resolution.source === "auto-detected", "Expected auto-detect rerank source for loaded model.");
    assert(resolution.autoUnload === false, "Expected loaded auto-detect rerank path to avoid autoUnload.");
    assert(calls.listDownloadedKinds.every((kind) => kind !== "llm"), "Expected loaded rerank path to skip downloaded-model lookup.");
  }

  {
    const { client } = createMockLmStudioClient();
    await expectRejects(
      () =>
        resolveRerankLlmModel({
          client,
          modelSource: "auto-detect",
        }),
      "No LLM model found for model-assisted reranking"
    );
  }

  console.log("LM Studio model-resolution smoke test passed.");
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`LM Studio model-resolution smoke test failed: ${message}`);
  process.exit(1);
});
