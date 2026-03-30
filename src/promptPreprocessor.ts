import {
  text,
  type Chat,
  type ChatMessage,
  type FileHandle,
  type LLMDynamicHandle,
  type PredictionProcessStatusController,
  type PromptPreprocessorController,
} from "@lmstudio/sdk";
import { configSchematics, AUTO_DETECT_MODEL_ID } from "./config";

type DocumentContextInjectionStrategy =
  | "none"
  | "inject-full-content"
  | "retrieval";

export async function preprocess(
  ctl: PromptPreprocessorController,
  userMessage: ChatMessage
) {
  const userPrompt = userMessage.getText();
  const history = await ctl.pullHistory();
  history.append(userMessage);
  const newFiles = userMessage
    .getFiles(ctl.client)
    .filter((f) => f.type !== "image");
  const files = history
    .getAllFiles(ctl.client)
    .filter((f) => f.type !== "image");

  if (newFiles.length > 0) {
    const strategy = await chooseContextInjectionStrategy(
      ctl,
      userPrompt,
      newFiles
    );
    if (strategy === "inject-full-content") {
      return await prepareDocumentContextInjection(ctl, userMessage);
    } else if (strategy === "retrieval") {
      return await prepareRetrievalResultsContextInjection(
        ctl,
        userPrompt,
        files
      );
    }
  } else if (files.length > 0) {
    return await prepareRetrievalResultsContextInjection(
      ctl,
      userPrompt,
      files
    );
  }

  return userMessage;
}

async function prepareRetrievalResultsContextInjection(
  ctl: PromptPreprocessorController,
  originalUserPrompt: string,
  files: Array<FileHandle>
): Promise<string> {
  const pluginConfig = ctl.getPluginConfig(configSchematics);
  const selectedModelId = pluginConfig.get("embeddingModel");
  const manualModelId = pluginConfig.get("embeddingModelManual");
  const autoUnload = pluginConfig.get("autoUnload");
  const retrievalLimit = pluginConfig.get("retrievalLimit");
  const retrievalAffinityThreshold = pluginConfig.get(
    "retrievalAffinityThreshold"
  );

  const statusSteps = new Map<FileHandle, PredictionProcessStatusController>();

  const retrievingStatus = ctl.createStatus({
    status: "loading",
    text: `Resolving embedding model...`,
  });

  let embeddingModel;

  try {
    // --- Model Resolution Logic ---
    if (manualModelId && manualModelId.trim() !== "") {
      ctl.debug(`Using manual embedding model ID: ${manualModelId}`);
      embeddingModel = await ctl.client.embedding.model(manualModelId.trim(), {
        signal: ctl.abortSignal,
      });
    } else if (selectedModelId !== AUTO_DETECT_MODEL_ID) {
      ctl.debug(`Using selected embedding model: ${selectedModelId}`);
      embeddingModel = await ctl.client.embedding.model(selectedModelId, {
        signal: ctl.abortSignal,
      });
    } else {
      // Auto-Detect
      const loadedModels = await ctl.client.embedding.listLoaded();
      if (loadedModels.length > 0) {
        embeddingModel = loadedModels[0];
        ctl.debug(
          `Auto-detected loaded embedding model: ${embeddingModel.identifier}`
        );
      } else {
        const downloadedModels = await ctl.client.system.listDownloadedModels("embedding");
        const found = downloadedModels.find((m) => {
          const candidate = `${m.modelKey} ${m.path} ${m.displayName}`.toLowerCase();
          return candidate.includes("embed");
        }) ?? downloadedModels[0];

        if (found) {
          ctl.debug(`Found embedding model: ${found.modelKey}. Loading...`);
          embeddingModel = await ctl.client.embedding.model(found.modelKey, {
            signal: ctl.abortSignal,
          });
        } else {
          throw new Error(
            "No embedding model found. Please download one in LM Studio."
          );
        }
      }
    }

    // --- Retrieval Logic ---
    retrievingStatus.setState({
      status: "loading",
      text: `Retrieving relevant citations using ${embeddingModel.identifier}...`,
    });

    const result = await ctl.client.files.retrieve(originalUserPrompt, files, {
      embeddingModel: embeddingModel,
      limit: retrievalLimit,
      signal: ctl.abortSignal,
      onFileProcessList(filesToProcess) {
        for (const file of filesToProcess) {
          statusSteps.set(
            file,
            retrievingStatus.addSubStatus({
              status: "waiting",
              text: `Process ${file.name} for retrieval`,
            })
          );
        }
      },
      onFileProcessingStart(file) {
        statusSteps
          .get(file)!
          .setState({
            status: "loading",
            text: `Processing ${file.name} for retrieval`,
          });
      },
      onFileProcessingEnd(file) {
        statusSteps
          .get(file)!
          .setState({
            status: "done",
            text: `Processed ${file.name} for retrieval`,
          });
      },
      onFileProcessingStepProgress(file, step, progressInStep) {
        const verb =
          step === "loading"
            ? "Loading"
            : step === "chunking"
            ? "Chunking"
            : "Embedding";
        statusSteps.get(file)!.setState({
          status: "loading",
          text: `${verb} ${file.name} for retrieval (${(
            progressInStep * 100
          ).toFixed(1)}%)`,
        });
      },
    });

    result.entries = result.entries.filter(
      (entry) => entry.score > retrievalAffinityThreshold
    );

    // --- Format Response ---
    let processedContent = "";
    const numRetrievals = result.entries.length;
    if (numRetrievals > 0) {
      retrievingStatus.setState({
        status: "done",
        text: `Retrieved ${numRetrievals} relevant citations for user query`,
      });

      const prefix =
        "The following citations were found in the files provided by the user:\n\n";
      processedContent += prefix;
      let citationNumber = 1;
      result.entries.forEach((result) => {
        processedContent += `Citation ${citationNumber}: "${result.content}"\n\n`;
        citationNumber++;
      });
      await ctl.addCitations(result);
      const suffix =
        `Use the citations above to respond to the user query, only if they are relevant. ` +
        `Otherwise, respond to the best of your ability without them.` +
        `\n\nUser Query:\n\n${originalUserPrompt}`;
      processedContent += suffix;
    } else {
      retrievingStatus.setState({
        status: "canceled",
        text: `No relevant citations found for user query`,
      });

      const noteAboutNoRetrievalResultsFound =
        `Important: No citations were found in the user files for the user query. ` +
        `In less than one sentence, inform the user of this. ` +
        `Then respond to the query to the best of your ability.`;
      processedContent =
        noteAboutNoRetrievalResultsFound +
        `\n\nUser Query:\n\n${originalUserPrompt}`;
    }

    return processedContent;
  } catch (error: any) {
    const errorMessage = error.message || "Unknown error";
    ctl.debug(`Error: ${errorMessage}`);
    retrievingStatus.setState({
      status: "error",
      text: `Error: ${errorMessage}`,
    });
    throw error;
  } finally {
    // --- Unload Logic ---
    if (autoUnload && embeddingModel) {
      ctl.debug(`Auto-unloading embedding model: ${embeddingModel.identifier}`);
      try {
        await embeddingModel.unload();
      } catch (unloadError) {
        ctl.debug(`Failed to unload model: ${unloadError}`);
      }
    }
  }
}

// NOTE: Helper functions (prepareDocumentContextInjection, measureContextWindow, chooseContextInjectionStrategy)
// must remain in the file. They are unchanged.
async function prepareDocumentContextInjection(
  ctl: PromptPreprocessorController,
  input: ChatMessage
): Promise<ChatMessage> {
  const documentInjectionSnippets: Map<FileHandle, string> = new Map();
  const files = input.consumeFiles(ctl.client, (file) => file.type !== "image");
  for (const file of files) {
    const { content } = await ctl.client.files.parseDocument(file, {
      signal: ctl.abortSignal,
    });

    ctl.debug(text`
      Strategy: inject-full-content. Injecting full content of file '${file}' into the
      context. Length: ${content.length}.
    `);
    documentInjectionSnippets.set(file, content);
  }

  let formattedFinalUserPrompt = "";

  if (documentInjectionSnippets.size > 0) {
    formattedFinalUserPrompt +=
      "This is a Enriched Context Generation scenario.\n\nThe following content was found in the files provided by the user.\n";

    for (const [fileHandle, snippet] of documentInjectionSnippets) {
      formattedFinalUserPrompt += `\n\n** ${fileHandle.name} full content **\n\n${snippet}\n\n** end of ${fileHandle.name} **\n\n`;
    }

    formattedFinalUserPrompt += `Based on the content above, please provide a response to the user query.\n\nUser query: ${input.getText()}`;
  }

  input.replaceText(formattedFinalUserPrompt);
  return input;
}

async function measureContextWindow(ctx: Chat, model: LLMDynamicHandle) {
  const currentContextFormatted = await model.applyPromptTemplate(ctx);
  const totalTokensInContext = await model.countTokens(currentContextFormatted);
  const modelContextLength = await model.getContextLength();
  const modelRemainingContextLength = modelContextLength - totalTokensInContext;
  const contextOccupiedPercent =
    (totalTokensInContext / modelContextLength) * 100;
  return {
    totalTokensInContext,
    modelContextLength,
    modelRemainingContextLength,
    contextOccupiedPercent,
  };
}

async function chooseContextInjectionStrategy(
  ctl: PromptPreprocessorController,
  originalUserPrompt: string,
  files: Array<FileHandle>
): Promise<DocumentContextInjectionStrategy> {
  const status = ctl.createStatus({
    status: "loading",
    text: `Deciding how to handle the document(s)...`,
  });

  const model = await ctl.client.llm.model();
  const ctx = await ctl.pullHistory();
  ctx.append("user", originalUserPrompt);

  const {
    totalTokensInContext,
    modelContextLength,
    modelRemainingContextLength,
    contextOccupiedPercent,
  } = await measureContextWindow(ctx, model);

  ctl.debug(
    `Context measurement result:\n\n` +
      `\tTotal tokens in context: ${totalTokensInContext}\n` +
      `\tModel context length: ${modelContextLength}\n` +
      `\tModel remaining context length: ${modelRemainingContextLength}\n` +
      `\tContext occupied percent: ${contextOccupiedPercent.toFixed(2)}%\n`
  );

  let totalFileTokenCount = 0;
  let totalReadTime = 0;
  let totalTokenizeTime = 0;
  for (const file of files) {
    const startTime = performance.now();

    const loadingStatus = status.addSubStatus({
      status: "loading",
      text: `Loading parser for ${file.name}...`,
    });
    let actionProgressing = "Reading";
    let parserIndicator = "";

    const { content } = await ctl.client.files.parseDocument(file, {
      signal: ctl.abortSignal,
      onParserLoaded: (parser) => {
        loadingStatus.setState({
          status: "loading",
          text: `${parser.library} loaded for ${file.name}...`,
        });
        if (parser.library !== "builtIn") {
          actionProgressing = "Parsing";
          parserIndicator = ` with ${parser.library}`;
        }
      },
      onProgress: (progress) => {
        loadingStatus.setState({
          status: "loading",
          text: `${actionProgressing} file ${
            file.name
          }${parserIndicator}... (${(progress * 100).toFixed(2)}%)`,
        });
      },
    });
    loadingStatus.remove();

    totalReadTime += performance.now() - startTime;

    const startTokenizeTime = performance.now();
    totalFileTokenCount += await model.countTokens(content);
    totalTokenizeTime += performance.now() - startTokenizeTime;
    if (totalFileTokenCount > modelRemainingContextLength) {
      break;
    }
  }
  ctl.debug(`Total file read time: ${totalReadTime.toFixed(2)} ms`);
  ctl.debug(`Total tokenize time: ${totalTokenizeTime.toFixed(2)} ms`);

  ctl.debug(`Original User Prompt: ${originalUserPrompt}`);
  const userPromptTokenCount = (await model.tokenize(originalUserPrompt))
    .length;
  const totalFilePlusPromptTokenCount =
    totalFileTokenCount + userPromptTokenCount;

  const contextOccupiedFraction = contextOccupiedPercent / 100;
  const targetContextUsePercent = 0.7;
  const targetContextUsage =
    targetContextUsePercent * (1 - contextOccupiedFraction);
  const availableContextTokens = Math.floor(
    modelRemainingContextLength * targetContextUsage
  );

  ctl.debug("Strategy Calculation:");
  ctl.debug(`\tTotal Tokens in All Files: ${totalFileTokenCount}`);
  ctl.debug(`\tTotal Tokens in User Prompt: ${userPromptTokenCount}`);
  ctl.debug(`\tModel Context Remaining: ${modelRemainingContextLength} tokens`);
  ctl.debug(`\tContext Occupied: ${contextOccupiedPercent.toFixed(2)}%`);
  ctl.debug(`\tAvailable Tokens: ${availableContextTokens}\n`);

  if (totalFilePlusPromptTokenCount > availableContextTokens) {
    const chosenStrategy = "retrieval";
    ctl.debug(
      `Chosen context injection strategy: '${chosenStrategy}'. Total file + prompt token count: ` +
        `${totalFilePlusPromptTokenCount} > ${
          targetContextUsage * 100
        }% * available context tokens: ${availableContextTokens}`
    );
    status.setState({
      status: "done",
      text: `Chosen context injection strategy: '${chosenStrategy}'. Retrieval is optimal for the size of content provided`,
    });
    return chosenStrategy;
  }

  const chosenStrategy = "inject-full-content";
  status.setState({
    status: "done",
    text: `Chosen context injection strategy: '${chosenStrategy}'. All content can fit into the context`,
  });
  return chosenStrategy;
}
