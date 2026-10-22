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
cp .env.example .env
# Set a strong local POSTGRES_PASSWORD in .env.
docker compose up -d --build
```

Open `http://127.0.0.1:8090`. If the legacy POC is already using that port,
set `ODRADEK_PORT=8091` in `.env` before starting this copy.

## Run an explicit session

First run the read-only preflight before creating any agent:

```bash
npm --prefix agent-kit run observatory:check
```

If it reports `healthy`, enter transient `starting`, create a candidate session
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
principal coordinates and verifies evidence. In this example, replace the ID placeholders
with actual host-returned identities; the commands do not create any agents.

```bash
node agent-kit/scripts/odradek-event.mjs init \
  --session checkout-catalog --goal "Improve checkout validation" \
  --mode multi --principal HOST_PRINCIPAL_ID \
  --provider codex --identity-source host-issued

node agent-kit/scripts/odradek-event.mjs turn \
  --session checkout-catalog --agent HOST_ARCHITECT_ID --parent HOST_PRINCIPAL_ID \
  --status done --summary "API contract documented" \
  --from HOST_PRINCIPAL_ID --to HOST_ARCHITECT_ID --relation delegation

node agent-kit/scripts/odradek-event.mjs close \
  --session checkout-catalog --kind done
```

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
