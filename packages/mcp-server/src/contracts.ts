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

export const retrievalOverridesSchema = z.object({
  multiQueryEnabled: z.boolean().optional(),
  multiQueryCount: z.number().int().min(1).max(8).optional(),
  fusionMethod: z.enum(["reciprocal-rank-fusion", "max-score"]).optional(),
  hybridEnabled: z.boolean().optional(),
  rerankEnabled: z.boolean().optional(),
  rerankTopK: z.number().int().min(1).max(20).optional(),
  maxEvidenceBlocks: z.number().int().min(1).max(20).optional(),
}).optional();

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

export type RagAnswerInput = z.infer<typeof ragAnswerInputSchema>;
export type RagSearchInput = z.infer<typeof ragSearchInputSchema>;
export type CorpusInspectInput = z.infer<typeof corpusInspectInputSchema>;
export type RerankOnlyInput = z.infer<typeof rerankOnlyInputSchema>;
export type RagAnswerOutput = z.infer<typeof ragAnswerOutputSchema>;
export type RagSearchOutput = z.infer<typeof ragSearchOutputSchema>;
export type CorpusInspectOutput = z.infer<typeof corpusInspectOutputSchema>;
export type RerankOnlyOutput = z.infer<typeof rerankOnlyOutputSchema>;
