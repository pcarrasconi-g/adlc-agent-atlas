# ADLC Agent Atlas: agent instructions

Atlas (internal name: Odradek) is an optional, local, read-only visualizer for
Claude Code runs that use the ADLC plugin. It observes; it never orchestrates.

## Rules for any agent working in this checkout

1. Do not run an observatory preflight, create an architect, or create any other
   subagent because of this repository. Claude Code and ADLC decide which real
   agents exist; follow ADLC's own pipeline and gates unchanged.
2. Atlas is never a precondition. Starting, finishing or closing work does not
   require a running observatory, a session writer call or `observatory:verify`.
3. If you are asked to emit events for Atlas, follow
   [the event contract](docs/ATLAS_EVENT_CONTRACT.md): store only IDs, timing,
   agent type, a short task label, status, check name and exit code. Never store
   prompts, responses, file contents, command output, environment variables,
   tokens or secrets. A telemetry failure must never block or alter the work.
4. Never invent agent identities or draw an agent that did not run. Use the IDs
   Claude Code issued; profile and agent type names are labels, not identities.

## Where things are

- [MVP plan](docs/ADLC_AGENT_ATLAS_MVP_PLAN.md): scope, increments and acceptance.
- [Event contract](docs/ATLAS_EVENT_CONTRACT.md): verified hook payloads, identity
  rules, trust semantics. Sanitized samples: `docs/contract-examples/`.
- [`docs/legacy/`](docs/legacy/): the retired Odradek orchestration contract and
  templates. Archived for reference only; **not active, do not follow them.**

Internal package names, paths, scripts and environment variables still say
`odradek`; they are renamed only if that ever helps the MVP.
