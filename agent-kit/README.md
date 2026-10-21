# Odradek Agent Kit

Portable, plain-text agent definitions and skills for local multi-agent work.
The kit has no provider SDK, no hooks, and no vendor credentials.

## Contents

- `config/agents.yaml` defines example roles and delegation boundaries.
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
