import test from "node:test";
import assert from "node:assert/strict";
import { resolveGitHubToken } from "../src/github.js";

test("resolveGitHubToken prefers the f2g-specific token", () => {
  assert.deepEqual(
    resolveGitHubToken({
      F2G_GITHUB_TOKEN: "f2g-token",
      GITHUB_TOKEN: "github-token",
      GH_TOKEN: "gh-token",
    }),
    {
      token: "f2g-token",
      source: "F2G_GITHUB_TOKEN",
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
