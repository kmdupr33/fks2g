import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { EmbeddingCache } from "./types.js";

export async function loadCache(path: string): Promise<EmbeddingCache> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as Partial<EmbeddingCache>;
    return { embeddings: {}, ...parsed };
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) {
      throw error;
    }
    return { embeddings: {} };
  }
}

export async function saveCache(path: string, cache: EmbeddingCache): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(cache, null, 2)}\n`);
}
