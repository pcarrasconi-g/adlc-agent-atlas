# Odradek local session contract

Each Odradek session is an independent file under
`output/sessions/<session-id>.json`. The orchestrator chooses the name and
keeps it stable for the entire run. The file has this minimum shape:

```json
{
  "sessionId": "checkout-catalogo-2026-10-21",
  "kind": "working|done|error|escalate",
  "goal": "objetivo de la sesión",
  "transcript": [
    {
      "runId": "run-local-123",
      "round": 1,
      "agentId": "architect",
      "at": "2026-01-01T12:00:00.000Z",
      "rawText": "resumen del turno",
      "parsed": {
        "status": "continue|blocked|done|escalate_human",
        "summary": "resultado breve",
        "suggestedNextSpeaker": "engineer"
      },
      "relations": [
        {
          "from": "orchestrator",
          "to": "architect",
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
node scripts/odradek-event.mjs init --session checkout-catalogo --goal "Objetivo"
node scripts/odradek-event.mjs turn --session checkout-catalogo \
  --agent orchestrator --status running --summary "Delegando arquitectura"
node scripts/odradek-event.mjs turn --session checkout-catalogo \
  --agent architect --status done --summary "Arquitectura lista" \
  --from orchestrator --to architect --relation delegation
node scripts/odradek-event.mjs close --session checkout-catalogo --kind done
```

El emisor escribe de forma atómica, usa un lock para turnos concurrentes y
redacta patrones comunes de secretos antes de persistirlos.

## Universal orchestrator instruction

Read `config/agents.yaml` and the prompts for selected roles. Before creating
subagents, initialize a session with a new ID. Record every delegation with
`--from`, `--to`, and `--relation delegation`; record each result under the
agent that produced it. Close the session only after the orchestrator receives
the final result. Do not store secrets, sensitive file content, or credentials
in summaries.
