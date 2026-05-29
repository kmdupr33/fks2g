import type { EmbeddingDocument } from "./types.js";

interface FetchRecentLinearIssuesOptions {
  recencyDays: number;
  teamId?: string;
  token?: string;
  tokenSource?: string;
}

interface LinearIssueNode {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  updatedAt: string;
  url: string;
  team?: { key?: string | null } | null;
  labels?: { nodes?: { name: string }[] } | null;
}

interface LinearResponse {
  data?: {
    issues?: {
      nodes?: LinearIssueNode[];
    };
  };
  errors?: { message: string }[];
}

export async function fetchRecentLinearIssues({
  recencyDays,
  teamId,
  token,
  tokenSource,
}: FetchRecentLinearIssuesOptions): Promise<EmbeddingDocument[]> {
  if (!token) {
    throw new Error("Linear issue fetch requires LINEAR_API_KEY or LINEAR_TOKEN.");
  }

  const updatedAfter = new Date(Date.now() - recencyDays * 24 * 60 * 60 * 1000).toISOString();
  const query = `query RecentIssues($updatedAfter: DateTime!) {
    issues(
      filter: {
        updatedAt: { gte: $updatedAfter }
        state: { type: { eq: "started" } }
      }
      first: 100
    ) {
      nodes {
        id
        identifier
        title
        description
        updatedAt
        url
        team { key }
        labels { nodes { name } }
      }
    }
  }`;

  const variables = { updatedAfter };
  const response = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: token,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(formatLinearFetchError(response, tokenSource));
  }

  const payload = (await response.json()) as LinearResponse;
  if (payload.errors?.length) {
    throw new Error(`Linear issue fetch failed: ${payload.errors.map((error) => error.message).join("; ")}`);
  }

  return (payload.data?.issues?.nodes ?? [])
    .filter((issue) => !teamId || issue.team?.key === teamId)
    .map((issue) => ({
    id: `linear-issue:${issue.id}`,
    source: "linear-issues",
    title: `${issue.identifier} ${issue.title}`,
    body: issue.description ?? "",
    metadata: {
      identifier: issue.identifier,
      labels: (issue.labels?.nodes ?? []).map((label) => label.name),
      team: issue.team?.key ?? "",
      updatedAt: issue.updatedAt,
    },
    url: issue.url,
  }));
}

export function resolveLinearToken(env: NodeJS.ProcessEnv = process.env): { token?: string; source?: string } {
  if (env.LINEAR_API_KEY) {
    return { token: env.LINEAR_API_KEY, source: "LINEAR_API_KEY" };
  }
  if (env.LINEAR_TOKEN) {
    return { token: env.LINEAR_TOKEN, source: "LINEAR_TOKEN" };
  }
  return {};
}

function formatLinearFetchError(response: Response, tokenSource?: string): string {
  const authHint = tokenSource
    ? ` using token from ${tokenSource}`
    : ". Set LINEAR_API_KEY or LINEAR_TOKEN to a Linear API token";

  if (response.status === 401 || response.status === 403) {
    return `Linear issue fetch failed: ${response.status} ${response.statusText}${authHint}.`;
  }

  return `Linear issue fetch failed: ${response.status} ${response.statusText}`;
}
