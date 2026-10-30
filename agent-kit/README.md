# Odradek Agent Kit (legacy tooling)

Plain-text agent profiles, skills and a local event writer from the earlier
Odradek design. ADLC Agent Atlas does not use the profiles to orchestrate
anything: Claude Code and the ADLC plugin create and coordinate agents, and Atlas
only observes. Nothing here is a mandatory workflow.

## Contents

- `config/agents.yaml`, `config/prompts/`, `config/skills/`: legacy profiles and
  notes. Reference only; they are not loaded or required by any current entry point.
- `config/ODRADEK_TRANSCRIPT.md`: the explicit local session file format.
- `scripts/odradek-event.mjs`: writes redacted, atomic session events.
- `scripts/odradek-observatory.mjs`, `odradek-verify.mjs`, `odradek-setup.mjs`:
  viewer setup, health check and visibility check.

Run the writer from the repository root:

```bash
: "${ODRADEK_PRINCIPAL_ID:?set the real host-issued principal ID}"
node agent-kit/scripts/odradek-event.mjs init --session my-task --goal "Short goal" \
  --principal "$ODRADEK_PRINCIPAL_ID" --provider claude \
  --identity-source host-issued
```

The output is local-only under `agent-kit/output/sessions/`; the observatory
mounts it read-only. See [the event contract](../docs/ATLAS_EVENT_CONTRACT.md) for
what may be stored.

The legacy `src/` dialogue runner is not a supported path: its logical role turns
do not prove host-created instances.
