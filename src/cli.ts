import { Command, Option } from "commander";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { assessOverallRisk, classifyBugFixCommits, embedValues, rankLikelyChangingFiles } from "./ai.js";
import { loadCache, saveCache } from "./cache.js";
import {
  getBugFixCommitsByFile,
  getChangedFilesForCommit,
  getChangedFilesForCommits,
  getCommit,
  getCommitIsoDate,
  getCommitRange,
  getCommitsAfterWithinDays,
  getDirtyFiles,
  getFileChangeMap,
  getRecentCommits,
} from "./git.js";
import { postPullRequestRiskCommentIfNeeded } from "./github.js";
import { loadEmbeddingDocuments } from "./embedding-sources.js";
import { analyzeRisk, buildRiskEvidence, formatJson, formatMarkdown } from "./risk.js";
import {
  buildBenchmarkFileResult,
  finalizeBenchmarkCommitResult,
  finalizeBenchmarkResult,
  formatBenchmarkJson,
  formatBenchmarkMarkdown,
} from "./benchmark.js";
import type {
  AnalyzeOptions,
  BenchmarkOptions,
  EmbeddingCache,
  EmbeddingDocument,
  EmbeddingInput,
  EmbeddingMap,
} from "./types.js";

const DEFAULT_CACHE_FILE = ".fks2g/cache.json";

export async function run(argv: string[]): Promise<void> {
  const program = new Command();

  program
    .name("fks2g")
    .description("Estimate code-change risk from git history, recent bug fixes, and ticket similarity.")
    .version("0.1.0");

  addAnalyzeOptions(program.command("analyze"))
    .argument("[files...]", "Files to analyze. Defaults to dirty git files when omitted.")
    .action(async (files: string[], options: AnalyzeOptions) => {
      const result = await analyzeCommand(files, options);
      const rendered = options.format === "json" ? formatJson(result) : formatMarkdown(result);
      console.log(rendered);
      await postPullRequestRiskCommentIfNeeded({
        repo: result.repo,
        body: `## fks2g risk analysis\n\n${formatMarkdown(result)}`,
      });
    });

  addAnalyzeOptions(program.command("benchmark"))
    .description("Benchmark risk ratings across a historical commit range.")
    .argument("[files...]", "Files to benchmark. Defaults to files changed by each benchmarked commit.")
    .option("--from-commit <ref>", "First commit to benchmark when --commit-range is not provided.")
    .option("--to-commit <ref>", "Last commit to benchmark when --commit-range is not provided.", "HEAD")
    .option("--commit-range <range>", "Git revision range to benchmark, such as main~20..main.")
    .option(
      "--forecast-days <days>",
      "Days after each assessment to check for file changes or bug fixes.",
      parsePositiveInteger,
      30,
    )
    .action(async (files: string[], options: BenchmarkOptions) => {
      const result = await benchmarkCommand(files, options);
      console.log(options.format === "json" ? formatBenchmarkJson(result) : formatBenchmarkMarkdown(result));
    });

  program
    .command("refresh-cache")
    .description("Delete the local fks2g cache so the next analyze run refetches issues and embeddings.")
    .option("--cache-file <path>", "Local embedding cache file.", DEFAULT_CACHE_FILE)
    .action(async (options: { cacheFile: string }) => {
      await rm(resolve(options.cacheFile), { force: true });
      console.log(`Deleted ${options.cacheFile}`);
    });

  await program.parseAsync(argv);
}

function addAnalyzeOptions(command: Command): Command {
  return command
    .option("--repo <path>", "Git repository path.", ".")
    .addOption(
      new Option("--embedding-source <source>", "Text source to embed and compare against file names.")
        .choices(["github-issues", "linear-issues", "text-folder"])
        .default("github-issues"),
    )
    .option("--github-repo <owner/name>", "GitHub repository to read issues from. Defaults to the origin remote.")
    .option("--linear-team-id <team>", "Linear team key to filter issues when --embedding-source linear-issues is used.")
    .option("--bug-recency-days <days>", "Days of commit history to inspect for bug fixes.", parsePositiveInteger, 90)
    .option("--issue-recency-days <days>", "Days of GitHub issues to fetch.", parsePositiveInteger, 30)
    .option("--issue-label <label>", "GitHub issue label filter. Can be repeated.", collect, [])
    .option("--text-folder <path>", "Folder containing transcript or planning text files when --embedding-source text-folder is used.")
    .option("--text-glob <glob>", "Text extensions to load from --text-folder.", "**/*.{txt,md,markdown}")
    .option("--max-files <count>", "Maximum files to consider for source-document cosine similarity. Use 0 for all files.", parseNonNegativeInteger, 0)
    .option("--top-files <count>", "Number of closest files to ask the LLM to judge.", parsePositiveInteger, 3)
    .option("--cache-file <path>", "Local embedding cache file.", DEFAULT_CACHE_FILE)
    .option("--refresh-cache", "Refresh cached issue and filename embeddings.")
    .option("--provider-module <name>", "AI SDK provider package to import.", "@ai-sdk/openai")
    .option("--provider-export <name>", "Provider export name from --provider-module.", "openai")
    .option("--model <model>", "Configurable text model for commit and ticket judgments.", "gpt-5.4-nano")
    .option("--embedding-model <model>", "Configurable embedding model for filenames and source documents.", "text-embedding-3-small")
    .option("--quiet", "Hide progress logs.")
    .addOption(new Option("--format <format>", "Output format.").choices(["markdown", "json"]).default("markdown"));
}

async function analyzeCommand(files: string[], options: AnalyzeOptions) {
  const log = createLogger(options);
  const repoPath = resolve(options.repo);
  const cachePath = resolve(repoPath, options.cacheFile);
  log(`Starting analysis in ${repoPath}`);
  log(`Using text model ${options.model}`);
  log(`Using embedding model ${options.embeddingModel}`);
  log(`Loading cache from ${cachePath}`);
  const cache = await loadCache(cachePath);

  log("Scanning git history for file change frequency");
  const fileChangeMap = await getFileChangeMap(repoPath, options.asOfCommit);
  log(`Found historical changes for ${Object.keys(fileChangeMap).length} files`);

  if (files.length > 0) {
    log(`Using ${files.length} file(s) passed on the command line`);
  } else {
    log("No files passed; reading dirty files from git status");
  }
  const dirtyFiles = files.length > 0
    ? []
    : options.asOfCommit
      ? await getChangedFilesForCommit(repoPath, options.asOfCommit)
      : await getDirtyFiles(repoPath);
  const candidateFiles = selectCandidateFiles({
    files,
    dirtyFiles,
    fileChangeMap,
    maxFiles: options.maxFiles,
  });
  if (candidateFiles.length === 0) {
    throw new Error("No files provided and git has no dirty files to analyze.");
  }
  log(`Assessing risk for ${candidateFiles.length} file(s)`);

  log(`Loading commits from the last ${options.bugRecencyDays} day(s)`);
  const recentCommits = await getRecentCommits(
    repoPath,
    options.bugRecencyDays,
    options.asOfCommit,
    options.asOfDate,
  );
  log(`Classifying ${recentCommits.length} commit message(s) for bug fixes`);
  const bugFixClassification = await classifyBugFixCommits(recentCommits, options);
  const bugFixCommitHashes = selectKnownCommitHashes(
    bugFixClassification.bugFixCommitHashes,
    recentCommits.map((commit) => commit.hash),
  );
  const ignoredBugFixCommitHashes = bugFixClassification.bugFixCommitHashes.length - bugFixCommitHashes.length;
  log(`Model identified ${bugFixClassification.bugFixCommitHashes.length} bug-fix commit(s)`);
  if (ignoredBugFixCommitHashes > 0) {
    log(`Ignored ${ignoredBugFixCommitHashes} model-returned commit hash(es) that are not in local recent history`);
  }
  log("Collecting files touched by bug-fix commits");
  const bugFixFiles = await getChangedFilesForCommits(repoPath, bugFixCommitHashes);
  const bugFixCommits = recentCommits.filter((commit) => bugFixCommitHashes.includes(commit.hash));
  const bugFixCommitsByFile = await getBugFixCommitsByFile(repoPath, bugFixCommits);

  log(`Loading embedding documents from ${options.embeddingSource}`);
  const { documents, repoLabel } = await loadEmbeddingDocuments({ repoPath, options });
  log(`Loaded ${documents.length} source document(s)`);

  const embeddingInputs = buildEmbeddingInputs(candidateFiles, documents);
  const missingEmbeddings = countMissingEmbeddings(embeddingInputs, cache, Boolean(options.refreshCache));
  log(`Preparing ${embeddingInputs.length} embedding input(s); ${missingEmbeddings} need refresh`);
  const embeddings = await getEmbeddingsWithCache(embeddingInputs, cache, options);
  log(`Saving cache to ${cachePath}`);
  await saveCache(cachePath, cache);

  log(`Asking model to judge likely-changing files from top ${options.topFiles} similarity candidate(s)`);
  const ticketJudgment = await rankLikelyChangingFiles({
    files: candidateFiles,
    documents,
    embeddings,
    topFiles: options.topFiles,
    aiOptions: options,
  });
  log("Building risk evidence");
  const riskEvidence = buildRiskEvidence({
    files: candidateFiles,
    fileChangeMap,
    bugFixFiles,
    bugFixCommitsByFile,
    ticketJudgment,
  });
  log("Asking model for final risk levels");
  const riskAssessment = await assessOverallRisk(riskEvidence, options);

  log("Formatting results");
  return analyzeRisk({
    files: candidateFiles,
    fileChangeMap,
    bugFixFiles,
    bugFixCommitsByFile,
    bugFixClassification,
    ticketJudgment,
    riskAssessment,
    documents,
    repoLabel,
    options,
  });
}

async function benchmarkCommand(files: string[], options: BenchmarkOptions) {
  const log = createLogger(options);
  const repoPath = resolve(options.repo);
  const commits = await resolveBenchmarkCommits(repoPath, options);
  if (commits.length === 0) {
    throw new Error("No commits found in the requested benchmark range.");
  }

  log(`Benchmarking ${commits.length} commit(s)`);
  const commitResults = [];
  for (const commit of commits) {
    const asOfDate = await getCommitIsoDate(repoPath, commit.hash);
    log(`Benchmarking ${commit.hash.slice(0, 7)} from ${commit.date}`);
    const riskResult = await analyzeCommand(files, {
      ...options,
      asOfCommit: commit.hash,
      asOfDate,
      quiet: true,
    });

    const futureCommits = await getCommitsAfterWithinDays(repoPath, commit.hash, options.forecastDays);
    const futureBugFixClassification = await classifyBugFixCommits(futureCommits, { ...options, quiet: true });
    const futureBugFixHashes = selectKnownCommitHashes(
      futureBugFixClassification.bugFixCommitHashes,
      futureCommits.map((futureCommit) => futureCommit.hash),
    );
    const changedFiles = new Set(
      Object.keys(await getChangedFilesForCommits(repoPath, futureCommits.map((futureCommit) => futureCommit.hash))),
    );
    const bugFixFiles = new Set(Object.keys(await getChangedFilesForCommits(repoPath, futureBugFixHashes)));

    commitResults.push(
      finalizeBenchmarkCommitResult({
        commit: commit.hash,
        shortCommit: commit.hash.slice(0, 7),
        date: commit.date,
        subject: commit.subject,
        files: riskResult.files.map((file) =>
          buildBenchmarkFileResult({
            commit: commit.hash,
            date: commit.date,
            file: file.file,
            level: file.level,
            changedInForecastWindow: changedFiles.has(file.file),
            bugFixInForecastWindow: bugFixFiles.has(file.file),
          }),
        ),
      }),
    );
  }

  return finalizeBenchmarkResult({
    repo: options.githubRepo ?? resolve(repoPath),
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
      fromCommit: options.fromCommit,
      toCommit: options.toCommit,
      commitRange: options.commitRange,
      forecastDays: options.forecastDays,
    },
    commits: commitResults,
  });
}

async function resolveBenchmarkCommits(repoPath: string, options: BenchmarkOptions) {
  if (options.commitRange) {
    return getCommitRange(repoPath, options.commitRange);
  }
  if (!options.fromCommit) {
    throw new Error("Pass --commit-range or --from-commit to select commits to benchmark.");
  }
  const fromCommit = await getCommit(repoPath, options.fromCommit);
  const laterCommits = await getCommitRange(repoPath, `${options.fromCommit}..${options.toCommit ?? "HEAD"}`);
  return [fromCommit, ...laterCommits.filter((commit) => commit.hash !== fromCommit.hash)];
}

function buildEmbeddingInputs(files: string[], documents: EmbeddingDocument[]): EmbeddingInput[] {
  return [
    ...files.map((file) => ({ key: `file:${file}`, value: file })),
    ...documents.map((document) => ({
      key: `document:${document.id}`,
      value: `${document.title}\n\n${document.body}`.trim(),
    })),
  ];
}

async function getEmbeddingsWithCache(
  inputs: EmbeddingInput[],
  cache: EmbeddingCache,
  options: AnalyzeOptions,
): Promise<EmbeddingMap> {
  const missing = inputs.filter((input) => options.refreshCache || !cache.embeddings[input.key]);
  if (missing.length > 0) {
    const vectors = await embedValues(
      missing.map((input) => input.value),
      options,
    );
    missing.forEach((input, index) => {
      cache.embeddings[input.key] = {
        value: input.value,
        vector: vectors[index] ?? [],
        updatedAt: new Date().toISOString(),
      };
    });
  }

  return Object.fromEntries(inputs.map((input) => [input.key, cache.embeddings[input.key]?.vector ?? []]));
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return parsed;
}

function parseNonNegativeInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Expected a non-negative integer, got ${value}`);
  }
  return parsed;
}

function limitFiles(files: string[], maxFiles: number): string[] {
  return maxFiles === 0 ? files : files.slice(0, maxFiles);
}

function countMissingEmbeddings(inputs: EmbeddingInput[], cache: EmbeddingCache, refreshCache: boolean): number {
  return inputs.filter((input) => refreshCache || !cache.embeddings[input.key]).length;
}

function createLogger(options: AnalyzeOptions): (message: string) => void {
  if (options.quiet) {
    return () => {};
  }

  return (message: string) => {
    console.error(`[fks2g] ${message}`);
  };
}

export function selectCandidateFiles({
  files,
  dirtyFiles,
  fileChangeMap,
  maxFiles,
}: {
  files: string[];
  dirtyFiles: string[];
  fileChangeMap: Record<string, number>;
  maxFiles: number;
}): string[] {
  if (files.length > 0) {
    return [...new Set(files)];
  }

  return limitFiles(
    [...new Set(dirtyFiles)].sort((a, b) => (fileChangeMap[b] ?? 0) - (fileChangeMap[a] ?? 0)),
    maxFiles,
  );
}

export function selectKnownCommitHashes(commitHashes: string[], knownCommitHashes: string[]): string[] {
  const known = new Set(knownCommitHashes);
  return [...new Set(commitHashes)].filter((hash) => known.has(hash));
}
