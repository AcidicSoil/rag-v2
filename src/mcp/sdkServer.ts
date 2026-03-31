import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { RagToolHandlerSet } from "../core/runtimeContracts";
import { createDefaultMcpRuntime } from "./defaultRuntime";
import { createMcpToolHandlers } from "./handlers";

const inlineDocumentShape = {
  id: z.string().min(1).describe("Document identifier"),
  name: z.string().min(1).describe("Document name"),
  content: z.string().describe("Full document content"),
  metadata: z.record(z.unknown()).optional().describe("Optional document metadata"),
};

const prechunkedCandidateShape = {
  sourceId: z.string().min(1).describe("Source identifier"),
  sourceName: z.string().min(1).describe("Source display name"),
  content: z.string().min(1).describe("Candidate chunk text"),
  score: z.number().finite().nonnegative().describe("Initial relevance score"),
  metadata: z.record(z.unknown()).optional().describe("Optional chunk metadata"),
};

const retrievalOverridesShape = {
  multiQueryEnabled: z.boolean().optional(),
  multiQueryCount: z.number().int().min(1).max(8).optional(),
  fusionMethod: z.enum(["reciprocal-rank-fusion", "max-score"]).optional(),
  hybridEnabled: z.boolean().optional(),
  rerankEnabled: z.boolean().optional(),
  rerankTopK: z.number().int().min(1).max(20).optional(),
  maxEvidenceBlocks: z.number().int().min(1).max(20).optional(),
};

const corpusInputShape = {
  documents: z.array(z.object(inlineDocumentShape)).optional(),
  paths: z.array(z.string().min(1)).optional(),
  chunks: z.array(z.object(prechunkedCandidateShape)).optional(),
};

export function createOfficialMcpServer(handlers: RagToolHandlerSet) {
  const server = new McpServer({
    name: "rag-v2-mcp",
    version: "0.1.0",
  });
  const registerTool = (server as any).registerTool.bind(server) as any;

  registerTool(
    "rag_answer",
    {
      description:
        "Answer a grounded question over inline documents, filesystem paths, or pre-chunked corpora.",
      inputSchema: {
        query: z.string().min(1).describe("User query to answer"),
        mode: z
          .enum(["auto", "full-context", "retrieval", "corrective"])
          .optional()
          .describe("Preferred retrieval mode"),
        groundingMode: z
          .enum(["off", "warn-on-weak-evidence", "require-evidence"])
          .optional()
          .describe("How strictly to ground the answer in evidence"),
        retrieval: z.object(retrievalOverridesShape).optional(),
        ...corpusInputShape,
      } as any,
    },
    async (args: any) => {
      const result = await handlers.ragAnswer(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
      };
    }
  );

  registerTool(
    "rag_search",
    {
      description:
        "Search a grounded corpus and return ranked candidate chunks.",
      inputSchema: {
        query: z.string().min(1).describe("Query to retrieve against the corpus"),
        retrieval: z.object(retrievalOverridesShape).optional(),
        ...corpusInputShape,
      } as any,
    },
    async (args: any) => {
      const result = await handlers.ragSearch(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
      };
    }
  );

  registerTool(
    "corpus_inspect",
    {
      description:
        "Inspect a corpus and recommend whether full-context or retrieval is more appropriate.",
      inputSchema: {
        ...corpusInputShape,
      } as any,
    },
    async (args: any) => {
      const result = await handlers.corpusInspect(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
      };
    }
  );

  registerTool(
    "rerank_only",
    {
      description:
        "Rerank pre-supplied candidate chunks for a query.",
      inputSchema: {
        query: z.string().min(1).describe("Query used for reranking"),
        candidates: z
          .array(z.object(prechunkedCandidateShape))
          .min(1)
          .describe("Candidate chunks to rerank"),
        topK: z.number().int().min(1).max(20).optional(),
      } as any,
    },
    async (args: any) => {
      const result = await handlers.rerankOnly(args);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ],
        structuredContent: result,
      };
    }
  );

  return server;
}

export async function startOfficialStdioMcpServer() {
  const handlers = createMcpToolHandlers(createDefaultMcpRuntime());
  const server = createOfficialMcpServer(handlers);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("rag-v2 MCP server running on stdio");
}
