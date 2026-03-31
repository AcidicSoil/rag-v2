import type { RagEvidenceBlock } from "./contracts";
import type {
  RagSafetySanitizationOptions,
  RagStrictGroundingMode,
} from "./policyContracts";

const INSTRUCTIONAL_PATTERNS = [
  /\b(ignore (all|any|previous|prior) instructions?)\b/gi,
  /\b(system prompt)\b/gi,
  /\bdeveloper message\b/gi,
  /\bdo not follow the above\b/gi,
  /\byou are chatgpt\b/gi,
  /\bact as\b/gi,
  /\bfollow these steps\b/gi,
  /\brespond with only\b/gi,
];

export function containsCoreInstructionLikeText(value: string) {
  return INSTRUCTIONAL_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(value);
  });
}

function normalizeWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[\t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeCoreRetrievedText(
  value: string,
  options: RagSafetySanitizationOptions
) {
  if (!options.sanitizeRetrievedText) {
    return value;
  }

  let sanitized = normalizeWhitespace(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/```[\s\S]*?```/g, (match) => normalizeWhitespace(match))
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");

  if (options.stripInstructionalSpans) {
    for (const pattern of INSTRUCTIONAL_PATTERNS) {
      sanitized = sanitized.replace(pattern, "[instruction-like text removed]");
    }
  }

  return normalizeWhitespace(sanitized);
}

export function sanitizeCoreEvidenceBlocks(
  blocks: Array<RagEvidenceBlock>,
  options: RagSafetySanitizationOptions
): Array<RagEvidenceBlock> {
  return blocks.map((block) => ({
    ...block,
    content: sanitizeCoreRetrievedText(block.content, options),
  }));
}

export function buildCoreGroundingInstruction(
  strictGroundingMode: RagStrictGroundingMode
) {
  if (strictGroundingMode === "require-evidence") {
    return (
      "Use only the evidence above when answering. If the evidence does not support an answer, say that clearly and do not guess."
    );
  }

  if (strictGroundingMode === "warn-on-weak-evidence") {
    return (
      "Prefer the evidence above when it is relevant. If the evidence is weak or incomplete, say so clearly before giving a cautious answer."
    );
  }

  return (
    "Use the evidence above when it is relevant and supported by the cited file content. If the evidence is insufficient, say so clearly instead of guessing."
  );
}
