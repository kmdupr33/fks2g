import test from "node:test";
import assert from "node:assert/strict";
import {
  buildBenchmarkFileResult,
  calculateMeanSquaredError,
  formatBenchmarkMarkdown,
  predictionForRiskLevel,
} from "../src/benchmark.js";

test("predictionForRiskLevel maps ratings to benchmark probabilities", () => {
  assert.equal(predictionForRiskLevel("low"), 0.33);
  assert.equal(predictionForRiskLevel("medium"), 0.66);
  assert.equal(predictionForRiskLevel("high"), 0.99);
});

test("buildBenchmarkFileResult scores actual follow-up changes", () => {
  const result = buildBenchmarkFileResult({
    commit: "abcdef123456",
    date: "2026-05-01",
    file: "src/example.ts",
    level: "medium",
    changedInForecastWindow: true,
    bugFixInForecastWindow: false,
  });

  assert.equal(result.prediction, 0.66);
  assert.equal(result.actual, 1);
  assert.equal(result.squaredError, (0.66 - 1) ** 2);
});

test("calculateMeanSquaredError averages file squared errors", () => {
  assert.equal(calculateMeanSquaredError([{ squaredError: 0.25 }, { squaredError: 0.75 }]), 0.5);
  assert.equal(calculateMeanSquaredError([]), 0);
});

test("formatBenchmarkMarkdown renders the overall MSE and per-file outcomes", () => {
  const markdown = formatBenchmarkMarkdown({
    repo: "/tmp/repo",
    generatedAt: "2026-05-29T00:00:00.000Z",
    inputs: {
      bugRecencyDays: 90,
      issueRecencyDays: 30,
      issueLabels: [],
      textGlob: "**/*.md",
      maxFiles: 0,
      topFiles: 3,
      model: "test-model",
      embeddingModel: "test-embedding",
      forecastDays: 30,
    },
    summary: {
      commitsBenchmarked: 1,
      filesBenchmarked: 1,
      mse: 0.1156,
    },
    commits: [
      {
        commit: "abcdef123456",
        shortCommit: "abcdef1",
        date: "2026-05-01",
        subject: "Change example",
        filesAnalyzed: 1,
        mse: 0.1156,
        files: [
          {
            commit: "abcdef123456",
            date: "2026-05-01",
            file: "src/example.ts",
            level: "medium",
            prediction: 0.66,
            actual: 1,
            squaredError: 0.1156,
            changedInForecastWindow: true,
            bugFixInForecastWindow: false,
          },
        ],
      },
    ],
  });

  assert.match(markdown, /Mean squared error: 0\.1156/);
  assert.match(markdown, /src\/example\.ts: medium \(0\.66\) -> 1/);
});
