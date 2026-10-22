# Workflow

## Design principle

The AI host runs agents. Odradek observes only an explicit local output that
the host is instructed to produce. This keeps session ownership, parent-child
relationships, retention, and data minimization under the developer's control.

## Developer flow

1. Work in a separate product repository.
2. Copy the host-appropriate template from `templates/` into the product
   repository, or add its contents to the first task prompt.
3. Instance ownership: `observatory:check` writes and removes a probe transcript to
   prove the service sees this checkout. `healthy_own` may proceed; `healthy_foreign`
   or `healthy_unknown` (exit != 0, `foreign_instance`) never enter `starting`/`active`:
   ask the user once (other port for this copy with consent, other URL via
   `--base-url`/`ODRADEK_BASE_URL`, or continue without it as `declined`). Each checkout has its
   own `ODRADEK_PORT` and `ODRADEK_INSTANCE` in its unversioned `.env`; the preflight
   queries only that URL (never shared, never assumed 8090, never another
   instance's port). If missing (`setup_required`), run
   `npm --prefix <ODRADEK_ROOT>/agent-kit run observatory:setup` (edits `.env` only;
   starting Docker still requires consent unless already given for the task).
   Before creating an architect, check the observatory once with
   `npm --prefix <ODRADEK_ROOT>/agent-kit run observatory:check`. A `healthy`
   response is only a candidate: enter `starting`, create a candidate session ID
   in memory, and issue only atomic `init`. No other event or claim is allowed
   until the writer accepts it and the state becomes `active`. If init fails, set
   `unavailable`, preserve any partial artifact only as a technical failure,
   report it, publish nothing further, and never restart Docker automatically.
   If the service is down, ask once whether the
   user wants to run `docker compose up -d --build` from Odradek or continue
   without visualization. Never start it without explicit consent. Keep the
   resulting `active`, `declined`, or `unavailable` state after `starting` resolves.
4. When active, retain and use the exact candidate session ID and principal
   registration accepted by `init`; never generate or initialize a second one.
   When declined or unavailable, continue without publishing or claiming
   observability.
5. Launch a real architect once per task, not per delivery phase, including
   questions, reviews, and tiny fixes. Record its returned identity and end-to-end
   plan before execution.
6. Create only the minimum real specialists and reviewers in that plan. The plan
   covers implementation, validation/review, commit/integration, and deployment
   when applicable; sequential phases reuse assigned agents. Add another only
   after architect approval for a material scope change, independent expertise or
   review, a risk boundary, or a real parallel benefit. The principal only
   coordinates and integrates approved delivery. Missing delegation blocks work;
   it never permits solo work.
7. When active, record and verify every real agent, delegation, meaningful
   checkpoint, result, handoff, review, and closure. Verify that this evidence
   can be inspected. Never publish secrets, sensitive payloads, private prompts,
   or chain-of-thought.
8. Register each real agent with the writer `agent_registered` event (real ID,
   provider, Odradek profile, task); host subagent types map to profiles per AGENTS.md.
9. Before closing, run `observatory:verify --session <ID>`. The writer's printed
   path is not visibility evidence. If verify was not run, report NO EJECUTADA and
   do not close as done. Closure verify never uses `--no-close`. If it fails with a
   healthy service, retry once, diagnose without restarting, ask the user before
   recreating the container, report "FALLÓ: observabilidad no verificada", and do
   not mark done or fall back to `unavailable` (see AGENTS.md).
10. Close only after the architect's required plan results and acceptance evidence exist;
   otherwise report blocked or failed. Follow [AGENTS.md](../AGENTS.md).

Hard rule: read the contract and run preflight before any read or work in the
user's repository. Preflight happens once per task; see AGENTS.md for new task
vs continuation and host-issued ID definitions.

## What to record

Record the task goal, agent role, short result, explicit parent-child relation,
and terminal outcome. Do not record every tool call or chain-of-thought.

Never write API keys, tokens, cookies, passwords, or sensitive source content
into summaries. The event writer applies basic redaction, but the orchestrator
is responsible for data minimization.

## What Odradek does not do

- It does not install provider SDKs or hooks.
- It does not inspect private chat databases or vendor folders.
- It does not infer that two nearby events belong to the same work item.
- It does not replace an AI host's permission model.
- It does not require visualization for agent execution; opting out affects
  evidence publication, not architect-first routing or QA.
