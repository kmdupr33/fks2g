import type { GitHubIssue } from "./types.js";

interface FetchRecentIssuesOptions {
  repo: string;
  recencyDays: number;
  labels: string[];
  token?: string;
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

export async function fetchRecentIssues({ repo, recencyDays, labels, token }: FetchRecentIssuesOptions): Promise<GitHubIssue[]> {
  const since = new Date(Date.now() - recencyDays * 24 * 60 * 60 * 1000).toISOString();
  const url = new URL(`https://api.github.com/repos/${repo}/issues`);
  url.searchParams.set("state", "open");
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
    throw new Error(`GitHub issue fetch failed for ${repo}: ${response.status} ${response.statusText}`);
  }

  const issues = (await response.json()) as GitHubIssueResponse[];
  return issues
    .filter((issue) => !issue.pull_request)
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

function fetchIssues(url: URL, token?: string): Promise<Response> {
  return fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}
