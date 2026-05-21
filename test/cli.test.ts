import test from "node:test";
import assert from "node:assert/strict";
import { selectCandidateFiles, selectKnownCommitHashes } from "../src/cli.js";

test("selectCandidateFiles uses passed files exactly and ignores dirty files and max-files", () => {
  const files = selectCandidateFiles({
    files: ["src/requested-a.ts", "src/requested-b.ts", "src/requested-a.ts"],
    dirtyFiles: ["src/dirty.ts"],
    fileChangeMap: {
      "src/dirty.ts": 100,
      "src/requested-a.ts": 1,
      "src/requested-b.ts": 2,
    },
    maxFiles: 1,
  });

  assert.deepEqual(files, ["src/requested-a.ts", "src/requested-b.ts"]);
});

test("selectCandidateFiles falls back to dirty files sorted by change count", () => {
  const files = selectCandidateFiles({
    files: [],
    dirtyFiles: ["src/cold.ts", "src/hot.ts", "src/new.ts"],
    fileChangeMap: {
      "src/hot.ts": 10,
      "src/cold.ts": 1,
    },
    maxFiles: 2,
  });

  assert.deepEqual(files, ["src/hot.ts", "src/cold.ts"]);
});

test("selectKnownCommitHashes ignores model-returned hashes that are not in local history", () => {
  const hashes = selectKnownCommitHashes(
    ["known-a", "unknown", "known-a", "known-b"],
    ["known-a", "known-b"],
  );

  assert.deepEqual(hashes, ["known-a", "known-b"]);
});
