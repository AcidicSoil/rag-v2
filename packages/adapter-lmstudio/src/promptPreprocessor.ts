import {
  text,
  type Chat,
  type ChatMessage,
  type FileHandle,
  type LLMDynamicHandle,
  type PromptPreprocessorController,
} from "@lmstudio/sdk";
import { orchestrateRagRequest } from "../../core/src/orchestrator";
import type { RagPreparedPromptOutput } from "../../core/src/outputContracts";
import { configSchematics } from "./config";
import {
  buildAmbiguousGateMessage,
  buildLikelyUnanswerableGateMessage,
  runAnswerabilityGate,
} from "./gating";
import {
  buildAdapterRequestOptions,
  createLmStudioAdapterRuntime,
} from "./orchestratorRuntime";
import { toRetrievalResultEntries } from "./lmstudioCoreBridge";
import type { AmbiguousQueryBehavior } from "./types/gating";

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
  const pluginConfig = ctl.getPluginConfig(configSchematics);
  const answerabilityGateEnabled = pluginConfig.get("answerabilityGateEnabled");
  const answerabilityGateThreshold = pluginConfig.get(
    "answerabilityGateThreshold"
  );
  const ambiguousQueryBehavior = pluginConfig.get(
    "ambiguousQueryBehavior"
  ) as AmbiguousQueryBehavior;

  if (files.length > 0 && answerabilityGateEnabled) {
    const gateResult = runAnswerabilityGate(
      userPrompt,
      files,
      answerabilityGateThreshold
    );
    ctl.debug(
      `Answerability gate decision: ${gateResult.decision} (${gateResult.confidence.toFixed(
        2
      )})\n${gateResult.reasons.map((reason) => `- ${reason}`).join("\n")}`
    );

    if (gateResult.decision === "no-retrieval-needed") {
      return userMessage;
    }

    if (gateResult.decision === "ambiguous") {
      return buildAmbiguousGateMessage(
        userPrompt,
        files,
        ambiguousQueryBehavior
      );
    }

    if (gateResult.decision === "likely-unanswerable") {
      return buildLikelyUnanswerableGateMessage(userPrompt);
    }
  }

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
  const retrievingStatus = ctl.createStatus({
    status: "loading",
    text: "Preparing grounded retrieval context...",
  });
  const { runtime, cleanup } = createLmStudioAdapterRuntime(
    ctl,
    files,
    pluginConfig
  );

  try {
    const output = (await orchestrateRagRequest(
      {
        query: originalUserPrompt,
        requestedRoute: pluginConfig.get("correctiveRetrievalEnabled")
          ? "corrective"
          : "retrieval",
        options: buildAdapterRequestOptions(pluginConfig),
        outputMode: "prepared-prompt",
      },
      runtime
    )) as RagPreparedPromptOutput;

    if (output.evidence.length > 0) {
      await ctl.addCitations({
        entries: toRetrievalResultEntries(
          output.evidence.map((block) => block.candidate)
        ),
      });
      retrievingStatus.setState({
        status: "done",
        text: `Retrieved ${output.evidence.length} relevant citations for user query`,
      });
    } else if (output.route === "global-summary" || output.route === "sample") {
      retrievingStatus.setState({
        status: "done",
        text: `Prepared grounded ${output.route} context from corpus manifests and file synopses`,
      });
    } else {
      retrievingStatus.setState({
        status: "canceled",
        text: "No relevant citations found for user query",
      });
    }

    if (output.diagnostics.notes && output.diagnostics.notes.length > 0) {
      ctl.debug(output.diagnostics.notes.join("\n"));
    }

    return output.preparedPrompt;
  } catch (error: any) {
    const errorMessage = error.message || "Unknown error";
    ctl.debug(`Error: ${errorMessage}`);
    retrievingStatus.setState({
      status: "error",
      text: `Error: ${errorMessage}`,
    });
    throw error;
  } finally {
    await cleanup();
  }
}

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
