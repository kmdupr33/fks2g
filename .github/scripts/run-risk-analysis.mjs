#!/usr/bin/env zx

const { GITHUB_API_URL = "https://api.github.com", GITHUB_REPOSITORY, GITHUB_TOKEN, PR_NUMBER } = process.env;

if (!GITHUB_REPOSITORY) throw new Error("GITHUB_REPOSITORY must be set.");
if (!GITHUB_TOKEN) throw new Error("GITHUB_TOKEN must be set.");
if (!PR_NUMBER) throw new Error("PR_NUMBER must be set.");

const changedFiles = [];
for (let page = 1; ; page += 1) {
  const url = new URL(`${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}/files`);
  url.searchParams.set("per_page", "100");
  url.searchParams.set("page", String(page));

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to list PR files: ${response.status} ${response.statusText}`);
  }

  const files = await response.json();
  changedFiles.push(
    ...files
      .filter((file) => file.status !== "removed")
      .map((file) => file.filename),
  );

  if (files.length < 100) break;
}

if (changedFiles.length === 0) {
  console.log("No changed files to analyze.");
  process.exit(0);
}

await $`node ./dist/bin/fks2g.js analyze --repo . --github-repo ${GITHUB_REPOSITORY} ${changedFiles}`;
