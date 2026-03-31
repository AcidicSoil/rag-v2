import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RetrievalResultEntry } from "@lmstudio/sdk";
import { dedupeEvidenceEntries } from "../src/evidence";
import { runAnswerabilityGate } from "../src/gating";
import { buildEvalMetrics } from "../src/metrics";
import { generateQueryRewrites } from "../src/queryRewrite";
import { buildGroundingInstruction, sanitizeRetrievedText } from "../src/safety";
import type { EvalCase } from "../src/types/eval";
import type { StrictGroundingMode } from "../src/types/safety";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function loadCases(path: string): Array<EvalCase> {
  const raw = readFileSync(path, "utf8");
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as EvalCase);
}

function makeFileHandle(name: string) {
  return {
    identifier: name,
    name,
  } as any;
}

function makeRetrievalEntry(entry: {
  content: string;
  score: number;
  sourceIdentifier: string;
  sourceName: string;
}): RetrievalResultEntry {
  return {
    content: entry.content,
    score: entry.score,
    source: {
      identifier: entry.sourceIdentifier,
      name: entry.sourceName,
    } as any,
  };
}

function evaluateCase(testCase: EvalCase) {
  switch (testCase.component) {
    case "gate": {
      const prompt = String(testCase.input.prompt);
      const files = ((testCase.input.files as Array<string>) ?? []).map((name) =>
        makeFileHandle(name)
      );
      const threshold = Number(testCase.input.threshold ?? 0.7);
      const result = runAnswerabilityGate(prompt, files, threshold);
      const expectedDecision = String(testCase.expected.decision);
      assert(
        result.decision === expectedDecision,
        `Expected decision '${expectedDecision}', got '${result.decision}'.`
      );
      return { summary: `${testCase.id}: ${result.decision}` };
    }
    case "rewrite": {
      const prompt = String(testCase.input.prompt);
      const count = Number(testCase.input.count ?? 4);
      const rewrites = generateQueryRewrites(prompt, count);
      const minRewrites = Number(testCase.expected.minRewrites ?? 1);
      const mustIncludeLabels =
        (testCase.expected.mustIncludeLabels as Array<string>) ?? [];
      assert(
        rewrites.length >= minRewrites,
        `Expected at least ${minRewrites} rewrites, got ${rewrites.length}.`
      );
      for (const label of mustIncludeLabels) {
        assert(
          rewrites.some((rewrite) => rewrite.label === label),
          `Expected rewrite label '${label}' to be present.`
        );
      }
      return {
        summary: `${testCase.id}: ${rewrites.length} rewrites`,
      };
    }
    case "evidence": {
      const entries = ((testCase.input.entries as Array<any>) ?? []).map(
        makeRetrievalEntry
      );
      const threshold = Number(testCase.input.threshold ?? 0.85);
      const maxEvidenceBlocks = Number(testCase.input.maxEvidenceBlocks ?? 4);
      const deduped = dedupeEvidenceEntries(
        entries,
        threshold,
        maxEvidenceBlocks
      );
      const expectedLength = Number(testCase.expected.dedupedLength ?? 0);
      assert(
        deduped.length === expectedLength,
        `Expected ${expectedLength} deduped entries, got ${deduped.length}.`
      );
      return { summary: `${testCase.id}: ${deduped.length} deduped entries` };
    }
    case "safety": {
      const text = String(testCase.input.text);
      const sanitizeEnabled = Boolean(testCase.input.sanitizeRetrievedText);
      const stripInstructionalSpans = Boolean(
        testCase.input.stripInstructionalSpans
      );
      const strictGroundingMode = String(
        testCase.input.strictGroundingMode ?? "warn-on-weak-evidence"
      ) as StrictGroundingMode;
      const sanitized = sanitizeRetrievedText(text, {
        sanitizeRetrievedText: sanitizeEnabled,
        stripInstructionalSpans,
      });
      const mustContain = String(testCase.expected.mustContain ?? "");
      const mustNotContain =
        (testCase.expected.mustNotContain as Array<string>) ?? [];
      const groundingIncludes = String(testCase.expected.groundingIncludes ?? "");
      if (mustContain) {
        assert(
          sanitized.includes(mustContain),
          `Expected sanitized text to include '${mustContain}'.`
        );
      }
      for (const disallowed of mustNotContain) {
        assert(
          !sanitized.toLowerCase().includes(disallowed.toLowerCase()),
          `Expected sanitized text not to include '${disallowed}'.`
        );
      }
      const groundingInstruction = buildGroundingInstruction(strictGroundingMode);
      if (groundingIncludes) {
        assert(
          groundingInstruction.toLowerCase().includes(groundingIncludes.toLowerCase()),
          `Expected grounding instruction to include '${groundingIncludes}'.`
        );
      }
      return { summary: `${testCase.id}: sanitized` };
    }
    default:
      throw new Error(`Unsupported eval component: ${testCase.component}`);
  }
}

function main() {
  const casesPath = join(process.cwd(), "eval/cases/basic.jsonl");
  const resultDir = join(process.cwd(), "eval/results");
  const cases = loadCases(casesPath);
  const caseResults: Array<{ id: string; ok: boolean; summary: string; error?: string }> = [];

  for (const testCase of cases) {
    try {
      const result = evaluateCase(testCase);
      caseResults.push({
        id: testCase.id,
        ok: true,
        summary: result.summary,
      });
    } catch (error) {
      caseResults.push({
        id: testCase.id,
        ok: false,
        summary: `${testCase.id}: failed`,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const metrics = buildEvalMetrics(
    caseResults.length,
    caseResults.filter((result) => result.ok).length
  );

  mkdirSync(resultDir, { recursive: true });
  const output = {
    generatedAt: new Date().toISOString(),
    metrics,
    caseResults,
  };
  const outputPath = join(resultDir, "basic-latest.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("Eval run complete.\n");
  console.log(`Cases: ${metrics.totalCases}`);
  console.log(`Passed: ${metrics.passedCases}`);
  console.log(`Failed: ${metrics.failedCases}`);
  console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%\n`);

  for (const result of caseResults) {
    console.log(`${result.ok ? "PASS" : "FAIL"} ${result.summary}`);
    if (result.error) {
      console.log(`  ${result.error}`);
    }
  }

  if (metrics.failedCases > 0) {
    process.exit(1);
  }
}

main();
