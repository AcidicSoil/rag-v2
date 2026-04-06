import { readFileSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { RetrievalResultEntry } from "@lmstudio/sdk";
import { dedupeEvidenceEntries } from "../packages/adapter-lmstudio/src/evidence";
import { runAnswerabilityGate } from "../packages/adapter-lmstudio/src/gating";
import { buildEvalMetrics } from "../packages/adapter-lmstudio/src/metrics";
import { generateQueryRewrites } from "../packages/adapter-lmstudio/src/queryRewrite";
import { mergeHybridCandidates } from "../packages/adapter-lmstudio/src/hybridRetrieve";
import { lexicalRetrieve } from "../packages/adapter-lmstudio/src/lexicalRetrieve";
import { rerankRetrievalEntries } from "../packages/adapter-lmstudio/src/rerank";
import { buildGroundingInstruction, sanitizeRetrievedText } from "../packages/adapter-lmstudio/src/safety";
import type { EvalCase } from "../packages/adapter-lmstudio/src/types/eval";
import type { RerankStrategy } from "../packages/lmstudio-shared/src/rerankTypes";
import type { StrictGroundingMode } from "../packages/adapter-lmstudio/src/types/safety";

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

function loadCaseSuites(casesDir: string): Array<{ name: string; path: string; cases: Array<EvalCase> }> {
  return readdirSync(casesDir)
    .filter((fileName) => fileName.endsWith(".jsonl"))
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => ({
      name: fileName.replace(/\.jsonl$/, ""),
      path: join(casesDir, fileName),
      cases: loadCases(join(casesDir, fileName)),
    }));
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
    case "rerank": {
      const prompt = String(testCase.input.prompt);
      const entries = ((testCase.input.entries as Array<any>) ?? []).map(
        makeRetrievalEntry
      );
      const topK = Number(testCase.input.topK ?? entries.length);
      const strategy = String(
        testCase.input.strategy ?? "heuristic-v1"
      ) as RerankStrategy;
      const ranked = rerankRetrievalEntries(prompt, entries, {
        topK,
        strategy,
      });
      const expectedTopSourceName = String(
        testCase.expected.topSourceName ?? ""
      );
      const expectedTopIncludes = String(
        testCase.expected.topIncludes ?? ""
      );
      const expectedLastIncludes = String(
        testCase.expected.lastIncludes ?? ""
      );
      const minTopLexicalOverlap = Number(
        testCase.expected.minTopLexicalOverlap ?? 0
      );
      const maxSecondDiversityPenalty = Number(
        testCase.expected.maxSecondDiversityPenalty ?? Number.POSITIVE_INFINITY
      );

      assert(ranked.length > 0, "Expected at least one reranked entry.");
      if (expectedTopSourceName) {
        assert(
          ranked[0]?.entry.source.name === expectedTopSourceName,
          `Expected top source '${expectedTopSourceName}', got '${ranked[0]?.entry.source.name}'.`
        );
      }
      if (expectedTopIncludes) {
        assert(
          ranked[0]?.entry.content.includes(expectedTopIncludes),
          `Expected top reranked entry to include '${expectedTopIncludes}'.`
        );
      }
      if (expectedLastIncludes) {
        assert(
          ranked[ranked.length - 1]?.entry.content.includes(expectedLastIncludes),
          `Expected last reranked entry to include '${expectedLastIncludes}'.`
        );
      }
      assert(
        ranked[0]!.features.lexicalOverlap >= minTopLexicalOverlap,
        `Expected top lexical overlap >= ${minTopLexicalOverlap}, got ${ranked[0]!.features.lexicalOverlap}.`
      );
      if (ranked.length > 1 && Number.isFinite(maxSecondDiversityPenalty)) {
        assert(
          ranked[1]!.features.diversityPenalty <= maxSecondDiversityPenalty,
          `Expected second diversity penalty <= ${maxSecondDiversityPenalty}, got ${ranked[1]!.features.diversityPenalty}.`
        );
      }
      return { summary: `${testCase.id}: reranked ${ranked.length} entries` };
    }
    case "hybrid": {
      const prompt = String(testCase.input.prompt);
      const semanticEntries = ((testCase.input.semanticEntries as Array<any>) ?? []).map(
        makeRetrievalEntry
      );
      const documents = ((testCase.input.documents as Array<any>) ?? []).map((document) => ({
        file: makeFileHandle(String(document.fileName)),
        content: String(document.content),
      }));
      const lexicalEntries = lexicalRetrieve(
        prompt,
        documents,
        Number(testCase.input.lexicalCandidateCount ?? 4)
      );
      const hybrid = mergeHybridCandidates(semanticEntries, lexicalEntries, {
        semanticWeight: Number(testCase.input.semanticWeight ?? 0.65),
        lexicalWeight: Number(testCase.input.lexicalWeight ?? 0.35),
        maxCandidates: Number(testCase.input.hybridCandidateCount ?? 6),
      });
      const mustContain = String(testCase.expected.mustContain ?? "");
      const minLexicalEntries = Number(testCase.expected.minLexicalEntries ?? 0);
      const minHybridEntries = Number(testCase.expected.minHybridEntries ?? 0);

      assert(
        lexicalEntries.length >= minLexicalEntries,
        `Expected at least ${minLexicalEntries} lexical entries, got ${lexicalEntries.length}.`
      );
      assert(
        hybrid.length >= minHybridEntries,
        `Expected at least ${minHybridEntries} hybrid entries, got ${hybrid.length}.`
      );
      if (mustContain) {
        assert(
          hybrid.some((entry) => entry.content.includes(mustContain)),
          `Expected hybrid candidates to include '${mustContain}'.`
        );
      }
      return { summary: `${testCase.id}: hybrid ${hybrid.length} entries` };
    }
    default:
      throw new Error(`Unsupported eval component: ${testCase.component}`);
  }
}

function main() {
  const casesDir = join(process.cwd(), "eval/cases");
  const resultDir = join(process.cwd(), "eval/results");
  const suites = loadCaseSuites(casesDir);
  const caseResults: Array<{
    suite: string;
    id: string;
    ok: boolean;
    summary: string;
    error?: string;
  }> = [];

  for (const suite of suites) {
    for (const testCase of suite.cases) {
      try {
        const result = evaluateCase(testCase);
        caseResults.push({
          suite: suite.name,
          id: testCase.id,
          ok: true,
          summary: result.summary,
        });
      } catch (error) {
        caseResults.push({
          suite: suite.name,
          id: testCase.id,
          ok: false,
          summary: `${testCase.id}: failed`,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const metrics = buildEvalMetrics(
    caseResults.length,
    caseResults.filter((result) => result.ok).length
  );

  const suiteMetrics = suites.map((suite) => {
    const suiteResults = caseResults.filter((result) => result.suite === suite.name);
    return {
      suite: suite.name,
      metrics: buildEvalMetrics(
        suiteResults.length,
        suiteResults.filter((result) => result.ok).length
      ),
    };
  });

  mkdirSync(resultDir, { recursive: true });
  const output = {
    generatedAt: new Date().toISOString(),
    metrics,
    suiteMetrics,
    caseResults,
  };
  const outputPath = join(resultDir, "all-latest.json");
  writeFileSync(outputPath, JSON.stringify(output, null, 2));

  console.log("Eval run complete.\n");
  console.log(`Suites: ${suites.length}`);
  console.log(`Cases: ${metrics.totalCases}`);
  console.log(`Passed: ${metrics.passedCases}`);
  console.log(`Failed: ${metrics.failedCases}`);
  console.log(`Accuracy: ${(metrics.accuracy * 100).toFixed(1)}%\n`);

  for (const suiteMetric of suiteMetrics) {
    console.log(
      `Suite ${suiteMetric.suite}: ${suiteMetric.metrics.passedCases}/${suiteMetric.metrics.totalCases} passed`
    );
  }
  console.log("");

  for (const result of caseResults) {
    console.log(`[${result.suite}] ${result.ok ? "PASS" : "FAIL"} ${result.summary}`);
    if (result.error) {
      console.log(`  ${result.error}`);
    }
  }

  if (metrics.failedCases > 0) {
    process.exit(1);
  }
}

main();
