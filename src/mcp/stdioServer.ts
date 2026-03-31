import { createInterface } from "node:readline";
import { createDefaultMcpRuntime } from "./defaultRuntime";
import { createMcpToolHandlers } from "./handlers";

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method: string;
  params?: any;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

const handlers = createMcpToolHandlers(createDefaultMcpRuntime());
const toolDefinitions = [
  {
    name: "rag_answer",
    description:
      "Validate a RAG answer request and run it through the current stub runtime.",
    inputSchema: {
      type: "object",
      required: ["query"],
    },
  },
  {
    name: "rag_search",
    description:
      "Validate a retrieval-only request and return ranked candidates from the current stub runtime.",
    inputSchema: {
      type: "object",
      required: ["query"],
    },
  },
  {
    name: "corpus_inspect",
    description:
      "Inspect the supplied corpus and recommend a routing mode.",
    inputSchema: {
      type: "object",
    },
  },
  {
    name: "rerank_only",
    description:
      "Validate and rerank pre-supplied candidate chunks.",
    inputSchema: {
      type: "object",
      required: ["query", "candidates"],
    },
  },
];

export function startStdioMcpServer() {
  const readline = createInterface({
    input: process.stdin,
    terminal: false,
  });

  readline.on("line", async (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    let request: JsonRpcRequest;
    try {
      request = JSON.parse(trimmed) as JsonRpcRequest;
    } catch {
      writeResponse({
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32700,
          message: "Parse error",
        },
      });
      return;
    }

    try {
      const response = await handleRequest(request);
      if (response) {
        writeResponse(response);
      }
    } catch (error) {
      writeResponse({
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : String(error),
        },
      });
    }
  });
}

async function handleRequest(
  request: JsonRpcRequest
): Promise<JsonRpcResponse | null> {
  switch (request.method) {
    case "initialize":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          protocolVersion: "0.1.0-stub",
          serverInfo: {
            name: "rag-v2-mcp-stub",
            version: "0.0.1",
          },
          capabilities: {
            tools: {},
          },
        },
      };
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          tools: toolDefinitions,
        },
      };
    case "tools/call":
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await dispatchToolCall(
                  request.params?.name,
                  request.params?.arguments ?? {}
                ),
                null,
                2
              ),
            },
          ],
        },
      };
    case "notifications/initialized":
      return null;
    default:
      return {
        jsonrpc: "2.0",
        id: request.id ?? null,
        error: {
          code: -32601,
          message: `Method not found: ${request.method}`,
        },
      };
  }
}

async function dispatchToolCall(name: string, args: any) {
  switch (name) {
    case "rag_answer":
      return handlers.ragAnswer(args);
    case "rag_search":
      return handlers.ragSearch(args);
    case "corpus_inspect":
      return handlers.corpusInspect(args);
    case "rerank_only":
      return handlers.rerankOnly(args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function writeResponse(response: JsonRpcResponse) {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

if (require.main === module) {
  startStdioMcpServer();
}
