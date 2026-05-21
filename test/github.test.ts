import test from "node:test";
import assert from "node:assert/strict";
import { resolveGitHubToken } from "../src/github.js";

test("resolveGitHubToken prefers GITHUB_TOKEN over GH_TOKEN", () => {
  assert.deepEqual(
    resolveGitHubToken({
      GITHUB_TOKEN: "github-token",
      GH_TOKEN: "gh-token",
    }),
    {
      token: "github-token",
      source: "GITHUB_TOKEN",
    },
  );
});

test("resolveGitHubToken uses standard GitHub token variables", () => {
  assert.deepEqual(resolveGitHubToken({ GITHUB_TOKEN: "github-token" }), {
    token: "github-token",
    source: "GITHUB_TOKEN",
  });
  assert.deepEqual(resolveGitHubToken({ GH_TOKEN: "gh-token" }), {
    token: "gh-token",
    source: "GH_TOKEN",
  });
});
