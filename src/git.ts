import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import type { BugFixCommitMap, CommitSummary, NumberMap } from "./types.js";

export async function getFileChangeMap(repoPath: string, untilRef?: string): Promise<NumberMap> {
  const args = ["log", "--name-only", "--pretty=format:"];
  if (untilRef) {
    args.push(untilRef);
  }
  const log = await git(repoPath, args);
  const map: NumberMap = {};

  for (const line of log.split("\n")) {
    const file = line.trim();
    if (!file) {
      continue;
    }
    map[file] = (map[file] ?? 0) + 1;
  }

  return map;
}

export async function getTrackedFiles(repoPath: string, ref = "HEAD"): Promise<string[]> {
  const output = await git(repoPath, ["ls-tree", "-r", "--name-only", ref]);
  return output.split("\n").map((line) => line.trim()).filter(Boolean);
}

export async function getDirtyFiles(repoPath: string): Promise<string[]> {
  const output = await git(repoPath, ["status", "--porcelain"]);
  return [
    ...new Set(
      output
        .split("\n")
        .map((line) => line.trimEnd())
        .filter(Boolean)
        .map(parsePorcelainFile)
        .filter(Boolean),
    ),
  ];
}

export async function getRecentCommits(
  repoPath: string,
  recencyDays: number,
  untilRef?: string,
  asOfDate?: string,
): Promise<CommitSummary[]> {
  const since = asOfDate
    ? new Date(new Date(asOfDate).getTime() - recencyDays * 24 * 60 * 60 * 1000).toISOString()
    : `${recencyDays}.days`;
  const args = [
    "log",
    `--since=${since}`,
    "--date=short",
    "--pretty=format:%H%x09%ad%x09%s",
  ];
  if (asOfDate) {
    args.splice(2, 0, `--until=${asOfDate}`);
  }
  if (untilRef) {
    args.push(untilRef);
  }
  const output = await git(repoPath, args);

  return parseCommitSummaries(output);
}

export async function getCommitRange(repoPath: string, range: string): Promise<CommitSummary[]> {
  const output = await git(repoPath, ["log", "--reverse", "--date=short", "--pretty=format:%H%x09%ad%x09%s", range]);
  return parseCommitSummaries(output);
}

export async function getCommit(repoPath: string, ref: string): Promise<CommitSummary> {
  const output = await git(repoPath, ["show", "-s", "--date=short", "--pretty=format:%H%x09%ad%x09%s", ref]);
  const commit = parseCommitSummaries(output).at(0);
  if (!commit) {
    throw new Error(`Could not resolve commit ${ref}`);
  }
  return commit;
}

export async function getCommitsAfterWithinDays(repoPath: string, ref: string, days: number): Promise<CommitSummary[]> {
  const isoDate = await getCommitIsoDate(repoPath, ref);
  const until = new Date(new Date(isoDate).getTime() + days * 24 * 60 * 60 * 1000).toISOString();
  const output = await git(repoPath, [
    "log",
    "--reverse",
    "--date=short",
    "--pretty=format:%H%x09%ad%x09%s",
    `--after=${isoDate}`,
    `--until=${until}`,
    `${ref}..HEAD`,
  ]);
  return parseCommitSummaries(output);
}

export async function getCommitIsoDate(repoPath: string, ref: string): Promise<string> {
  return (await git(repoPath, ["show", "-s", "--format=%cI", ref])).trim();
}

export async function getChangedFilesForCommit(repoPath: string, ref: string): Promise<string[]> {
  const output = await git(repoPath, ["show", "--name-only", "--pretty=format:", ref]);
  return [...new Set(output.split("\n").map((line) => line.trim()).filter(Boolean))];
}

export async function getChangedFilesForCommits(repoPath: string, commitHashes: string[]): Promise<NumberMap> {
  const result: NumberMap = {};

  for (const hash of commitHashes) {
    const output = await git(repoPath, ["show", "--name-only", "--pretty=format:", hash]);
    for (const file of output.split("\n").map((line) => line.trim()).filter(Boolean)) {
      result[file] = (result[file] ?? 0) + 1;
    }
  }

  return result;
}

export async function getBugFixCommitsByFile(
  repoPath: string,
  commits: CommitSummary[],
): Promise<BugFixCommitMap> {
  const result: BugFixCommitMap = {};

  for (const commit of commits) {
    const output = await git(repoPath, ["show", "--name-only", "--pretty=format:", commit.hash]);
    for (const file of output.split("\n").map((line) => line.trim()).filter(Boolean)) {
      result[file] = [
        ...(result[file] ?? []),
        {
          hash: commit.hash,
          shortHash: commit.hash.slice(0, 7),
          description: shortenDescription(commit.subject),
        },
      ];
    }
  }

  return result;
}

export async function inferGitHubRepo(repoPath: string): Promise<string> {
  const remote = (await git(repoPath, ["remote", "get-url", "origin"])).trim();
  const sshMatch = remote.match(/github\.com[:/]([^/]+\/[^/.]+)(?:\.git)?$/);
  if (!sshMatch) {
    throw new Error("Could not infer GitHub repo from origin. Pass --github-repo owner/name.");
  }
  return sshMatch[1] ?? "";
}

function parseCommitSummaries(output: string): CommitSummary[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash = "", date = "", ...subjectParts] = line.split("\t");
      return { hash, date, subject: subjectParts.join("\t") };
    });
}

function parsePorcelainFile(line: string): string {
  const file = line.slice(3);
  const renamedFile = file.split(" -> ").at(1);
  return renamedFile ?? file;
}

function shortenDescription(subject: string): string {
  return subject.length <= 80 ? subject : `${subject.slice(0, 77)}...`;
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    maxBuffer: 1024 * 1024 * 20,
  });
  return stdout;
}
