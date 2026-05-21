import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRisk, buildRiskEvidence, formatTable } from "../src/risk.js";

test("buildRiskEvidence collects frequency, bug-fix, and source signals without scoring", () => {
  const evidence = buildRiskEvidence({
    files: ["src/hot.js", "src/cold.js"],
    fileChangeMap: {
      "src/hot.js": 10,
      "src/cold.js": 1,
    },
    bugFixFiles: {
      "src/hot.js": 2,
    },
    ticketJudgment: {
      candidates: [
        {
          file: "src/hot.js",
          likelyToChange: true,
          confidence: 0.8,
          reason: "Tickets mention this area.",
        },
      ],
      rationale: "One file is close to current tickets.",
    },
  });

  assert.deepEqual(evidence.at(0), {
    file: "src/hot.js",
    changes: 10,
    frequency: "Often",
    bugFixCount: 2,
    sourceLikely: true,
    sourceConfidence: 0.8,
    sourceReason: "Tickets mention this area.",
  });
});

test("analyzeRisk uses LLM risk assessment levels and reasons", () => {
  const result = analyzeRisk({
    files: ["src/hot.js", "src/cold.js"],
    fileChangeMap: {
      "src/hot.js": 10,
      "src/cold.js": 1,
    },
    bugFixFiles: {
      "src/hot.js": 2,
    },
    bugFixClassification: {
      bugFixCommitHashes: ["abc", "def"],
      rationale: "Recent fixes touched hot code.",
    },
    ticketJudgment: {
      candidates: [
        {
          file: "src/hot.js",
          likelyToChange: true,
          confidence: 0.8,
          reason: "Tickets mention this area.",
        },
      ],
      rationale: "One file is close to current tickets.",
    },
    riskAssessment: {
      files: [
        {
          file: "src/hot.js",
          level: "high",
          reason: "Hot code with recent bug fixes and source-document pressure.",
        },
        {
          file: "src/cold.js",
          level: "low",
          reason: "Rarely changed and not connected to upcoming work.",
        },
      ],
      rationale: "Risk is based on model reasoning over the evidence.",
    },
    documents: [
      {
        id: "github-issue:1",
        source: "github-issues",
        title: "Example issue",
        body: "Example body",
        metadata: {
          number: 1,
          labels: ["bug"],
          updatedAt: "2026-05-20T00:00:00.000Z",
        },
        url: "https://github.com/owner/repo/issues/1",
      },
    ],
    repoLabel: "owner/repo",
    options: {
      embeddingSource: "github-issues",
      bugRecencyDays: 30,
      issueRecencyDays: 30,
      issueLabel: ["bug"],
      textGlob: "**/*.{txt,md,markdown}",
      maxFiles: 50,
      topFiles: 3,
      repo: ".",
      cacheFile: ".f2g/cache.json",
      providerModule: "@ai-sdk/openai",
      providerExport: "openai",
      format: "table",
      model: "test-model",
      embeddingModel: "test-embedding",
    },
  });

  assert.equal(result.files.at(0)?.file, "src/hot.js");
  assert.equal(result.files.at(0)?.level, "high");
  assert.match(result.files.at(0)?.reason ?? "", /Hot code/);
  assert.equal(result.files.at(1)?.level, "low");
});

test("formatTable includes useful summary columns", () => {
  const table = formatTable({
    repo: "owner/repo",
    embeddingSource: "text-folder",
    generatedAt: "2026-05-20T00:00:00.000Z",
    inputs: {
      bugRecencyDays: 30,
      issueRecencyDays: 30,
      issueLabels: [],
      textFolder: "/tmp/transcripts",
      textGlob: "**/*.txt",
      maxFiles: 50,
      topFiles: 3,
      model: "test-model",
      embeddingModel: "test-embedding",
    },
    summary: {
      filesAnalyzed: 1,
      matchingDocuments: 2,
      bugFixCommits: 1,
      bugFixRationale: "Bug fix rationale.",
      sourceRationale: "Source rationale.",
      riskRationale: "Risk rationale.",
    },
    files: [
      {
        level: "medium",
        reason: "Model says this is medium risk.",
        changes: 4,
        frequency: "Often",
        bugFixCount: 1,
        sourceLikely: false,
        sourceConfidence: 0,
        sourceReason: "",
        file: "src/example.js",
      },
    ],
  });

  assert.match(table, /Repository: owner\/repo/);
  assert.match(table, /src\/example\.js/);
});
