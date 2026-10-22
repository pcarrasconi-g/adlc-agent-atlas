# Odradek local session contract

Each Odradek session is an independent file under
`output/sessions/<session-id>.json`. The orchestrator chooses the name and
keeps it stable for the entire run. The file has this minimum shape:

```json
{
  "sessionId": "checkout-catalog-2026-10-21",
  "kind": "working|done|error|escalate",
  "goal": "Session objective",
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
node scripts/odradek-event.mjs init --session checkout-catalog --goal "Objective"
node scripts/odradek-event.mjs turn --session checkout-catalog \
  --agent host-agent-principal-id --status continue --summary "Delegation prepared"
node scripts/odradek-event.mjs turn --session checkout-catalog \
  --agent host-agent-actual-id --status done --summary "Architecture ready" \
  --from host-agent-principal-id --to host-agent-actual-id --relation delegation
node scripts/odradek-event.mjs close --session checkout-catalog --kind done
```

Replace illustrative IDs with actual host-returned identities. These commands
record events; they never create agents. The writer writes atomically, locks
concurrent turns, and redacts common secret patterns before persistence.

## Universal orchestrator instruction

Follow root `AGENTS.md`: every task starts with a real architect whose routing
assigns the remaining work and reviews. The principal coordinates and verifies
evidence, never substitutes its own task execution. Missing delegation blocks work.
Read `config/agents.yaml`, selected prompts, and assigned skills. A role is a
prompt selector, never an instance identity. Before creating real subagents,
initialize a session and record principal/subagent host IDs and providers in a
manifest. Record delegation and results under real IDs only. Close after the
final result and gate; never store secrets, sensitive content or credentials.
