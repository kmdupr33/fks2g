import type { GitHubIssue } from "./types.js";
import { readFile } from "node:fs/promises";

interface FetchRecentIssuesOptions {
  repo: string;
  recencyDays: number;
  labels: string[];
  token?: string;
  tokenSource?: string;
  asOfDate?: string;
}

interface GitHubIssueResponse {
  id: number;
  number: number;
  title: string;
  body: string | null;
  labels: { name: string }[];
  updated_at: string;
  html_url: string;
  pull_request?: unknown;
}

export async function fetchRecentIssues({
  repo,
  recencyDays,
  labels,
  token,
  tokenSource,
  asOfDate,
}: FetchRecentIssuesOptions): Promise<GitHubIssue[]> {
  const asOf = asOfDate ? new Date(asOfDate) : new Date();
  const since = new Date(asOf.getTime() - recencyDays * 24 * 60 * 60 * 1000).toISOString();
  const url = new URL(`https://api.github.com/repos/${repo}/issues`);
  url.searchParams.set("state", asOfDate ? "all" : "open");
  url.searchParams.set("since", since);
  url.searchParams.set("per_page", "100");
  if (labels.length > 0) {
    url.searchParams.set("labels", labels.join(","));
  }

  let response = await fetchIssues(url, token);
  if (token && (response.status === 401 || response.status === 403)) {
    response = await fetchIssues(url);
  }

  if (!response.ok) {
    throw new Error(formatGitHubFetchError(repo, response, tokenSource));
  }

  const issues = (await response.json()) as GitHubIssueResponse[];
  return issues
    .filter((issue) => !issue.pull_request)
    .filter((issue) => !asOfDate || new Date(issue.updated_at) <= asOf)
    .map((issue) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      labels: issue.labels.map((label) => label.name),
      updatedAt: issue.updated_at,
      url: issue.html_url,
    }));
}

export function resolveGitHubToken(env: NodeJS.ProcessEnv = process.env): { token?: string; source?: string } {
  if (env.GITHUB_TOKEN) {
    return { token: env.GITHUB_TOKEN, source: "GITHUB_TOKEN" };
  }
  if (env.GH_TOKEN) {
    return { token: env.GH_TOKEN, source: "GH_TOKEN" };
  }
  return {};
}

interface PostPullRequestRiskCommentOptions {
  repo: string;
  body: string;
  env?: NodeJS.ProcessEnv;
}

export async function postPullRequestRiskCommentIfNeeded({
  repo,
  body,
  env = process.env,
}: PostPullRequestRiskCommentOptions): Promise<boolean> {
  if (!isCiEnvironment(env)) {
    return false;
  }

  const branch = resolveBranchName(env);
  if (!branch || branch === "main") {
    return false;
  }

  const pullRequestNumber = await resolvePullRequestNumber(env);
  if (!pullRequestNumber) {
    return false;
  }

  const { token } = resolveGitHubToken(env);
  if (!token) {
    return false;
  }

  const response = await fetch(`https://api.github.com/repos/${repo}/issues/${pullRequestNumber}/comments`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ body }),
  });

  if (!response.ok) {
    throw new Error(`GitHub PR comment failed for ${repo}#${pullRequestNumber}: ${response.status} ${response.statusText}`);
  }

  return true;
}

function isCiEnvironment(env: NodeJS.ProcessEnv): boolean {
  const value = env.CI;
  if (!value) {
    return false;
  }
  return value.toLowerCase() !== "false";
}

function resolveBranchName(env: NodeJS.ProcessEnv): string | undefined {
  return env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME || env.BRANCH_NAME || env.CI_COMMIT_BRANCH;
}

async function resolvePullRequestNumber(env: NodeJS.ProcessEnv): Promise<number | undefined> {
  const fromRef = env.GITHUB_REF?.match(/^refs\/pull\/(\d+)\//)?.[1];
  if (fromRef) {
    return Number.parseInt(fromRef, 10);
  }

  const eventPath = env.GITHUB_EVENT_PATH;
  if (!eventPath) {
    return undefined;
  }

  try {
    const raw = await readFile(eventPath, "utf8");
    const payload = JSON.parse(raw) as { pull_request?: { number?: number } };
    return payload.pull_request?.number;
  } catch {
    return undefined;
  }
}

function fetchIssues(url: URL, token?: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

function formatGitHubFetchError(repo: string, response: Response, tokenSource?: string): string {
  const authHint = tokenSource
    ? ` using token from ${tokenSource}`
    : ". Set GITHUB_TOKEN or GH_TOKEN to a GitHub API token with access to this repository";

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return `GitHub issue fetch failed for ${repo}: ${response.status} ${response.statusText}${authHint}. Private repositories require an authenticated token with repo access.`;
  }

  return `GitHub issue fetch failed for ${repo}: ${response.status} ${response.statusText}`;
}
