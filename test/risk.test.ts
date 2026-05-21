import test from "node:test";
import assert from "node:assert/strict";
import { analyzeRisk, buildRiskEvidence, formatMarkdown } from "../src/risk.js";

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
    bugFixCommitsByFile: {
      "src/hot.js": [
        {
          hash: "abcdef123456",
          shortHash: "abcdef1",
          description: "Fix hot path",
        },
      ],
    },
    ticketJudgment: {
      candidates: [
        {
          file: "src/hot.js",
          likelyToChange: true,
          confidence: 0.8,
          reason: "Tickets mention this area.",
          sourceReferences: [
            {
              id: "github-issue:1",
              title: "#1 Fix hot path",
              url: "https://github.com/owner/repo/issues/1",
              similarity: 0.91,
            },
          ],
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
    bugFixes: [
      {
        hash: "abcdef123456",
        shortHash: "abcdef1",
        description: "Fix hot path",
      },
    ],
    sourceLikely: true,
    sourceConfidence: 0.8,
    sourceReason: "Tickets mention this area.",
    sourceReferences: [
      {
        id: "github-issue:1",
        title: "#1 Fix hot path",
        url: "https://github.com/owner/repo/issues/1",
        similarity: 0.91,
      },
    ],
  });
});

test("analyzeRisk uses LLM risk assessment levels and sorts by risk", () => {
  const result = analyzeRisk({
    files: ["src/hot.js", "src/cold.js", "src/medium.js"],
    fileChangeMap: {
      "src/hot.js": 10,
      "src/cold.js": 1,
      "src/medium.js": 0,
    },
    bugFixFiles: {
      "src/hot.js": 2,
    },
    bugFixCommitsByFile: {
      "src/hot.js": [
        {
          hash: "abcdef123456",
          shortHash: "abcdef1",
          description: "Fix hot path",
        },
      ],
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
          sourceReferences: [
            {
              id: "github-issue:1",
              title: "#1 Fix hot path",
              url: "https://github.com/owner/repo/issues/1",
              similarity: 0.91,
            },
          ],
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
        {
          file: "src/medium.js",
          level: "medium",
          reason: "Some model concern despite little history.",
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
      cacheFile: ".fks2g/cache.json",
      providerModule: "@ai-sdk/openai",
      providerExport: "openai",
      format: "markdown",
      model: "test-model",
      embeddingModel: "test-embedding",
      quiet: true,
    },
  });

  assert.equal(result.files.at(0)?.file, "src/hot.js");
  assert.equal(result.files.at(0)?.level, "high");
  assert.match(result.files.at(0)?.reason ?? "", /Hot code/);
  assert.equal(result.files.at(1)?.file, "src/medium.js");
  assert.equal(result.files.at(1)?.level, "medium");
  assert.equal(result.files.at(2)?.level, "low");
});

test("formatMarkdown renders readable file sections", () => {
  const markdown = formatMarkdown({
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
        bugFixes: [
          {
            hash: "abcdef123456",
            shortHash: "abcdef1",
            description: "Fix example",
          },
        ],
        sourceLikely: false,
        sourceConfidence: 0,
        sourceReason: "",
        sourceReferences: [
          {
            id: "github-issue:42",
            title: "#42 Example issue",
            url: "https://github.com/owner/repo/issues/42",
            similarity: 0.77,
          },
        ],
        file: "src/example.js",
      },
    ],
  });

  assert.match(markdown, /# Risk report for owner\/repo/);
  assert.match(markdown, /## src\/example\.js:medium/);
  assert.match(markdown, /Risk reason: Model says this is medium risk\./);
  assert.match(markdown, /Recent bug fixes: abcdef1: Fix example/);
  assert.match(markdown, /Source references: \[#42 Example issue\]\(https:\/\/github\.com\/owner\/repo\/issues\/42\)/);
});
