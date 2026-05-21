# fks2g

Since code review is the bottleneck now, `fks2g` helps developers decide how closely to review code. 

Its for the devs who have already tried this method of reviewing code:

![look how many fucks i don't give](https://raw.githubusercontent.com/kmdupr33/fks2g/refs/heads/main/img/ff.jpg)

And for devs who have realized that this code review strategy leads to a finger pointing situation when bugs or bad architecture gets shipped:

![spiderman pointing](https://github.com/kmdupr33/fks2g/blob/main/img/sp.jpg?raw=true)

To inform how closely to review a code change, the CLI collects:

- cosine similarity between file-name embeddings and configurable project text sources
- an LLM judgment about whether the closest files are likely to change soon based on source documents
- recent bug-fix commits classified by an LLM
- file change frequency from git history
- an LLM final risk assessment based on the collected evidence

## Usage

```sh
OPENAI_API_KEY=<KEY> npx fks2g analyze --repo ../react --github-repo facebook/react --model gpt-5.5 $(git -C ../react show --name-only --format='' | tr '\n' ' ') 
```

This analyzes the files from the most recent commit of the react repo if you've got it cloned on your machine.

Here's a run w/ gpt 5.5:

```
## package.json:high

Risk reason: Changed very often, so edits are more likely to collide with ongoing work; only limited recent bug-fix evidence and no upcoming-change signal.
Change frequency: Often (763 historical changes)
Recent bug fixes: b91823e: [FlightReply] Don't drop FormData entries in `decodeReplyFromBusboy` (#36468)
Source signal: not indicated
Source references: none

## yarn.lock:medium

Risk reason: Occasionally changed and has a recent bug-fix touch, creating some collision risk, but no source-document signal suggests imminent work.
Change frequency: Occasional (415 historical changes)
Recent bug fixes: b91823e: [FlightReply] Don't drop FormData entries in `decodeReplyFromBusboy` (#36468)
Source signal: not indicated
Source references: none

## packages/react-server-dom-webpack/src/server/ReactFlightDOMServerNode.js:medium

Risk reason: Rare historical changes and no concrete source-document signal, but recent bug-fix activity and broad RSC relevance make changes moderately risky.
Change frequency: Rare (12 historical changes)
Recent bug fixes: b91823e: [FlightReply] Don't drop FormData entries in `decodeReplyFromBusboy` (#36468)
Source signal: not likely (RSC-related issue is a broad desired behavior, while concrete bugs target other subsystems.)
Source references: [#36491 Bug:](https://github.com/facebook/react/issues/36491), [#36430 Bug: [19.2\] DEV-build logComponentRender throws SecurityError on cross-origin Window props](https://github.com/facebook/react/issues/36430), [#36440 Bug: ReactDOM.preloadModule crashes with repeated custom as value](https://github.com/facebook/react/issues/36440), [#36497 Bug:](https://github.com/facebook/react/issues/36497), [#36379 Bug: react-refresh leaks FiberRootNodes from secondary renderers](https://github.com/facebook/react/issues/36379)

## packages/react-server-dom-turbopack/src/server/ReactFlightDOMServerNode.js:medium

Risk reason: Historically rare changes reduce collision risk, but a recent bug-fix touch in a server RSC file suggests edits may be somewhat bug-prone.
Change frequency: Rare (13 historical changes)
Recent bug fixes: b91823e: [FlightReply] Don't drop FormData entries in `decodeReplyFromBusboy` (#36468)
Source signal: not indicated
Source references: none

## packages/react-server-dom-esm/src/server/ReactFlightDOMServerNode.js:medium

Risk reason: Low historical churn, but recent bug-fix activity indicates some risk when changing this server implementation.
Change frequency: Rare (12 historical changes)
Recent bug fixes: b91823e: [FlightReply] Don't drop FormData entries in `decodeReplyFromBusboy` (#36468)
Source signal: not indicated
Source references: none
```


## Docs

There's a `--help` flag.

## Warning: 0.X software

This software is as ready for prime-time usage as its name suggests. I've only kicked the tires on it a bit with openai models. Theoretically, google, anthropic, and bedrock models are also supported.