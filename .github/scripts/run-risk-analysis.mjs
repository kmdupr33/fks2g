#!/usr/bin/env zx

const { BASE_SHA, HEAD_SHA, GITHUB_REPOSITORY } = process.env;

if (!BASE_SHA || !HEAD_SHA) {
  throw new Error("BASE_SHA and HEAD_SHA must be set.");
}

if (!GITHUB_REPOSITORY) {
  throw new Error("GITHUB_REPOSITORY must be set.");
}

const diff = await $`git diff --name-only -z --diff-filter=ACMRT ${BASE_SHA} ${HEAD_SHA}`;
const changedFiles = diff.stdout.split("\0").filter(Boolean);

if (changedFiles.length === 0) {
  console.log("No changed files to analyze.");
  process.exit(0);
}

await $`node ./dist/bin/fks2g.js analyze --repo . --github-repo ${GITHUB_REPOSITORY} ${changedFiles}`;
