import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadEmbeddingDocuments } from "../src/embedding-sources.js";

test("loadEmbeddingDocuments reads text-folder documents recursively", async () => {
  const folder = await mkdtemp(join(tmpdir(), "fks2g-transcripts-"));
  const nested = join(folder, "nested");
  await mkdir(nested);
  await writeFile(join(folder, "standup.txt"), "Discussed auth changes.");
  await writeFile(join(nested, "planning.md"), "Checkout work is coming soon.");
  await writeFile(join(folder, "ignored.json"), "{}");

  const { documents, repoLabel } = await loadEmbeddingDocuments({
    repoPath: ".",
    options: {
      repo: ".",
      embeddingSource: "text-folder",
      textFolder: folder,
      textGlob: "**/*.{txt,md}",
      bugRecencyDays: 30,
      issueRecencyDays: 30,
      issueLabel: [],
      maxFiles: 50,
      topFiles: 3,
      cacheFile: ".fks2g/cache.json",
      providerModule: "@ai-sdk/openai",
      providerExport: "openai",
      model: "test-model",
      embeddingModel: "test-embedding",
      format: "markdown",
      quiet: true,
    },
  });

  assert.equal(repoLabel, folder);
  assert.deepEqual(
    documents.map((document) => document.title),
    ["nested/planning.md", "standup.txt"],
  );
  assert.equal(documents.at(0)?.source, "text-folder");
});
