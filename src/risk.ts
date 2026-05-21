import type {
  AnalyzeOptions,
  BugFixClassification,
  EmbeddingDocument,
  NumberMap,
  RiskAssessment,
  RiskEvidence,
  RiskFile,
  RiskResult,
  TicketJudgment,
} from "./types.js";

interface AnalyzeRiskOptions {
  files: string[];
  fileChangeMap: NumberMap;
  bugFixFiles: NumberMap;
  bugFixClassification: BugFixClassification;
  ticketJudgment: TicketJudgment;
  riskAssessment: RiskAssessment;
  documents: EmbeddingDocument[];
  repoLabel: string;
  options: AnalyzeOptions;
}

export function buildRiskEvidence({
  files,
  fileChangeMap,
  bugFixFiles,
  ticketJudgment,
}: Omit<AnalyzeRiskOptions, "bugFixClassification" | "riskAssessment" | "documents" | "repoLabel" | "options">): RiskEvidence[] {
  const ticketMap = Object.fromEntries(ticketJudgment.candidates.map((candidate) => [candidate.file, candidate]));

  return files
    .map((file): RiskEvidence => {
      const changes = fileChangeMap[file] ?? 0;
      const bugFixCount = bugFixFiles[file] ?? 0;
      const ticket = ticketMap[file];

      return {
        file,
        changes,
        frequency: changeFrequency(changes, fileChangeMap),
        bugFixCount,
        sourceLikely: Boolean(ticket?.likelyToChange),
        sourceConfidence: ticket?.confidence ?? 0,
        sourceReason: ticket?.reason ?? "",
      };
    })
    .sort((a, b) => b.changes - a.changes);
}

export function analyzeRisk({
  files,
  fileChangeMap,
  bugFixFiles,
  bugFixClassification,
  ticketJudgment,
  riskAssessment,
  documents,
  repoLabel,
  options,
}: AnalyzeRiskOptions): RiskResult {
  const evidence = buildRiskEvidence({ files, fileChangeMap, bugFixFiles, ticketJudgment });
  const assessmentMap = Object.fromEntries(riskAssessment.files.map((file) => [file.file, file]));

  const filesWithRisk: RiskFile[] = evidence.map((fileEvidence) => {
    const assessment = assessmentMap[fileEvidence.file];
    return {
      ...fileEvidence,
      level: assessment?.level ?? "low",
      reason: assessment?.reason ?? "The model did not return a risk assessment for this file.",
    };
  });

  return {
    repo: repoLabel,
    embeddingSource: options.embeddingSource,
    generatedAt: new Date().toISOString(),
    inputs: {
      bugRecencyDays: options.bugRecencyDays,
      issueRecencyDays: options.issueRecencyDays,
      issueLabels: options.issueLabel,
      textFolder: options.textFolder,
      textGlob: options.textGlob,
      maxFiles: options.maxFiles,
      topFiles: options.topFiles,
      model: options.model,
      embeddingModel: options.embeddingModel,
    },
    summary: {
      filesAnalyzed: filesWithRisk.length,
      matchingDocuments: documents.length,
      bugFixCommits: bugFixClassification.bugFixCommitHashes.length,
      bugFixRationale: bugFixClassification.rationale,
      sourceRationale: ticketJudgment.rationale,
      riskRationale: riskAssessment.rationale,
    },
    files: filesWithRisk,
  };
}

export function formatJson(result: RiskResult): string {
  return JSON.stringify(result, null, 2);
}

export function formatTable(result: RiskResult): string {
  const rows = [
    ["Risk", "Changes", "Freq", "Bugs", "Source", "File"],
    ...result.files.map((file) => [
      file.level,
      String(file.changes),
      file.frequency,
      String(file.bugFixCount),
      file.sourceLikely ? file.sourceConfidence.toFixed(2) : "-",
      file.file,
    ]),
  ];

  const header = rows[0] ?? [];
  const widths = header.map((_, column) => Math.max(...rows.map((row) => row[column]?.length ?? 0)));
  const table = rows
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index] ?? 0)).join("  "))
    .join("\n");

  return [
    `Repository: ${result.repo}`,
    `Embedding source: ${result.embeddingSource}; documents matched: ${result.summary.matchingDocuments}; bug-fix commits: ${result.summary.bugFixCommits}`,
    table,
  ].join("\n");
}

function changeFrequency(changes: number, fileChangeMap: NumberMap): "Rare" | "Occasional" | "Often" {
  const values = Object.values(fileChangeMap);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const divider = (max - min) / 3;
  if (changes < min + divider) {
    return "Rare";
  }
  if (changes < min + divider * 2) {
    return "Occasional";
  }
  return "Often";
}
