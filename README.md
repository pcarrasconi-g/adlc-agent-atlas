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

```bash
node agent-kit/scripts/odradek-event.mjs init \
  --session checkout-catalog --goal "Improve checkout validation"

node agent-kit/scripts/odradek-event.mjs turn \
  --session checkout-catalog --agent architect --parent orchestrator \
  --status done --summary "API contract documented" \
  --from orchestrator --to architect --relation delegation

node agent-kit/scripts/odradek-event.mjs close \
  --session checkout-catalog --kind done
```

The API observes `agent-kit/output/sessions/*.json` as a read-only Docker
volume. It does not read AI chat histories, provider folders, running processes,
or credentials.

## Using it with a product repository

1. Clone this repository once and run Odradek locally.
2. Open the product repository with your preferred AI orchestrator.
3. Add one of the templates from `templates/` to that product repository.
4. Ask the orchestrator to read `agent-kit/config/agents.yaml`, select roles,
   and emit explicit local session events.

See [the workflow guide](docs/WORKFLOW.md). Odradek is a voluntary learning and
observability framework; teams decide which agents, skills, and tasks to use.
