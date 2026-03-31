import type { LLMDynamicHandle, RetrievalResultEntry } from "@lmstudio/sdk";
import type { ModelRerankScore, RankedRetrievalEntry } from "./types/rerank";

const MODEL_RERANK_SCORE_WEIGHT = 0.8;
const HEURISTIC_SCORE_WEIGHT = 0.2;

export function buildModelRerankPrompt(
  userQuery: string,
  entries: Array<RankedRetrievalEntry>
): string {
  const candidates = entries
    .map(
      (entry, index) =>
        `Candidate ${index + 1}\n` +
        `File: ${entry.entry.source.name}\n` +
        `Heuristic score: ${entry.rerankScore.toFixed(3)}\n` +
        `Content:\n${entry.entry.content}`
    )
    .join("\n\n---\n\n");

  return [
    "You are ranking retrieved evidence for a RAG system.",
    "Score each candidate for how well it helps answer the user query.",
    "Prefer directly answer-supporting evidence over merely related context.",
    "Return JSON only.",
    "Use this exact schema:",
    '{"scores":[{"index":1,"relevance":0.0,"rationale":"short reason"}]}',
    "Index values are 1-based and must correspond to the listed candidates.",
    "Relevance must be a number from 0.0 to 1.0.",
    `User query: ${userQuery}`,
    "Candidates:",
    candidates,
  ].join("\n\n");
}

export function parseModelRerankResponse(response: string): Array<ModelRerankScore> {
  const normalized = response.trim();
  const codeFenceMatch = normalized.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const jsonPayload = codeFenceMatch?.[1] ?? extractJSONObject(normalized);
  if (!jsonPayload) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonPayload) as {
      scores?: Array<{ index?: unknown; relevance?: unknown; rationale?: unknown }>;
    };
    return (parsed.scores ?? [])
      .map((item) => ({
        index: Number(item.index),
        relevance: Number(item.relevance),
        rationale:
          typeof item.rationale === "string" && item.rationale.trim().length > 0
            ? item.rationale.trim()
            : undefined,
      }))
      .filter(
        (item) =>
          Number.isInteger(item.index) &&
          item.index > 0 &&
          Number.isFinite(item.relevance)
      )
      .map((item) => ({
        ...item,
        relevance: clamp(item.relevance, 0, 1),
      }));
  } catch {
    return [];
  }
}

export function applyModelRerankScores(
  heuristicEntries: Array<RankedRetrievalEntry>,
  modelScores: Array<ModelRerankScore>,
  topK: number
): Array<RankedRetrievalEntry> {
  const scoresByIndex = new Map<number, ModelRerankScore>();
  for (const item of modelScores) {
    if (!scoresByIndex.has(item.index)) {
      scoresByIndex.set(item.index, item);
    }
  }

  return heuristicEntries
    .map((entry, index) => {
      const modelScore = scoresByIndex.get(index + 1)?.relevance;
      if (typeof modelScore !== "number") {
        return entry;
      }

      const blendedScore =
        entry.rerankScore * HEURISTIC_SCORE_WEIGHT +
        modelScore * MODEL_RERANK_SCORE_WEIGHT;

      return {
        ...entry,
        rerankScore: blendedScore,
      };
    })
    .sort((left, right) => right.rerankScore - left.rerankScore)
    .slice(0, topK);
}

export async function performModelAssistedRerank(
  model: LLMDynamicHandle,
  userQuery: string,
  heuristicEntries: Array<RankedRetrievalEntry>,
  topK: number,
  abortSignal: AbortSignal
): Promise<{
  rerankedEntries: Array<RankedRetrievalEntry>;
  rawResponse: string;
  parsedScores: Array<ModelRerankScore>;
}> {
  const prompt = buildModelRerankPrompt(userQuery, heuristicEntries);
  const response = await model.complete(prompt, {
    temperature: 0,
    maxTokens: 300,
    stopStrings: ["\n\nCandidate"],
    signal: abortSignal,
  });
  const rawResponse = response.content.trim();
  const parsedScores = parseModelRerankResponse(rawResponse);
  const rerankedEntries =
    parsedScores.length > 0
      ? applyModelRerankScores(heuristicEntries, parsedScores, topK)
      : heuristicEntries.slice(0, topK);

  return {
    rerankedEntries,
    rawResponse,
    parsedScores,
  };
}

function extractJSONObject(value: string): string {
  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    return "";
  }
  return value.slice(firstBrace, lastBrace + 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
