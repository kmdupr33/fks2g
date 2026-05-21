import { embedMany, generateText, Output, type EmbeddingModel, type LanguageModel } from "ai";
import { z } from "zod";
import type {
  AnalyzeOptions,
  BugFixClassification,
  CommitSummary,
  EmbeddingDocument,
  EmbeddingMap,
  RiskAssessment,
  RiskEvidence,
  TicketJudgment,
} from "./types.js";

const bugFixClassificationSchema = z.object({
  bugFixCommitHashes: z.array(z.string()),
  rationale: z.string(),
});

const ticketJudgmentSchema = z.object({
  candidates: z.array(
    z.object({
      file: z.string(),
      likelyToChange: z.boolean(),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    }),
  ),
  rationale: z.string(),
});

const riskAssessmentSchema = z.object({
  files: z.array(
    z.object({
      file: z.string(),
      level: z.enum(["low", "medium", "high"]),
      reason: z.string(),
    }),
  ),
  rationale: z.string(),
});

export async function classifyBugFixCommits(
  commits: CommitSummary[],
  options: AnalyzeOptions,
): Promise<BugFixClassification> {
  if (commits.length === 0) {
    return { bugFixCommitHashes: [], rationale: "No recent commits in the configured window." };
  }

  const { output } = await generateText({
    model: await loadTextModel(options),
    output: Output.object({ schema: bugFixClassificationSchema }),
    prompt: `You classify git commits. Return only JSON with this shape:
{"bugFixCommitHashes":["<hash>"],"rationale":"short explanation"}

A bug fix commit is one whose message indicates fixing a defect, regression, failure, broken behavior, crash, exception, incorrect output, flaky test, or production issue.

Commits:
${commits.map((commit) => `- ${commit.hash} ${commit.date} ${commit.subject}`).join("\n")}`,
  });

  return output;
}

export async function embedValues(values: string[], options: AnalyzeOptions): Promise<number[][]> {
  const { embeddings } = await embedMany({
    model: await loadEmbeddingModel(options),
    values,
  });
  return embeddings;
}

interface RankLikelyChangingFilesOptions {
  files: string[];
  documents: EmbeddingDocument[];
  embeddings: EmbeddingMap;
  topFiles: number;
  aiOptions: AnalyzeOptions;
}

export async function rankLikelyChangingFiles({
  files,
  documents,
  embeddings,
  topFiles,
  aiOptions,
}: RankLikelyChangingFilesOptions): Promise<TicketJudgment> {
  if (files.length === 0 || documents.length === 0) {
    return { candidates: [], rationale: "No files or matching source documents to compare." };
  }

  const fileIssueScores = files.map((file) => {
    const fileVector = embeddings[`file:${file}`];
    const matches = documents
      .map((document) => ({
        document,
        similarity: cosineSimilarity(fileVector, embeddings[`document:${document.id}`]),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
    return {
      file,
      maxSimilarity: matches[0]?.similarity ?? 0,
      matches,
    };
  });

  const topCandidates = fileIssueScores.sort((a, b) => b.maxSimilarity - a.maxSimilarity).slice(0, topFiles);
  const { output } = await generateText({
    model: await loadTextModel(aiOptions),
    output: Output.object({ schema: ticketJudgmentSchema }),
    prompt: `You assess whether files are likely to change soon based on source documents.
Return only JSON with this shape:
{"candidates":[{"file":"path","likelyToChange":true,"confidence":0.0,"reason":"short"}],"rationale":"short explanation"}

The source documents may be GitHub issues, meeting transcripts, planning notes, or other project text.
Use only the document context below. Confidence is 0 to 1.

Candidates:
${topCandidates
  .map((candidate) => {
    const documentContext = candidate.matches
      .map((match) => {
        const metadata = Object.entries(match.document.metadata)
          .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`)
          .join(" ");
        return `  - similarity=${match.similarity.toFixed(4)} source=${match.document.source} ${match.document.title} ${metadata}\n    ${match.document.body.slice(0, 1200)}`;
      })
      .join("\n");
    return `- file: ${candidate.file}\n  nearest documents:\n${documentContext}`;
  })
  .join("\n\n")}`,
  });

  return output;
}

export async function assessOverallRisk(evidence: RiskEvidence[], options: AnalyzeOptions): Promise<RiskAssessment> {
  if (evidence.length === 0) {
    return { files: [], rationale: "No files were available to assess." };
  }

  const { output } = await generateText({
    model: await loadTextModel(options),
    output: Output.object({ schema: riskAssessmentSchema }),
    prompt: `You assess overall code-change risk for each file.
Return only JSON with this shape:
{"files":[{"file":"path","level":"low|medium|high","reason":"short explanation"}],"rationale":"short explanation"}

Risk means the chance that changing the file will be difficult, bug-prone, or likely to collide with upcoming work.
Use the evidence below. Do not compute a numeric weighted score. Reason qualitatively from:
- relative change frequency
- recent bug-fix count
- whether source documents suggest the file is likely to change soon

Evidence:
${evidence
  .map(
    (file) => `- file: ${file.file}
  change frequency: ${file.frequency} (${file.changes} historical changes)
  recent bug-fix touches: ${file.bugFixCount}
  source-document signal: ${file.sourceLikely ? `likely, confidence ${file.sourceConfidence}` : "not indicated"}
  source-document reason: ${file.sourceReason || "none"}`,
  )
  .join("\n\n")}`,
  });

  return output;
}

async function loadTextModel(options: AnalyzeOptions): Promise<LanguageModel> {
  const provider = await loadProvider(options);
  return provider(options.model);
}

async function loadEmbeddingModel(options: AnalyzeOptions): Promise<EmbeddingModel> {
  const provider = await loadProvider(options);
  if (typeof provider.embedding === "function") {
    return provider.embedding(options.embeddingModel);
  }
  return provider(options.embeddingModel) as unknown as EmbeddingModel;
}

interface AiProvider {
  (model: string): LanguageModel;
  embedding?: (model: string) => EmbeddingModel;
}

async function loadProvider(options: AnalyzeOptions): Promise<AiProvider> {
  const module = (await import(options.providerModule)) as Record<string, unknown>;
  const provider = module[options.providerExport] ?? module.default;
  if (typeof provider !== "function") {
    throw new Error(`Could not find provider function "${options.providerExport}" in ${options.providerModule}`);
  }
  return provider as AiProvider;
}

function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let aMagnitude = 0;
  let bMagnitude = 0;
  for (let index = 0; index < a.length; index++) {
    const aValue = a[index] ?? 0;
    const bValue = b[index] ?? 0;
    dot += aValue * bValue;
    aMagnitude += aValue ** 2;
    bMagnitude += bValue ** 2;
  }

  const denominator = Math.sqrt(aMagnitude) * Math.sqrt(bMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}
