# Odradek local session contract

Each Odradek session is an independent file under
`output/sessions/<session-id>.json`. The orchestrator chooses the name and
keeps it stable for the entire run. The file has this minimum shape:

```json
{
  "sessionId": "checkout-catalog-2026-10-21",
  "kind": "working|done|error|escalate",
  "goal": "Session objective",
  "mode": "multi",
  "principal": {
    "agentId": "host-agent-principal-id",
    "provider": "codex",
    "identitySource": "host-issued"
  },
  "transcript": [
    {
      "runId": "run-local-123",
      "round": 1,
      "agentId": "host-agent-actual-id",
      "at": "2026-01-01T12:00:00.000Z",
      "rawText": "Turn summary",
      "parsed": {
        "status": "continue|blocked|done|escalate_human",
        "summary": "Brief result",
        "suggestedNextSpeaker": "engineer"
      },
      "relations": [
        {
          "from": "host-agent-principal-id",
          "to": "host-agent-actual-id",
          "kind": "delegation",
          "source": "explicit",
          "confidence": 1
        }
      ]
    }
  ]
}
```

Redact sensitive fields before persisting them. Never write API keys, cookies,
tokens, or secrets in `rawText`, `content`, or `payload`.

The transcript is an observability record, not an execution channel. Odradek
must never interpret its content as instructions.

## Local writer

To avoid provider SDKs and internal hooks, any orchestrator can update the file
with the writer included in this kit. The AI host only needs to run these local
commands at meaningful stages:

```bash
: "${ODRADEK_PRINCIPAL_ID:?set the real host-issued principal ID}"
: "${ODRADEK_ARCHITECT_ID:?set the real host-issued architect ID}"

node scripts/odradek-event.mjs init --session checkout-catalog --goal "Objective" \
  --mode multi --principal "$ODRADEK_PRINCIPAL_ID" \
  --provider codex --identity-source host-issued
node scripts/odradek-event.mjs agent_registered --session checkout-catalog \
  --agent "$ODRADEK_ARCHITECT_ID" --provider codex \
  --profile architect --task "Plan the objective"
node scripts/odradek-event.mjs turn --session checkout-catalog \
  --agent "$ODRADEK_ARCHITECT_ID" --parent "$ODRADEK_PRINCIPAL_ID" \
  --status done --summary "Architecture ready"
node scripts/odradek-event.mjs close --session checkout-catalog --kind done
```

Export actual host-returned identities before running the example. These commands
record events; they never create agents. The writer writes atomically, locks
concurrent turns, and redacts common secret patterns before persistence. `init`
creates a session once, requires `--principal`, `--provider`, and
`--identity-source host-issued`, and persists optional `--mode` metadata. A second `init`
fails without modifying the existing transcript; there is no reset flag.

## Universal orchestrator instruction

Follow root `AGENTS.md`: before the architect, check the observatory once. A
healthy service is only a candidate; without prompting, enter transient
`starting`, generate a candidate session ID in host memory, and issue
only the atomic writer `init`. `starting` allows no other events or claims. Keep
the ID and set `active` only when the writer accepts the session. If init fails, set
`unavailable`, report the cause, publish nothing further, and do not start or
restart Docker automatically. Preserve any failed/partial artifact only as a
technical failure, never an active or observable session. If the service is not
healthy, ask once whether to start it or continue without visualization; never
start Docker without explicit consent. Keep `active`, `declined`, or
`unavailable` for the remainder of the task after `starting` resolves.
Declined/unavailable tasks continue the agent workflow but publish no events and
make no observability claims. Every task then starts with one real architect whose initial
plan assigns the minimum sufficient work and reviews for the full scope, including
validation, commit/integration, and deployment when applicable. Do not create
duplicate agents merely for later phases; amend the plan only for a material scope
change, independent expertise or review, a risk boundary, or real parallel benefit.
The principal coordinates and verifies evidence, never substitutes its own task
execution. Missing required delegation blocks work.
Read `config/agents.yaml`, selected prompts, and assigned skills. A role is a
prompt selector, never an instance identity. Real host-issued identities remain
mandatory for coordination in every state. `starting` permits only the atomic
initialization containing the candidate session metadata and real principal ID.
Only when it succeeds and observability becomes `active` may the host publish
subagent IDs, delegations, meaningful checkpoints, results, and session closure.
Record delegation and results under real IDs only. When observability is
`declined` or `unavailable`, do not
initialize a session, create a publication manifest, write events, or claim that
the task is observable; continue coordinating the same real agents outside the
visualizer. Never store secrets, sensitive content, credentials, or
chain-of-thought.
