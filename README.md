# ADLC Agent Atlas

*Visualize, understand and correct your agents' work in time.*

Atlas is a local, optional visualizer for Claude Code runs that use the ADLC
plugin. ADLC and Claude Code keep creating, coordinating and correcting agents;
Atlas turns minimal execution evidence into a map of who took part, what they
received, what they delivered, what was verified and what deserves attention.
It is not a chatbot, a remote control or a replacement for ADLC.

Status: MVP in progress. Done: the event contract and trust semantics
([docs/ATLAS_EVENT_CONTRACT.md](docs/ATLAS_EVENT_CONTRACT.md)), the map with
live-follow, replay and the Learn / Diagnose readings, the optional hook adapter,
the four signals with baseline comparison, and a recorded demo. Still to come, in
[the MVP plan](docs/ADLC_AGENT_ATLAS_MVP_PLAN.md): adoption in other projects
(install and uninstall, two project modes).

Internal package names, paths, scripts and environment variables still say
`odradek`.

## Principles

- The graph is the product; alerts point at a concrete node, edge or gate.
- Every claim shows its provenance: observed by hook, verified by command,
  declared by agent, or inferred by rule. Unknown stays unknown.
- No tokens are spent on telemetry: hooks and deterministic rules only.
- Opt-in per project and per session. A telemetry failure never blocks Claude Code.

## Repository layout

```text
agent-kit/       Legacy profiles and the local event writer/check scripts
observatory/     React UI, API, PostgreSQL migrations, and Dockerfiles
templates/       Optional observer notes for product repositories
docs/            MVP plan, event contract, workflow, archived legacy docs
compose.yaml     Local-only deployment
```

## Run the viewer

```bash
npm --prefix agent-kit run observatory:setup   # fills only missing .env keys
docker compose up -d --build
```

`observatory:setup` writes `ODRADEK_INSTANCE` (directory name + path hash), a free
deterministic `ODRADEK_PORT` (8100-8899) and a random `POSTGRES_PASSWORD` (never
printed) into the unversioned `.env`, without overwriting existing values. Open the
`url` it prints. Each checkout has its own `ODRADEK_PORT` and `ODRADEK_INSTANCE`;
do not copy `.env.example` values between checkouts. Docker is started only when
you decide to.

`npm --prefix agent-kit run observatory:check` reports whether the service is up
and belongs to this checkout.

## See the demo

The built app opens a **recorded demo** with no API and no Claude Code: a real ADLC
run in which the completion guard blocks on a lint failure that was already
there, and a person decides what to do. See [the demo guide](docs/DEMO_GUIDE.md)
and [demo/README.md](demo/README.md) (the latter also explains the optional live
run, which spends real model calls).

## Try the recorded sample

`docs/samples/recorded-two-subagents.json` is a real Claude Code 2.1.311 run with
two parallel subagents (IDs and content sanitized). Copy it into
`agent-kit/output/sessions/` while the viewer runs and open it: it shows the map,
the Learn story and the Diagnose table. It has no checks, so nothing in it is
shown as verified. `agent-kit/scripts/atlas-sample-from-hooks.mjs` rebuilds it
from a raw hook capture.

## Recording events

The API reads `agent-kit/output/sessions/*.json` through a read-only volume. It
does not read chat histories, provider folders, running processes or credentials.
To observe a Claude Code run, start it with the optional Atlas hooks (they add to
ADLC's hooks, they do not replace them):

```bash
node agent-kit/scripts/atlas-hook-config.mjs --write /tmp/atlas-settings.json
claude --settings /tmp/atlas-settings.json
```

The adapter writes `agent-kit/output/sessions/<session>.json` as the run goes, and
the open session updates by itself. `agent-kit/scripts/odradek-event.mjs` can still
write such files by hand (see [agent-kit/README.md](agent-kit/README.md)). What may be
stored is defined in [the event contract](docs/ATLAS_EVENT_CONTRACT.md): IDs,
timing, agent type, short task label, status, check name and exit code; never
prompts, responses, file contents, command output or secrets.

## Using it with a product repository

1. Run Atlas from this checkout when you want it.
2. Work in your product repository with ADLC as usual; nothing about Atlas changes
   how agents are created or verified.
3. Optionally add a note from `templates/` so other agents know Atlas only observes.

See [the workflow guide](docs/WORKFLOW.md). The earlier Odradek orchestration
contract (architect-first routing, preflight, closure checklist) is archived in
[docs/legacy/](docs/legacy/) and is not active.
