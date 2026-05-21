# fks2g

Since code review is the bottleneck now, `fks2g` helps developers decide how closely to review code. 

Its for the devs who have already tried this method of reviewing code:

![look how many fucks i don't give](./img/ff.jpg)

And for deves who have realized that this code review strategy leads to a finger pointing situation when bugs or bad architecture gets shipped:

![spiderman pointing](./img/sp.webp)

To inform how closely to review a code change, the CLI collects:

- an LLM judgment about whether the closest files are likely to change soon based on those source documents
- recent bug-fix commits classified by an LLM
- file change frequency from git history
- cosine similarity between file-name embeddings and configurable project text sources
- an LLM final risk assessment based on the collected evidence

## Usage

```sh
npm install
npm link
```

## Usage

```sh
fks2g analyze --github-repo owner/repo
```

By default, `analyze` assesses dirty files from `git status`. Pass file paths to assess an explicit set instead:

```sh
fks2g analyze src/router.ts src/cache.ts --github-repo owner/repo
```

Use meeting transcripts or other local text files instead of GitHub issues:

```sh
fks2g analyze \
  --embedding-source text-folder \
  --text-folder ./transcripts \
  --text-glob "**/*.{txt,md}"
```

Useful options:

```sh
fks2g analyze \
  --bug-recency-days 45 \
  --embedding-source github-issues \
  --issue-recency-days 30 \
  --issue-label bug \
  --issue-label backend \
  --max-files 0 \
  --top-files 3 \
  --model gpt-4o-mini \
  --embedding-model text-embedding-3-small \
  --refresh-cache
```

The default AI provider is `@ai-sdk/openai`. Set the relevant provider API key in your environment, for example `OPENAI_API_KEY`.

For private GitHub repositories, set `GITHUB_TOKEN` or `GH_TOKEN` to a GitHub API token with access to the repo:

```sh
GITHUB_TOKEN=github_pat_... fks2g analyze --github-repo owner/private-repo src/file.ts
```

Progress logs are written to stderr so JSON and Markdown output on stdout remain usable. Pass `--quiet` to hide progress logs.

Embeddings are cached in `.fks2g/cache.json`. Use `--refresh-cache` during analysis, or run `fks2g refresh-cache`, to force a refresh.

`--max-files` controls how many dirty files are considered for source-document similarity when file paths are not passed. The default is `0`, which means all dirty files are considered. Set a positive value to cap the analysis after files are ordered by historical change count. When file paths are passed, that explicit set is used as-is.
