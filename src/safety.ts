import {
  buildCoreGroundingInstruction,
  containsCoreInstructionLikeText,
  sanitizeCoreEvidenceBlocks,
  sanitizeCoreRetrievedText,
} from "./core/safety";
import { buildRagEvidenceBlocks } from "./core/retrievalPipeline";
import { toEvidenceBlocks, toRagCandidates } from "./lmstudioCoreBridge";
import type { EvidenceBlock } from "./types/evidence";
import type {
  SafetySanitizationOptions,
  StrictGroundingMode,
} from "./types/safety";

export function containsInstructionLikeText(value: string) {
  return containsCoreInstructionLikeText(value);
}

export function sanitizeRetrievedText(
  value: string,
  options: SafetySanitizationOptions
) {
  return sanitizeCoreRetrievedText(value, options);
}

export function sanitizeEvidenceBlocks(
  blocks: Array<EvidenceBlock>,
  options: SafetySanitizationOptions
): Array<EvidenceBlock> {
  return toEvidenceBlocks(
    sanitizeCoreEvidenceBlocks(
      buildRagEvidenceBlocks(toRagCandidates(blocks.map((block) => block.entry))),
      options
    )
  ).map((sanitizedBlock, index) => ({
    ...blocks[index]!,
    content: sanitizedBlock.content,
  }));
}

export function buildGroundingInstruction(strictGroundingMode: StrictGroundingMode) {
  return buildCoreGroundingInstruction(strictGroundingMode);
}
