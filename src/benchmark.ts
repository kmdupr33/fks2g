import type { BenchmarkCommitResult, BenchmarkFileResult, BenchmarkResult, RiskFile } from "./types.js";

const RISK_PROBABILITIES: Record<RiskFile["level"], number> = {
  low: 0.33,
  medium: 0.66,
  high: 0.99,
};

export function predictionForRiskLevel(level: RiskFile["level"]): number {
  return RISK_PROBABILITIES[level];
}

export function calculateSquaredError(prediction: number, actual: 0 | 1): number {
  return (prediction - actual) ** 2;
}

export function calculateMeanSquaredError(results: { squaredError: number }[]): number {
  if (results.length === 0) {
    return 0;
  }
  return results.reduce((sum, result) => sum + result.squaredError, 0) / results.length;
}

export function buildBenchmarkFileResult({
  commit,
  date,
  file,
  level,
  changedInForecastWindow,
  bugFixInForecastWindow,
}: {
  commit: string;
  date: string;
  file: string;
  level: RiskFile["level"];
  changedInForecastWindow: boolean;
  bugFixInForecastWindow: boolean;
}): BenchmarkFileResult {
  const prediction = predictionForRiskLevel(level);
  const actual = changedInForecastWindow || bugFixInForecastWindow ? 1 : 0;
  return {
    commit,
    date,
    file,
    level,
    prediction,
    actual,
    squaredError: calculateSquaredError(prediction, actual),
    changedInForecastWindow,
    bugFixInForecastWindow,
  };
}

export function finalizeBenchmarkResult(result: Omit<BenchmarkResult, "summary">): BenchmarkResult {
  const fileResults = result.commits.flatMap((commit) => commit.files);
  return {
    ...result,
    summary: {
      commitsBenchmarked: result.commits.length,
      filesBenchmarked: fileResults.length,
      mse: calculateMeanSquaredError(fileResults),
    },
  };
}

export function finalizeBenchmarkCommitResult(
  result: Omit<BenchmarkCommitResult, "filesAnalyzed" | "mse">,
): BenchmarkCommitResult {
  return {
    ...result,
    filesAnalyzed: result.files.length,
    mse: calculateMeanSquaredError(result.files),
  };
}

export function formatBenchmarkJson(result: BenchmarkResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatBenchmarkMarkdown(result: BenchmarkResult): string {
  return [
    `# Risk benchmark for ${result.repo}`,
    "",
    `Commits benchmarked: ${result.summary.commitsBenchmarked}`,
    `Files benchmarked: ${result.summary.filesBenchmarked}`,
    `Forecast window: ${result.inputs.forecastDays} day(s)`,
    `Mean squared error: ${result.summary.mse.toFixed(4)}`,
    "",
    ...result.commits.flatMap((commit) => [
      `## ${commit.shortCommit} ${commit.date}: ${commit.mse.toFixed(4)}`,
      "",
      commit.subject,
      "",
      ...commit.files.map(
        (file) =>
          `- ${file.file}: ${file.level} (${file.prediction.toFixed(2)}) -> ${file.actual}; squared error ${file.squaredError.toFixed(4)}`,
      ),
      "",
    ]),
  ].join("\n");
}
