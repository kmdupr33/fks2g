import test from "node:test";
import assert from "node:assert/strict";
import { fetchRecentLinearIssues, resolveLinearToken } from "../src/linear.js";

test("resolveLinearToken prefers LINEAR_API_KEY over LINEAR_TOKEN", () => {
  assert.deepEqual(
    resolveLinearToken({ LINEAR_API_KEY: "api-key", LINEAR_TOKEN: "token" }),
    { token: "api-key", source: "LINEAR_API_KEY" },
  );
});

test("fetchRecentLinearIssues maps Linear issues into embedding documents", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        data: {
          issues: {
            nodes: [
              {
                id: "lin_1",
                identifier: "ENG-123",
                title: "Fix checkout race",
                description: "Intermittent timeout",
                updatedAt: "2026-05-20T10:00:00.000Z",
                url: "https://linear.app/acme/issue/ENG-123",
                team: { key: "ENG" },
                labels: { nodes: [{ name: "bug" }] },
              },
            ],
          },
        },
      }),
      { status: 200 },
    );

  try {
    const docs = await fetchRecentLinearIssues({
      recencyDays: 30,
      teamId: "ENG",
      token: "linear-token",
      tokenSource: "LINEAR_TOKEN",
    });

    assert.equal(docs.length, 1);
    assert.equal(docs[0]?.source, "linear-issues");
    assert.equal(docs[0]?.title, "ENG-123 Fix checkout race");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
