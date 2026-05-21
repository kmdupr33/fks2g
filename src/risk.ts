import type {
  AnalyzeOptions,
  BugFixClassification,
  BugFixCommitMap,
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
  bugFixCommitsByFile: BugFixCommitMap;
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
  bugFixCommitsByFile,
  ticketJudgment,
}: Omit<AnalyzeRiskOptions, "bugFixClassification" | "riskAssessment" | "documents" | "repoLabel" | "options">): RiskEvidence[] {
  const ticketMap = Object.fromEntries(ticketJudgment.candidates.map((candidate) => [candidate.file, candidate]));

  return files
    .map((file): RiskEvidence => {
      const changes = fileChangeMap[file] ?? 0;
      const bugFixCount = bugFixFiles[file] ?? 0;
      const bugFixes = bugFixCommitsByFile[file] ?? [];
      const ticket = ticketMap[file];

      return {
        file,
        changes,
        frequency: changeFrequency(changes, fileChangeMap),
        bugFixCount,
        bugFixes,
        sourceLikely: Boolean(ticket?.likelyToChange),
        sourceConfidence: ticket?.confidence ?? 0,
        sourceReason: ticket?.reason ?? "",
        sourceReferences: ticket?.sourceReferences ?? [],
      };
    })
    .sort((a, b) => b.changes - a.changes);
}

export function analyzeRisk({
  files,
  fileChangeMap,
  bugFixFiles,
  bugFixCommitsByFile,
  bugFixClassification,
  ticketJudgment,
  riskAssessment,
  documents,
  repoLabel,
  options,
}: AnalyzeRiskOptions): RiskResult {
  const evidence = buildRiskEvidence({ files, fileChangeMap, bugFixFiles, bugFixCommitsByFile, ticketJudgment });
  const assessmentMap = Object.fromEntries(riskAssessment.files.map((file) => [file.file, file]));

  const filesWithRisk: RiskFile[] = evidence.map((fileEvidence) => {
    const assessment = assessmentMap[fileEvidence.file];
    return {
      ...fileEvidence,
      level: assessment?.level ?? "low",
      reason: assessment?.reason ?? "The model did not return a risk assessment for this file.",
    };
  }).sort((a, b) => riskLevelRank(b.level) - riskLevelRank(a.level) || b.changes - a.changes);

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

export function formatMarkdown(result: RiskResult): string {
  return [
    `# Risk report for ${result.repo}`,
    "",
    `Embedding source: ${result.embeddingSource}`,
    `Documents matched: ${result.summary.matchingDocuments}`,
    `Bug-fix commits: ${result.summary.bugFixCommits}`,
    "",
    ...result.files.flatMap((file) => [
      `## ${file.file}:${file.level}`,
      "",
      `Risk reason: ${file.reason}`,
      `Change frequency: ${file.frequency} (${file.changes} historical changes)`,
      `Recent bug fixes: ${formatBugFixes(file.bugFixes)}`,
      `Source signal: ${formatSourceSignal(file)}`,
      `Source references: ${formatSourceReferences(file.sourceReferences)}`,
      "",
    ]),
  ].join("\n");
}

function formatBugFixes(bugFixes: { shortHash: string; description: string }[]): string {
  if (bugFixes.length === 0) {
    return "none";
  }
  return bugFixes.map((bugFix) => `${bugFix.shortHash}: ${bugFix.description}`).join(", ");
}

function formatSourceSignal(file: RiskFile): string {
  if (!file.sourceLikely) {
    return file.sourceReason ? `not likely (${file.sourceReason})` : "not indicated";
  }
  const reason = file.sourceReason ? ` (${file.sourceReason})` : "";
  return `likely, confidence ${file.sourceConfidence.toFixed(2)}${reason}`;
}

function formatSourceReferences(references: RiskFile["sourceReferences"]): string {
  if (references.length === 0) {
    return "none";
  }
  return references.map((reference) => formatSourceReference(reference)).join(", ");
}

function formatSourceReference(reference: RiskFile["sourceReferences"][number]): string {
  const title = escapeMarkdownLinkText(reference.title);
  if (!reference.url) {
    return title;
  }
  return `[${title}](${reference.url})`;
}

function escapeMarkdownLinkText(value: string): string {
  return value.replace(/([\\\]])/g, "\\$1");
}

function riskLevelRank(level: "low" | "medium" | "high"): number {
  if (level === "high") {
    return 3;
  }
  if (level === "medium") {
    return 2;
  }
  return 1;
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
