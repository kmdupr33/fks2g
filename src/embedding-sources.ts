import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { fetchRecentIssues, resolveGitHubToken } from "./github.js";
import { inferGitHubRepo } from "./git.js";
import type { AnalyzeOptions, EmbeddingDocument } from "./types.js";

interface LoadEmbeddingDocumentsOptions {
  repoPath: string;
  options: AnalyzeOptions;
}

export async function loadEmbeddingDocuments({
  repoPath,
  options,
}: LoadEmbeddingDocumentsOptions): Promise<{ documents: EmbeddingDocument[]; repoLabel: string }> {
  if (options.embeddingSource === "text-folder") {
    return {
      documents: await loadTextFolderDocuments(options),
      repoLabel: options.textFolder ?? "text-folder",
    };
  }

  const githubRepo = options.githubRepo ?? (await inferGitHubRepo(repoPath));
  const githubToken = resolveGitHubToken();
  const issues = await fetchRecentIssues({
    repo: githubRepo,
    recencyDays: options.issueRecencyDays,
    labels: options.issueLabel,
    token: githubToken.token,
    tokenSource: githubToken.source,
  });

  return {
    repoLabel: githubRepo,
    documents: issues.map((issue) => ({
      id: `github-issue:${issue.id}`,
      source: "github-issues",
      title: `#${issue.number} ${issue.title}`,
      body: issue.body,
      metadata: {
        number: issue.number,
        labels: issue.labels,
        updatedAt: issue.updatedAt,
      },
      url: issue.url,
    })),
  };
}

async function loadTextFolderDocuments(options: AnalyzeOptions): Promise<EmbeddingDocument[]> {
  if (!options.textFolder) {
    throw new Error("--text-folder is required when --embedding-source text-folder is used.");
  }

  const folder = resolve(options.textFolder);
  const extensions = parseExtensions(options.textGlob);
  const files = await listTextFiles(folder, extensions);

  return Promise.all(
    files.map(async (file) => {
      const body = await readFile(file, "utf8");
      const fileName = relative(folder, file);
      return {
        id: `text-folder:${fileName}`,
        source: "text-folder" as const,
        title: fileName,
        body,
        metadata: {
          path: file,
        },
      };
    }),
  );
}

async function listTextFiles(folder: string, extensions: Set<string>): Promise<string[]> {
  const entries = await readdir(folder, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(folder, entry.name);
      if (entry.isDirectory()) {
        return listTextFiles(path, extensions);
      }
      if (!entry.isFile()) {
        return [];
      }
      return matchesExtension(entry.name, extensions) ? [path] : [];
    }),
  );
  return nested.flat().sort();
}

function parseExtensions(glob: string): Set<string> {
  const matches = [...glob.matchAll(/\*\.([a-zA-Z0-9]+)/g)].map((match) => `.${match[1]?.toLowerCase()}`);
  return new Set(matches.length > 0 ? matches : [".txt", ".md", ".markdown"]);
}

function matchesExtension(fileName: string, extensions: Set<string>): boolean {
  const lower = fileName.toLowerCase();
  return [...extensions].some((extension) => lower.endsWith(extension));
}
