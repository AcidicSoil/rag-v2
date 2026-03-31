import type { FileHandle } from "@lmstudio/sdk";
import type {
  AmbiguousQueryBehavior,
  AnswerabilityGateResult,
} from "./types/gating";

const SOCIAL_ONLY_PATTERNS = [
  /^(hi|hello|hey|yo|thanks|thank you|ok|okay|cool|great|nice)[!. ]*$/i,
  /^(good morning|good afternoon|good evening)[!. ]*$/i,
];

const AMBIGUOUS_PATTERNS = [
  /\b(this|that|it|these|those)\b/i,
  /\b(other one|which one|which file|which project)\b/i,
  /\b(what about|thoughts on|can you explain|help me understand)\b/i,
  /\b(more|details|clarify|expand)\b/i,
];

const CURRENT_EVENTS_PATTERNS = [
  /\b(today|latest|currently|right now|as of now|breaking news|most recent|current)\b/i,
  /\b(weather|forecast|stock price|share price|election|president|prime minister)\b/i,
  /\b(score|standings|market cap|exchange rate|super bowl|world cup|champion)\b/i,
];

function normalizePrompt(prompt: string) {
  return prompt.trim().replace(/\s+/g, " ");
}

function countPatternMatches(prompt: string, patterns: RegExp[]) {
  return patterns.reduce(
    (count, pattern) => count + (pattern.test(prompt) ? 1 : 0),
    0
  );
}

export function runAnswerabilityGate(
  prompt: string,
  files: Array<FileHandle>,
  threshold: number
): AnswerabilityGateResult {
  const normalizedPrompt = normalizePrompt(prompt);
  const lowerPrompt = normalizedPrompt.toLowerCase();
  const reasons: string[] = [];

  if (normalizedPrompt.length === 0) {
    return {
      decision: "ambiguous",
      confidence: 1,
      reasons: ["The user message is empty after normalization."],
    };
  }

  if (SOCIAL_ONLY_PATTERNS.some((pattern) => pattern.test(normalizedPrompt))) {
    return {
      decision: "no-retrieval-needed",
      confidence: 0.98,
      reasons: ["The prompt is conversational and does not ask for document evidence."],
    };
  }

  const ambiguousSignals = countPatternMatches(normalizedPrompt, AMBIGUOUS_PATTERNS);
  const currentEventSignals = countPatternMatches(normalizedPrompt, CURRENT_EVENTS_PATTERNS);
  const fileNameMentions = files.filter((file) =>
    lowerPrompt.includes(file.name.toLowerCase())
  ).length;
  const wordCount = normalizedPrompt.split(" ").length;

  if (wordCount <= 4 && ambiguousSignals > 0) {
    reasons.push("The prompt is very short and relies on deictic language.");
  }
  if (files.length > 1 && ambiguousSignals > 0 && fileNameMentions === 0) {
    reasons.push("Multiple files are available but the prompt does not identify which one to use.");
  }
  if (currentEventSignals > 0 && fileNameMentions === 0) {
    reasons.push("The prompt asks about likely external or time-sensitive information rather than attached-file content.");
  }

  if (reasons.length > 0) {
    const confidence = Math.min(0.55 + reasons.length * 0.2, 0.95);
    if (reasons.some((reason) => reason.includes("Multiple files")) && confidence >= threshold) {
      return { decision: "ambiguous", confidence, reasons };
    }
    if (reasons.some((reason) => reason.includes("time-sensitive")) && confidence >= threshold) {
      return { decision: "likely-unanswerable", confidence, reasons };
    }
  }

  return {
    decision: "retrieval-useful",
    confidence: 0.75,
    reasons: ["The prompt appears to request information that may be grounded in the provided files."],
  };
}

export function buildAmbiguousGateMessage(
  prompt: string,
  files: Array<FileHandle>,
  behavior: AmbiguousQueryBehavior
) {
  if (behavior === "attempt-best-effort") {
    return prompt;
  }

  const fileList = files.map((file) => `- ${file.name}`).join("\n");
  return [
    "The user request is ambiguous relative to the attached files.",
    "Ask one concise clarification question before answering.",
    "Mention the available files when helpful:",
    fileList,
    "Original user request:",
    prompt,
  ].join("\n\n");
}

export function buildLikelyUnanswerableGateMessage(prompt: string) {
  return [
    "Answer using only the attached-file evidence.",
    "If the files do not contain the requested information, say that clearly instead of guessing.",
    "Invite the user to attach a relevant document or restate the request in terms of the provided files.",
    "Original user request:",
    prompt,
  ].join("\n\n");
}
