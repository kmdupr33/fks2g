# f2g

![This is me giving a fuck](https://i.kym-cdn.com/photos/images/newsfeed/000/159/492/1306043448876.jpg)

Source: [Know Your Meme](https://knowyourmeme.com/photos/159492-look-at-all-the-fucks-i-give)

`f2g` helps developers decide which files are risky to change before they start editing. Run it in a git repo and it reports files as low, medium, or high risk, with a short explanation for each result.

It is meant for moments like code review, refactoring, or planning a change when you want to know which parts of the codebase are historically busy, recently bug-prone, or likely to be touched by upcoming work.

To make that call, the CLI collects:

- file change frequency from git history
- recent bug-fix commits classified by an LLM
- cosine similarity between file-name embeddings and configurable project text sources
- an LLM judgment about whether the closest files are likely to change soon based on those source documents
- an LLM final risk assessment based on the collected evidence

## Install

```sh
npm install
npm link
```

## Usage

```sh
f2g analyze --github-repo owner/repo
```

By default, `analyze` assesses dirty files from `git status`. Pass file paths to assess an explicit set instead:

```sh
f2g analyze src/router.ts src/cache.ts --github-repo owner/repo
```

Use meeting transcripts or other local text files instead of GitHub issues:

```sh
f2g analyze \
  --embedding-source text-folder \
  --text-folder ./transcripts \
  --text-glob "**/*.{txt,md}"
```

Useful options:

```sh
f2g analyze \
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

Embeddings are cached in `.f2g/cache.json`. Use `--refresh-cache` during analysis, or run `f2g refresh-cache`, to force a refresh.

`--max-files` controls how many dirty files are considered for source-document similarity when file paths are not passed. The default is `0`, which means all dirty files are considered. Set a positive value to cap the analysis after files are ordered by historical change count. When file paths are passed, that explicit set is used as-is.
