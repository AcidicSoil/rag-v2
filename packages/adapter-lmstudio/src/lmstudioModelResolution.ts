import type { LMStudioClient, LLMDynamicHandle } from "@lmstudio/sdk";
import { AUTO_DETECT_MODEL_ID } from "./config";

export interface ResolvedEmbeddingModel {
  model: any;
  modelId?: string;
  source: "manual" | "configured" | "auto-detected" | "unavailable";
  autoUnload: boolean;
}

export interface ResolvedRerankModel {
  model: LLMDynamicHandle;
  modelId?: string;
  source: "active-chat-model" | "configured" | "auto-detected";
  autoUnload: boolean;
}

export async function resolveEmbeddingModelForAdapter(input: {
  client: LMStudioClient;
  selectedModelId?: string;
  manualModelId?: string;
  signal?: AbortSignal;
  autoUnload?: boolean;
}): Promise<ResolvedEmbeddingModel> {
  const manualModelId = input.manualModelId?.trim();
  if (manualModelId) {
    const model = await input.client.embedding.model(manualModelId, {
      signal: input.signal,
    });
    return {
      model,
      modelId: manualModelId,
      source: "manual",
      autoUnload: Boolean(input.autoUnload),
    };
  }

  if (input.selectedModelId && input.selectedModelId !== AUTO_DETECT_MODEL_ID) {
    const model = await input.client.embedding.model(input.selectedModelId, {
      signal: input.signal,
    });
    return {
      model,
      modelId: input.selectedModelId,
      source: "configured",
      autoUnload: Boolean(input.autoUnload),
    };
  }

  return resolveAutoDetectedEmbeddingModel({
    client: input.client,
    signal: input.signal,
    autoUnload: input.autoUnload,
  });
}

export async function resolveAutoDetectedEmbeddingModel(input: {
  client: LMStudioClient;
  signal?: AbortSignal;
  autoUnload?: boolean;
}): Promise<ResolvedEmbeddingModel> {
  const loadedModels = await input.client.embedding.listLoaded();
  if (loadedModels.length > 0) {
    return {
      model: loadedModels[0],
      modelId: loadedModels[0]?.identifier,
      source: "auto-detected",
      autoUnload: Boolean(input.autoUnload),
    };
  }

  const downloadedModels = await input.client.system.listDownloadedModels("embedding");
  const found =
    downloadedModels.find((model) => {
      const candidate = `${model.modelKey} ${model.path} ${model.displayName}`.toLowerCase();
      return candidate.includes("embed");
    }) ?? downloadedModels[0];

  if (!found) {
    throw new Error("No embedding model found. Please download one in LM Studio.");
  }

  const model = await input.client.embedding.model(found.modelKey, {
    signal: input.signal,
  });
  return {
    model,
    modelId: found.modelKey,
    source: "auto-detected",
    autoUnload: Boolean(input.autoUnload),
  };
}

export async function resolveRerankLlmModel(input: {
  client: LMStudioClient;
  modelSource?: string;
  modelId?: string;
  signal?: AbortSignal;
  autoUnload?: boolean;
  cache?: Map<string, Promise<ResolvedRerankModel>>;
}): Promise<ResolvedRerankModel> {
  const normalizedSource = input.modelSource ?? "active-chat-model";
  const normalizedModelId = input.modelId?.trim();
  const cacheKey = `${normalizedSource}::${normalizedModelId ?? ""}`;
  const cached = input.cache?.get(cacheKey);
  if (cached) {
    return cached;
  }

  const resolutionPromise = (async () => {
    if (normalizedSource === "manual-model-id") {
      if (!normalizedModelId) {
        throw new Error(
          "Model-assisted rerank is set to manual model mode but no rerank model ID was provided."
        );
      }

      return {
        model: (await input.client.llm.model(normalizedModelId, {
          signal: input.signal,
        })) as LLMDynamicHandle,
        modelId: normalizedModelId,
        source: "configured" as const,
        autoUnload: Boolean(input.autoUnload),
      };
    }

    if (normalizedSource === "auto-detect") {
      const loadedModels =
        typeof input.client.llm.listLoaded === "function"
          ? await input.client.llm.listLoaded()
          : [];
      if (loadedModels.length > 0) {
        return {
          model: loadedModels[0] as LLMDynamicHandle,
          modelId: (loadedModels[0] as any)?.identifier,
          source: "auto-detected" as const,
          autoUnload: false,
        };
      }

      const downloadedModels = await input.client.system.listDownloadedModels("llm");
      const found =
        downloadedModels.find((model) => {
          const candidate = `${model.modelKey} ${model.path} ${model.displayName}`.toLowerCase();
          return (
            candidate.includes("instruct") ||
            candidate.includes("chat") ||
            candidate.includes("assistant")
          );
        }) ?? downloadedModels[0];

      if (!found) {
        throw new Error(
          "No LLM model found for model-assisted reranking. Please download one in LM Studio."
        );
      }

      return {
        model: (await input.client.llm.model(found.modelKey, {
          signal: input.signal,
        })) as LLMDynamicHandle,
        modelId: found.modelKey,
        source: "auto-detected" as const,
        autoUnload: Boolean(input.autoUnload),
      };
    }

    return {
      model: (await input.client.llm.model()) as LLMDynamicHandle,
      modelId: undefined,
      source: "active-chat-model" as const,
      autoUnload: false,
    };
  })();

  input.cache?.set(cacheKey, resolutionPromise);
  return resolutionPromise;
}
