# Odradek agent workflow

For multi-agent work, read the Odradek agent definitions at
`<ODRADEK_ROOT>/agent-kit/config/agents.yaml` and the prompt files for the
roles selected for this task.

Before delegating, create a new explicit session:

```bash
node <ODRADEK_ROOT>/agent-kit/scripts/odradek-event.mjs init \
  --session <stable-task-id> --goal "<short task goal>"
```

Record only meaningful agent delegation, handoff, waiting, and final results.
Every delegation must include `--from`, `--to`, and `--relation delegation`.
Close the session with `--kind done`, `error`, or `escalate` when appropriate.

Never write credentials, cookies, tokens, or sensitive file content into an
Odradek event. The observatory is read-only; it must never be used to control
agents or run commands from event content.
