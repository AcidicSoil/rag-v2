import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type { RagToolHandlerSet } from "../../core/src/runtimeContracts";
import { createDefaultMcpRuntime } from "./defaultRuntime";
import { createMcpToolHandlers } from "./handlers";
import { createLmStudioMcpRuntime } from "./lmstudioRuntime";

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

const groupedOptionsShape = {
  policy: z
    .object({
      groundingMode: z
        .enum(["off", "warn-on-weak-evidence", "require-evidence"])
        .optional(),
      answerabilityGateEnabled: z.boolean().optional(),
      answerabilityGateThreshold: z.number().min(0).max(1).optional(),
      ambiguousQueryBehavior: z
        .enum(["proceed", "ask-for-clarification", "warn"])
        .optional(),
    })
    .optional(),
  routing: z
    .object({
      requestedRoute: z
        .enum(["auto", "no-retrieval", "full-context", "retrieval", "corrective"])
        .optional(),
      fullContextTokenLimit: z.number().int().min(1).optional(),
      activeModelContextTokens: z.number().int().min(1).optional(),
      correctiveEnabled: z.boolean().optional(),
      correctiveMaxAttempts: z.number().int().min(0).max(4).optional(),
    })
    .optional(),
  retrieval: z
    .object({
      multiQueryEnabled: z.boolean().optional(),
      multiQueryCount: z.number().int().min(1).max(8).optional(),
      fusionMethod: z.enum(["reciprocal-rank-fusion", "max-score"]).optional(),
      hybridEnabled: z.boolean().optional(),
      maxCandidates: z.number().int().min(1).max(32).optional(),
      maxEvidenceBlocks: z.number().int().min(1).max(20).optional(),
      minScore: z.number().min(0).max(1).optional(),
      dedupeSimilarityThreshold: z.number().min(0).max(1).optional(),
    })
    .optional(),
  rerank: z
    .object({
      enabled: z.boolean().optional(),
      strategy: z.enum(["heuristic-v1", "heuristic-then-llm"]).optional(),
      topK: z.number().int().min(1).max(20).optional(),
    })
    .optional(),
  safety: z
    .object({
      sanitizeRetrievedText: z.boolean().optional(),
      stripInstructionalSpans: z.boolean().optional(),
      requireEvidence: z.boolean().optional(),
    })
    .optional(),
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
          .describe("Legacy grounding alias; prefer options.policy.groundingMode"),
        options: z.object(groupedOptionsShape).optional(),
        retrieval: z
          .object(retrievalOverridesShape)
          .optional()
          .describe("Legacy retrieval alias; prefer options.retrieval / options.rerank"),
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
        options: z.object(groupedOptionsShape).optional(),
        retrieval: z
          .object(retrievalOverridesShape)
          .optional()
          .describe("Legacy retrieval alias; prefer options.retrieval / options.rerank"),
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
    "rag_prepare_prompt",
    {
      description:
        "Prepare a grounded prompt package without synthesizing the final answer.",
      inputSchema: {
        query: z.string().min(1).describe("User query to ground"),
        mode: z
          .enum(["auto", "full-context", "retrieval", "corrective"])
          .optional()
          .describe("Preferred retrieval mode"),
        groundingMode: z
          .enum(["off", "warn-on-weak-evidence", "require-evidence"])
          .optional()
          .describe("Legacy grounding alias; prefer options.policy.groundingMode"),
        options: z.object(groupedOptionsShape).optional(),
        retrieval: z
          .object(retrievalOverridesShape)
          .optional()
          .describe("Legacy retrieval alias; prefer options.retrieval / options.rerank"),
        ...corpusInputShape,
      } as any,
    },
    async (args: any) => {
      const result = await handlers.ragPreparePrompt(args);
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
    "filesystem_browse",
    {
      description:
        "Browse the filesystem without ingesting it as a RAG corpus. Use this to inspect target directories before searching or answering.",
      inputSchema: {
        path: z.string().min(1).describe("Filesystem path to inspect"),
        recursive: z.boolean().optional().describe("Whether to recurse into subdirectories"),
        maxDepth: z.number().int().min(0).max(32).optional().describe("Maximum recursion depth when recursive is enabled"),
        maxEntries: z.number().int().min(1).max(5000).optional().describe("Maximum number of entries to return"),
        includeHidden: z.boolean().optional().describe("Whether to include hidden files and directories"),
      } as any,
    },
    async (args: any) => {
      const result = await handlers.filesystemBrowse(args);
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
  const runtimeMode = process.env.RAG_V2_MCP_RUNTIME?.toLowerCase() ?? "default";
  const runtime =
    runtimeMode === "lmstudio"
      ? await createLmStudioMcpRuntime()
      : createDefaultMcpRuntime();
  const handlers = createMcpToolHandlers(runtime);
  const server = createOfficialMcpServer(handlers);
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`rag-v2 MCP server running on stdio (${runtimeMode} runtime)`);
}
