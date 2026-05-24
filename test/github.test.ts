import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { postPullRequestRiskCommentIfNeeded, resolveGitHubToken } from "../src/github.js";

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

test("postPullRequestRiskCommentIfNeeded posts a PR comment in CI on non-main branches", async () => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return new Response("{}", { status: 201, statusText: "Created" });
  };

  try {
    const posted = await postPullRequestRiskCommentIfNeeded({
      repo: "owner/repo",
      body: "risk report",
      env: {
        CI: "true",
        GITHUB_HEAD_REF: "feature-branch",
        GITHUB_REF: "refs/pull/42/merge",
        GITHUB_TOKEN: "token",
      },
    });

    assert.equal(posted, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.url, "https://api.github.com/repos/owner/repo/issues/42/comments");
    assert.equal(calls[0]?.init?.method, "POST");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("postPullRequestRiskCommentIfNeeded does not post for main branch", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 201, statusText: "Created" });

  try {
    const posted = await postPullRequestRiskCommentIfNeeded({
      repo: "owner/repo",
      body: "risk report",
      env: {
        CI: "true",
        GITHUB_REF_NAME: "main",
        GITHUB_REF: "refs/pull/7/merge",
        GITHUB_TOKEN: "token",
      },
    });

    assert.equal(posted, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("postPullRequestRiskCommentIfNeeded reads PR number from GitHub event payload", async () => {
  const tempDir = await mkdtemp(join(tmpdir(), "fks2g-"));
  const eventPath = join(tempDir, "event.json");
  await writeFile(eventPath, JSON.stringify({ pull_request: { number: 88 } }), "utf8");

  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    return new Response("{}", { status: 201, statusText: "Created" });
  };

  try {
    const posted = await postPullRequestRiskCommentIfNeeded({
      repo: "owner/repo",
      body: "risk report",
      env: {
        CI: "true",
        GITHUB_HEAD_REF: "feature-branch",
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_TOKEN: "token",
      },
    });

    assert.equal(posted, true);
    assert.equal(calls[0], "https://api.github.com/repos/owner/repo/issues/88/comments");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
