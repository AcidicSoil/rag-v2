import { generateCoreQueryRewrites } from "./core/rewrite";
import type { QueryRewrite } from "./types/retrieval";

export function generateQueryRewrites(
  prompt: string,
  multiQueryCount: number
): QueryRewrite[] {
  return generateCoreQueryRewrites(prompt, multiQueryCount);
}
