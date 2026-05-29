export type NumberMap = Record<string, number>;

export interface AnalyzeOptions {
  repo: string;
  embeddingSource: "github-issues" | "linear-issues" | "text-folder";
  githubRepo?: string;
  linearTeamId?: string;
  bugRecencyDays: number;
  issueRecencyDays: number;
  issueLabel: string[];
  textFolder?: string;
  textGlob: string;
  maxFiles: number;
  topFiles: number;
  cacheFile: string;
  refreshCache?: boolean;
  providerModule: string;
  providerExport: string;
  model: string;
  embeddingModel: string;
  format: "markdown" | "json";
  quiet?: boolean;
}

export interface CommitSummary {
  hash: string;
  date: string;
  subject: string;
}

export interface BugFixClassification {
  bugFixCommitHashes: string[];
  rationale: string;
}

export interface BugFixCommit {
  hash: string;
  shortHash: string;
  description: string;
}

export type BugFixCommitMap = Record<string, BugFixCommit[]>;

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string;
  labels: string[];
  updatedAt: string;
  url: string;
}

export interface EmbeddingDocument {
  id: string;
  source: "github-issues" | "linear-issues" | "text-folder";
  title: string;
  body: string;
  metadata: Record<string, string | number | string[]>;
  url?: string;
}

export interface EmbeddingCache {
  embeddings: Record<string, CachedEmbedding>;
}

export interface CachedEmbedding {
  value: string;
  vector: number[];
  updatedAt: string;
}

export interface EmbeddingInput {
  key: string;
  value: string;
}

export type EmbeddingMap = Record<string, number[]>;

export interface TicketCandidate {
  file: string;
  likelyToChange: boolean;
  confidence: number;
  reason: string;
  sourceReferences?: SourceReference[];
}

export interface TicketJudgment {
  candidates: TicketCandidate[];
  rationale: string;
}

export interface SourceReference {
  id: string;
  title: string;
  url?: string;
  similarity?: number;
}

export interface RiskEvidence {
  file: string;
  changes: number;
  frequency: "Rare" | "Occasional" | "Often";
  bugFixCount: number;
  bugFixes: BugFixCommit[];
  sourceLikely: boolean;
  sourceConfidence: number;
  sourceReason: string;
  sourceReferences: SourceReference[];
}

export interface RiskAssessmentFile {
  file: string;
  level: "low" | "medium" | "high";
  reason: string;
}

export interface RiskAssessment {
  files: RiskAssessmentFile[];
  rationale: string;
}

export interface RiskFile {
  file: string;
  level: "low" | "medium" | "high";
  reason: string;
  changes: number;
  frequency: "Rare" | "Occasional" | "Often";
  bugFixCount: number;
  bugFixes: BugFixCommit[];
  sourceLikely: boolean;
  sourceConfidence: number;
  sourceReason: string;
  sourceReferences: SourceReference[];
}

export interface RiskResult {
  repo: string;
  embeddingSource: AnalyzeOptions["embeddingSource"];
  generatedAt: string;
  inputs: {
    bugRecencyDays: number;
    issueRecencyDays: number;
    issueLabels: string[];
    textFolder?: string;
    textGlob: string;
    maxFiles: number;
    topFiles: number;
    model: string;
    embeddingModel: string;
  };
  summary: {
    filesAnalyzed: number;
    matchingDocuments: number;
    bugFixCommits: number;
    bugFixRationale: string;
    sourceRationale: string;
    riskRationale: string;
  };
  files: RiskFile[];
}
