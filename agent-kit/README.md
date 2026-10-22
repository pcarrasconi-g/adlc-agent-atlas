# Odradek Agent Kit

Portable, plain-text agent definitions and skills for local multi-agent work.
The kit has no provider SDK, no hooks, and no vendor credentials.

## Contents

- `config/agents.yaml` defines profiles and mandatory architect-first routing.
- `config/prompts/` contains role prompts in Markdown.
- `config/skills/` documents the reusable skill convention.
- `config/ODRADEK_TRANSCRIPT.md` defines the explicit local session contract.
- `scripts/odradek-event.mjs` writes redacted, atomic session events.

Run the writer from the repository root:

```bash
node agent-kit/scripts/odradek-event.mjs init --session my-task --goal "Short goal"
```

The output is local-only under `agent-kit/output/sessions/`. The Odradek
observatory mounts it read-only.

Follow [the canonical contract](../AGENTS.md) for every task, including questions
and small edits. The principal creates a real architect, coordinates its specialist
assignments, and verifies evidence. It does not execute task work itself.

The legacy `src/` dialogue runner is not a supported path for this contract: its
logical role turns do not prove host-created instances. Use native host delegation
and the explicit event writer. Configuration and Markdown express required policy;
they do not physically enforce host behavior or authenticate supplied identities.
