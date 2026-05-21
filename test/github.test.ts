import test from "node:test";
import assert from "node:assert/strict";
import { resolveGitHubToken } from "../src/github.js";

test("resolveGitHubToken prefers the fks2g-specific token", () => {
  assert.deepEqual(
    resolveGitHubToken({
      FKS2G_GITHUB_TOKEN: "fks2g-token",
      GITHUB_TOKEN: "github-token",
      GH_TOKEN: "gh-token",
    }),
    {
      token: "fks2g-token",
      source: "FKS2G_GITHUB_TOKEN",
    },
  );
});

test("resolveGitHubToken falls back to common GitHub token variables", () => {
  assert.deepEqual(resolveGitHubToken({ GITHUB_TOKEN: "github-token" }), {
    token: "github-token",
    source: "GITHUB_TOKEN",
  });
  assert.deepEqual(resolveGitHubToken({ GH_TOKEN: "gh-token" }), {
    token: "gh-token",
    source: "GH_TOKEN",
  });
});
