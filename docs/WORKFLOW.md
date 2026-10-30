# Workflow

## Design principle

Claude Code with the ADLC plugin runs the agents. Atlas observes local evidence
of that run and draws it as a map. It never creates, directs or stops agents, and
it is never a precondition for any task. Retention, data minimization and
opt-in stay under the developer's control.

## Developer flow

1. Work normally in your product repository with ADLC
   (`refine → plan → breakdown → execute → pr`).
2. Optionally turn Atlas on for the project
   (`agent-kit/scripts/atlas-install.mjs install --project <dir>`, reversible with
   `uninstall`) and open the viewer, live during a task or later to replay a
   recorded run. See [the adoption guide](ADOPTION_GUIDE.md) and
   [the event contract](ATLAS_EVENT_CONTRACT.md), section 8.
3. Start the viewer from this checkout when you want it
   (`npm --prefix agent-kit run observatory:setup`, then `docker compose up -d --build`).
   Docker is never started on your behalf without your consent.
4. Intervene in Claude Code, not in Atlas. Atlas may offer a copyable suggestion;
   it sends no commands.

## What is recorded

IDs issued by Claude Code, timing, agent type, a short task label, status, check
name and exit code, with a provenance for each claim (observed by hook, verified
by command, declared by agent, inferred by rule). See
[the event contract](ATLAS_EVENT_CONTRACT.md). Never prompts, responses, file
contents, command output, environment variables, tokens or secrets.

## What Atlas does not do

- It does not orchestrate agents or replace ADLC's gates and verification.
- It does not inspect private chat databases or vendor folders.
- It does not infer that two nearby events belong to the same work item.
- It does not spend tokens on telemetry: hooks and deterministic rules only.
- It does not block Claude Code when telemetry fails.

The previous Odradek workflow (architect-first routing, preflight, closure
checklist) is archived in [legacy/](legacy/) and is not active.
