# fks2g

Since code review is the bottleneck now, `fks2g` helps developers decide how closely to review code. 

Its for the devs who have already tried this method of reviewing code:

![look how many fucks i don't give](./img/ff.jpg)

And for devs who have realized that this code review strategy leads to a finger pointing situation when bugs or bad architecture gets shipped:

![spiderman pointing](./img/sp.jpg)

To inform how closely to review a code change, the CLI collects:

- cosine similarity between file-name embeddings and configurable project text sources
- an LLM judgment about whether the closest files are likely to change soon based on source documents
- recent bug-fix commits classified by an LLM
- file change frequency from git history
- an LLM final risk assessment based on the collected evidence

## Usage

```sh
OPENAI_API_KEY=<KEY> npx fks2g analyze -- --repo ../react --github-repo facebook/react --model gpt-5.4-nano $(git -C ../react show --name-only --format='' | tr '\n' ' ') 
```

This analyzes the files from the most recent commit of the react repo if you've got it cloned on your machine. There's a `--help` flag.

## Warning: 0.1 software

This software is as ready for prime-time usage as its name suggests. I've only kicked the tires on it a bit with openai models. Theoretically, google, anthropic, and bedrock models are also supported.