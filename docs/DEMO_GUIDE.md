# Ten-minute demo guide

Goal: a junior can say who did what and why "done" is not "verified"; an expert
can spot the guard's context problem without help. Run it with one of each, and
write down what they understood **before** you explain anything.

## Setup (1 minute)

```bash
npm --prefix observatory/frontend ci && npm --prefix observatory/frontend run build
npx --yes serve observatory/frontend/dist   # any static file server works; no API needed
```

Open the page. The session is labelled **RECORDED DEMO**. For a live run instead,
see `demo/README.md` (it costs real model calls).

## Junior path (about 6 minutes): Learn

Press **Learn** and read the six steps with them. Ask, one at a time, without
helping:

1. Who handed work to whom? (principal → frontend-engineer; the link starts as a guess)
2. Why did the agent's "done" not mean the work passed? (stop signal, not a check)
3. Is the lint failure new or old? How does Atlas know? (same recipe, same revision, clean tree)
4. What did the guard do, and what did the person decide?
5. When would you have asked a question or stepped in? (at the guard block, before deciding)

Record: which questions needed a hint, and which words confused them.

## Expert path (about 3 minutes): Explore, then Diagnose

Leave **Explore** open and say nothing. Time how long until they point at the
card *"The ADLC guard checked the project root, not the agent's worktree"* or the
`!` on the agent. Target: under two minutes. Then **Diagnose**: the table shows
the worktree, the checks with exit codes and where they ran. Ask what they would
change in the harness (a more specific recipe, running the check in the
worktree, or scoping the guard) and note that Atlas suggested none of it.

## What to check on the page

- The decision marker (diamond) on the timeline, and **Before / After** on the
  decision card: one block before, none observed after, and the wording that this
  is not proof the work was accepted.
- No card says "bug", "caused by" or "regression" unless a comparable baseline
  supports it.
- **Back to present** and the replay controls behave (rewinding never jumps back by itself).
