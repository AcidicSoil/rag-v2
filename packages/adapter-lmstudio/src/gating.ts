import type { FileHandle } from "@lmstudio/sdk";
import {
  buildCoreAmbiguousGateMessage,
  buildCoreLikelyUnanswerableGateMessage,
  runCoreAnswerabilityGate,
} from "../../core/src/gating";
import type {
  AmbiguousQueryBehavior,
  AnswerabilityGateResult,
} from "./types/gating";

function toFileRefs(files: Array<FileHandle>) {
  return files.map((file) => ({
    id: file.identifier,
    name: file.name,
  }));
}

export function runAnswerabilityGate(
  prompt: string,
  files: Array<FileHandle>,
  threshold: number
): AnswerabilityGateResult {
  return runCoreAnswerabilityGate(prompt, toFileRefs(files), threshold);
}

export function buildAmbiguousGateMessage(
  prompt: string,
  files: Array<FileHandle>,
  behavior: AmbiguousQueryBehavior
) {
  return buildCoreAmbiguousGateMessage(prompt, toFileRefs(files), behavior);
}

export function buildLikelyUnanswerableGateMessage(prompt: string) {
  return buildCoreLikelyUnanswerableGateMessage(prompt);
}
