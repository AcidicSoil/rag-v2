import type { RagEvidenceBlock } from "../../core/src/contracts";
import {
  toRagCandidates,
  toRetrievalResultEntries,
} from "../../lmstudio-shared/src/lmstudioCoreBridge";
import type { EvidenceBlock } from "./types/evidence";

export { toRagCandidates, toRetrievalResultEntries };

export function toEvidenceBlocks(
  blocks: Array<RagEvidenceBlock>
): Array<EvidenceBlock> {
  return blocks.map((block) => ({
    label: block.label,
    fileName: block.fileName,
    content: block.content,
    score: block.score,
    entry: toRetrievalResultEntries([block.candidate])[0]!,
  }));
}
