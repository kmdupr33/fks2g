import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
import type { BugFixCommitMap, CommitSummary, NumberMap } from "./types.js";

export async function getFileChangeMap(repoPath: string): Promise<NumberMap> {
  const log = await git(repoPath, ["log", "--name-only", "--pretty=format:"]);
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

export async function getTrackedFiles(repoPath: string): Promise<string[]> {
  const output = await git(repoPath, ["ls-files"]);
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

export async function getRecentCommits(repoPath: string, recencyDays: number): Promise<CommitSummary[]> {
  const output = await git(repoPath, [
    "log",
    `--since=${recencyDays}.days`,
    "--date=short",
    "--pretty=format:%H%x09%ad%x09%s",
  ]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [hash = "", date = "", ...subjectParts] = line.split("\t");
      return { hash, date, subject: subjectParts.join("\t") };
    });
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
