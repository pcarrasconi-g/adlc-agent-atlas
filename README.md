# Odradek

Odradek is a local-first framework for learning and operating agentic software
development. It combines reusable agent definitions, plain-text skills, an
explicit event contract, and a local visual observatory.

It does not control an AI provider. Your preferred orchestrator creates agents
and deliberately writes the small set of events you want to keep. Odradek then
renders those events as a session timeline and graph.

## Repository layout

```text
agent-kit/       Agent roles, prompts, skills, and the local event writer
observatory/     React UI, API, PostgreSQL migrations, and Dockerfiles
templates/       Starter instructions for product repositories
docs/            Workflow and contract documentation
compose.yaml     Local-only deployment
```

## Quick start

```bash
npm --prefix agent-kit run observatory:setup   # fills only missing .env keys
docker compose up -d --build
```

`observatory:setup` writes `ODRADEK_INSTANCE` (directory name + path hash), a free
deterministic `ODRADEK_PORT` (8100-8899) and a random `POSTGRES_PASSWORD` (never
printed) into the unversioned `.env`, without overwriting existing values. Open the
`url` it prints. Do not copy `.env.example` values between checkouts. Each checkout has its own `ODRADEK_PORT` and `ODRADEK_INSTANCE` in its `.env`
(the compose project is named `odradek-<ODRADEK_INSTANCE>`). The scripts resolve
the URL as `--base-url` > `ODRADEK_BASE_URL` > `.env` `ODRADEK_PORT` (no port: setup_required) and
print `url`/`urlSource`. If `.env` has no port, check fails with `setup_required` (8090 is never assumed); the preflight queries only this checkout's URL and the port is never shared with another instance.

## Run an explicit session

Read [AGENTS.md](AGENTS.md) first, before touching the user's repository, then run the read-only preflight before creating any agent:

```bash
npm --prefix agent-kit run observatory:check
```

`observatory:check` also proves the service belongs to this checkout (probe file, auto-removed). Only `healthy_own` proceeds; `healthy_foreign`/`healthy_unknown` (exit != 0, `foreign_instance`) never reach `starting`/`active`: ask the user once to start this copy on another port (consent), point to another URL, or continue without it (`declined`). If it reports `healthy_own`, enter transient `starting`, create a candidate session
ID in memory, and issue only the atomic writer `init`; do not publish other events
or claims. Observability becomes `active` only after the writer accepts init. If
init fails, use `unavailable`, treat any partial artifact only as technical
failure evidence, report the cause, publish nothing further, and do not
start or restart Docker automatically. If the health check reports `unavailable`,
the host asks once whether to start the observatory
with `docker compose up -d --build` or continue with agents but no visualization.
Docker is never started without explicit consent. The choice applies for the
remainder of the task as `active`, `declined`, or `unavailable` after `starting`
resolves.

Then follow [AGENTS.md](AGENTS.md): the host creates a real architect once per
task. Its initial plan chooses the minimum sufficient real agents for the full
scope, including validation, integration, and deployment when applicable. The
principal coordinates and verifies evidence. Export the real IDs returned by your
host before running this example; these commands do not create any agents.

```bash
: "${ODRADEK_PRINCIPAL_ID:?set the real host-issued principal ID}"
: "${ODRADEK_ARCHITECT_ID:?set the real host-issued architect ID}"

node agent-kit/scripts/odradek-event.mjs init \
  --session checkout-catalog --goal "Improve checkout validation" \
  --mode multi --principal "$ODRADEK_PRINCIPAL_ID" \
  --provider codex --identity-source host-issued

node agent-kit/scripts/odradek-event.mjs agent_registered \
  --session checkout-catalog --agent "$ODRADEK_ARCHITECT_ID" --provider codex \
  --profile architect --task "Plan checkout validation"

node agent-kit/scripts/odradek-event.mjs turn \
  --session checkout-catalog --agent "$ODRADEK_ARCHITECT_ID" \
  --parent "$ODRADEK_PRINCIPAL_ID" --status done \
  --summary "API contract documented"

node agent-kit/scripts/odradek-event.mjs close \
  --session checkout-catalog --kind done

npm --prefix agent-kit run observatory:verify -- --session checkout-catalog
```

The path printed by the writer is not evidence of visibility. `observatory:verify`
queries the real API and exits non-zero if the session is not visible or init,
closure, or events are missing. If it was not run, report NO EJECUTADA and do not
close as done; closure verify never uses `--no-close`, and on failure with a healthy
service follow the AGENTS.md recovery rule (the output includes a `hint`). Placeholder IDs, profile names, and the session name are rejected.

While active, record every real agent, delegation, meaningful checkpoint,
result, and closure. The API observes `agent-kit/output/sessions/*.json` as a read-only Docker
volume. It does not read AI chat histories, provider folders, running processes,
or credentials.

## Using it with a product repository

1. Clone this repository once and run Odradek locally.
2. Open the product repository with your preferred AI orchestrator.
3. Add one of the templates from `templates/` to that product repository.
4. Instruct the host to follow `AGENTS.md`, launch a real architect once per task,
   create the minimum specialists in its end-to-end plan, and publish/verify
   explicit session evidence when observability is active. Declining or being
   unable to run the viewer does not disable the agent workflow.

See [the workflow guide](docs/WORKFLOW.md). Odradek is a voluntary learning and
observability framework that teams choose to adopt. Once adopted, architect-first
routing is mandatory once per task; the architect, not delivery phases, determines
the minimum sufficient delegation.

The legacy Agent Kit dialogue runner is not a compliant host execution path: its
role-based turns do not establish real subagent identities. Use host-native
delegation and the explicit writer under `AGENTS.md`. The writer itself cannot
authenticate host creation or force a host to follow instructions.
