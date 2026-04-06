import { z } from "zod";

export const inlineDocumentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const prechunkedCandidateSchema = z.object({
  sourceId: z.string().min(1),
  sourceName: z.string().min(1),
  content: z.string().min(1),
  score: z.number().finite().nonnegative(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ragModeSchema = z.enum([
  "auto",
  "full-context",
  "retrieval",
  "corrective",
]);

export const groundingModeSchema = z.enum([
  "off",
  "warn-on-weak-evidence",
  "require-evidence",
]);

export const policyOptionsSchema = z
  .object({
    groundingMode: groundingModeSchema.optional(),
    answerabilityGateEnabled: z.boolean().optional(),
    answerabilityGateThreshold: z.number().min(0).max(1).optional(),
    ambiguousQueryBehavior: z
      .enum(["proceed", "ask-for-clarification", "warn"])
      .optional(),
  })
  .optional();

export const routingOptionsSchema = z
  .object({
    requestedRoute: z
      .enum(["auto", "no-retrieval", "full-context", "retrieval", "corrective"])
      .optional(),
    fullContextTokenLimit: z.number().int().min(1).optional(),
    activeModelContextTokens: z.number().int().min(1).optional(),
    correctiveEnabled: z.boolean().optional(),
    correctiveMaxAttempts: z.number().int().min(0).max(4).optional(),
  })
  .optional();

export const retrievalOptionsSchema = z
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
  .optional();

export const rerankOptionsSchema = z
  .object({
    enabled: z.boolean().optional(),
    strategy: z.enum(["heuristic-v1", "heuristic-then-llm"]).optional(),
    topK: z.number().int().min(1).max(20).optional(),
    modelSource: z.enum(["active-chat-model", "auto-detect", "manual-model-id"]).optional(),
    modelId: z.string().min(1).optional(),
  })
  .optional();

export const safetyOptionsSchema = z
  .object({
    sanitizeRetrievedText: z.boolean().optional(),
    stripInstructionalSpans: z.boolean().optional(),
    requireEvidence: z.boolean().optional(),
  })
  .optional();

export const groupedRequestOptionsSchema = z
  .object({
    policy: policyOptionsSchema,
    routing: routingOptionsSchema,
    retrieval: retrievalOptionsSchema,
    rerank: rerankOptionsSchema,
    safety: safetyOptionsSchema,
  })
  .optional();

export const retrievalOverridesSchema = z
  .object({
    multiQueryEnabled: z.boolean().optional(),
    multiQueryCount: z.number().int().min(1).max(8).optional(),
    fusionMethod: z.enum(["reciprocal-rank-fusion", "max-score"]).optional(),
    hybridEnabled: z.boolean().optional(),
    rerankEnabled: z.boolean().optional(),
    rerankTopK: z.number().int().min(1).max(20).optional(),
    rerankModelSource: z.enum(["active-chat-model", "auto-detect", "manual-model-id"]).optional(),
    rerankModelId: z.string().min(1).optional(),
    maxEvidenceBlocks: z.number().int().min(1).max(20).optional(),
  })
  .optional();

export const corpusInputBaseSchema = z.object({
  documents: z.array(inlineDocumentSchema).optional(),
  paths: z.array(z.string().min(1)).optional(),
  chunks: z.array(prechunkedCandidateSchema).optional(),
});

export const corpusInputSchema = corpusInputBaseSchema.refine(
  (value) =>
    (value.documents?.length ?? 0) > 0 ||
    (value.paths?.length ?? 0) > 0 ||
    (value.chunks?.length ?? 0) > 0,
  {
    message: "Provide at least one of documents, paths, or chunks.",
  }
);

export const ragAnswerInputSchema = corpusInputBaseSchema
  .extend({
    query: z.string().min(1),
    mode: ragModeSchema.default("auto"),
    groundingMode: groundingModeSchema.default("warn-on-weak-evidence"),
    options: groupedRequestOptionsSchema,
    retrieval: retrievalOverridesSchema,
  })
  .refine(
    (value) =>
      (value.documents?.length ?? 0) > 0 ||
      (value.paths?.length ?? 0) > 0 ||
      (value.chunks?.length ?? 0) > 0,
    {
      message: "Provide at least one of documents, paths, or chunks.",
    }
  );

export const ragSearchInputSchema = corpusInputBaseSchema
  .extend({
    query: z.string().min(1),
    options: groupedRequestOptionsSchema,
    retrieval: retrievalOverridesSchema,
  })
  .refine(
    (value) =>
      (value.documents?.length ?? 0) > 0 ||
      (value.paths?.length ?? 0) > 0 ||
      (value.chunks?.length ?? 0) > 0,
    {
      message: "Provide at least one of documents, paths, or chunks.",
    }
  );

export const ragPreparePromptInputSchema = corpusInputBaseSchema
  .extend({
    query: z.string().min(1),
    mode: ragModeSchema.default("auto"),
    groundingMode: groundingModeSchema.default("warn-on-weak-evidence"),
    options: groupedRequestOptionsSchema,
    retrieval: retrievalOverridesSchema,
  })
  .refine(
    (value) =>
      (value.documents?.length ?? 0) > 0 ||
      (value.paths?.length ?? 0) > 0 ||
      (value.chunks?.length ?? 0) > 0,
    {
      message: "Provide at least one of documents, paths, or chunks.",
    }
  );

export const corpusInspectInputSchema = corpusInputSchema;

export const rerankOnlyInputSchema = z.object({
  query: z.string().min(1),
  candidates: z.array(prechunkedCandidateSchema).min(1),
  topK: z.number().int().min(1).max(20).default(5),
});

export const filesystemBrowseInputSchema = z.object({
  path: z.string().min(1),
  recursive: z.boolean().optional(),
  maxDepth: z.number().int().min(0).max(32).optional(),
  maxEntries: z.number().int().min(1).max(5000).optional(),
  includeHidden: z.boolean().optional(),
});

export const fileInfoInputSchema = z.object({
  path: z.string().min(1),
});

export const readFileInputSchema = z.object({
  path: z.string().min(1),
  startLine: z.number().int().min(0).optional(),
  maxLines: z.number().int().min(1).max(2000).optional(),
  maxChars: z.number().int().min(1).max(200000).optional(),
});

export const ragEvidenceBlockSchema = z.object({
  label: z.string(),
  fileName: z.string(),
  content: z.string(),
  score: z.number().finite(),
});

export const ragAnswerOutputSchema = z.object({
  answer: z.string(),
  route: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  evidence: z.array(ragEvidenceBlockSchema),
  unsupportedClaimWarnings: z.array(z.string()),
});

export const ragSearchOutputSchema = z.object({
  candidates: z.array(prechunkedCandidateSchema),
  route: z.string().optional(),
});

export const ragPreparePromptOutputSchema = z.object({
  route: z.string(),
  preparedPrompt: z.string(),
  evidence: z.array(ragEvidenceBlockSchema),
  diagnostics: z.object({
    route: z.string(),
    retrievalQueries: z.array(z.string()).optional(),
    notes: z.array(z.string()).optional(),
    degraded: z.boolean().optional(),
    runtimeCapabilities: z.array(z.string()).optional(),
  }),
  unsupportedClaimWarnings: z.array(z.string()),
});

export const corpusInspectOutputSchema = z.object({
  fileCount: z.number().int().nonnegative(),
  chunkCount: z.number().int().nonnegative().optional(),
  estimatedTokens: z.number().int().nonnegative().optional(),
  recommendedRoute: z.string(),
  fullContextViable: z.boolean(),
  retrievalRecommended: z.boolean(),
});

export const rerankOnlyOutputSchema = z.object({
  candidates: z.array(prechunkedCandidateSchema),
  reasons: z.array(z.string()).optional(),
});

export const filesystemBrowseEntrySchema = z.object({
  path: z.string(),
  name: z.string(),
  type: z.enum(["file", "directory"]),
  sizeBytes: z.number().int().nonnegative().optional(),
  extension: z.string().optional(),
});

export const fileExtensionCountSchema = z.object({
  extension: z.string(),
  count: z.number().int().nonnegative(),
});

export const filesystemBrowseOutputSchema = z.object({
  requestedPath: z.string(),
  resolvedPath: z.string(),
  cwd: z.string(),
  exists: z.boolean(),
  type: z.enum(["file", "directory"]).optional(),
  entries: z.array(filesystemBrowseEntrySchema),
  truncated: z.boolean(),
  directoryCount: z.number().int().nonnegative().optional(),
  fileCount: z.number().int().nonnegative().optional(),
  topExtensions: z.array(fileExtensionCountSchema).optional(),
  errors: z.array(z.string()).optional(),
});

export const fileInfoOutputSchema = z.object({
  requestedPath: z.string(),
  resolvedPath: z.string(),
  cwd: z.string(),
  exists: z.boolean(),
  type: z.enum(["file", "directory"]).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  modifiedTimeMs: z.number().nonnegative().optional(),
  extension: z.string().optional(),
  textLike: z.boolean().optional(),
  childCount: z.number().int().nonnegative().optional(),
  directoryCount: z.number().int().nonnegative().optional(),
  fileCount: z.number().int().nonnegative().optional(),
  topExtensions: z.array(fileExtensionCountSchema).optional(),
  errors: z.array(z.string()).optional(),
});

export const readFileOutputSchema = z.object({
  requestedPath: z.string(),
  resolvedPath: z.string(),
  cwd: z.string(),
  exists: z.boolean(),
  startLine: z.number().int().nonnegative().optional(),
  endLine: z.number().int().nonnegative().optional(),
  content: z.string().optional(),
  truncated: z.boolean(),
  errors: z.array(z.string()).optional(),
});

export type RagAnswerInput = z.infer<typeof ragAnswerInputSchema>;
export type RagSearchInput = z.infer<typeof ragSearchInputSchema>;
export type RagPreparePromptInput = z.infer<typeof ragPreparePromptInputSchema>;
export type CorpusInspectInput = z.infer<typeof corpusInspectInputSchema>;
export type RerankOnlyInput = z.infer<typeof rerankOnlyInputSchema>;
export type FileSystemBrowseInput = z.infer<typeof filesystemBrowseInputSchema>;
export type FileInfoInput = z.infer<typeof fileInfoInputSchema>;
export type ReadFileInput = z.infer<typeof readFileInputSchema>;
export type RagAnswerOutput = z.infer<typeof ragAnswerOutputSchema>;
export type RagSearchOutput = z.infer<typeof ragSearchOutputSchema>;
export type RagPreparePromptOutput = z.infer<typeof ragPreparePromptOutputSchema>;
export type CorpusInspectOutput = z.infer<typeof corpusInspectOutputSchema>;
export type RerankOnlyOutput = z.infer<typeof rerankOnlyOutputSchema>;
export type FileSystemBrowseOutput = z.infer<typeof filesystemBrowseOutputSchema>;
export type FileInfoOutput = z.infer<typeof fileInfoOutputSchema>;
export type ReadFileOutput = z.infer<typeof readFileOutputSchema>;
