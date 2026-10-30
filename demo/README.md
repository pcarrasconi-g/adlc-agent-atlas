# Atlas demo

A small, real story about verification in an ADLC run, on a project made for it.

- `fixture/`: the tiny project. Its `just lint` fails on 5 legacy findings that belong
  to "another team"; `just typecheck` passes. No dependencies, no network.
- `run-demo.mjs`: runs the story with Claude Code and your ADLC plugin, recorded by the
  Atlas hooks. It spends real model calls (about a minute, a few tenths of a dollar
  at the default model) and is capped with `--budget`. It copies the project to a
  temp folder and never touches your repositories or the plugin.
- `recording/adlc-guard-demo.json`: the frozen, anonymized recording of one run.

```bash
node demo/run-demo.mjs --adlc /path/to/the/adlc/plugin --yes
```

To turn a new run into the shipped demo:

```bash
node agent-kit/scripts/atlas-freeze-demo.mjs <out>/sessions/<id>.json demo/recording/adlc-guard-demo.json --title "…"
npm --prefix observatory/backend run freeze-demo -- demo/recording/adlc-guard-demo.json observatory/frontend/public/demo/demo.json
```

The recorded demo is the first impression: open the built app (any static file
server) and it loads the demo with no API and no Claude Code. See
[the guide](../docs/DEMO_GUIDE.md) for a 10-minute walkthrough.
