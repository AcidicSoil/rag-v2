# RAG v2 - LM Studio Plugin

This is a Retrieval-Augmented Generation (RAG) plugin for LM Studio. This plugin enhances your local LLM with the ability to answer questions based on the content of provided documents.

## Features

-   **Retrieval-Augmented Generation (RAG)**: Automatically retrieves relevant information from your documents to answer your questions.
-   **Two Context Strategies**:
    -   **Inject Full Content**: For smaller documents, the plugin injects the entire content into the context.
    -   **Retrieval**: For larger documents, it uses an embedding model to find and inject only the most relevant parts.
-   **Automatic Embedding Model Detection**: The plugin can automatically detect and use a compatible embedding model that you have loaded or downloaded in LM Studio.
-   **Configurable**: You can configure the retrieval parameters to suit your needs.

## Getting Started

### Development

The source code resides in the `src/` directory. For development purposes, you can run the plugin in development mode using:

```bash
lms dev
```

### Publishing

To share your plugin with the community, you can publish it to LM Studio Hub using:

```bash
lms push
```

The same command can also be used to update an existing plugin.

### Local validation

Component-level smoke tests:

```bash
npm run smoke:multi-query
npm run smoke:evidence
npm run smoke:safety
```

Lightweight regression eval:

```bash
npm run eval
```

The eval runner reads cases from `eval/cases/basic.jsonl` and writes the latest results to `eval/results/basic-latest.json`.

## Configuration

You can configure the plugin from the LM Studio UI. Here are the available options:

-   **Embedding Model**: Choose an embedding model to use. It defaults to "Auto-Detect".
-   **Manual Model ID (Optional)**: Specify a model ID to override the auto-detection.
-   **Auto-Unload Model**: If enabled, the embedding model will be unloaded from memory after retrieval.
-   **Retrieval Limit**: The maximum number of text chunks to retrieve from the documents.
-   **Retrieval Affinity Threshold**: The minimum similarity score for a chunk to be considered relevant.

## Author

-   **GitHub**: [AcidicSoil](https://github.com/AcidicSoil)
-   **X (Twitter)**: [@d1rt7d4t4](https://x.com/d1rt7d4t4)
-   **Discord**: the_almighty_shade (ID: 187893603920642048)

## Community & Help

-   [lmstudio-js GitHub](https://github.com/lmstudio-ai/lmstudio-js)
-   [Documentation](https://lmstudio.ai/docs)
-   [Discord](https://discord.gg/6Q7Xn6MRVS)
-   [Twitter](https://twitter.com/LMStudioAI)