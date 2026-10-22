# Odradek: canonical orchestration contract

Odradek is the source of truth for profiles, skills, and execution evidence.
Codex, Cursor, Claude, or another host creates and coordinates real subagents.
Odradek observes explicit events; it does not launch agents or require provider
APIs, SDKs, or CLI adapters.

## Order of operations (hard rule)

Before **any** read, search, or work in the user's repository (including a first
"look around"), the principal must: (1) read this contract, (2) run the
observatory preflight below, and (3) resolve its state (`active`, `declined`, or
`unavailable`). Only then may it launch the architect. Reading the user's code
first is a contract violation; do not "just check one thing". Host entry points
(`.cursor/rules/odradek.mdc`, `CLAUDE.md`, templates) repeat this rule.

### New task vs continuation

Preflight runs once per **task**. A *continuation* stays inside the
architect-approved scope and reuses its session, plan, and agents. A *new task*
has a new objective or materially different scope and needs a new preflight,
session ID, and architect.

- Continuation: "now also run the tests" after an approved fix; "fix the review
  finding"; "commit what we just built"; a follow-up question about the same change.
- New task: a different feature or bug; a new repository; an unrelated question
  after the previous one closed; any request that adds scope the architect plan
  did not cover (return to the architect, and open a new session if the objective changed).
- Doubt means new task.

### Host-issued IDs

An agent ID is **host-issued** only if the host runtime returned it when the
instance was created, or exposes it as the current conversation/session ID:

| Host | Principal ID | Subagent ID |
| --- | --- | --- |
| Cursor | The ID Cursor exposes for the current agent (the UUID in the agent-store path / agent transcript name). Canonical choice: it is the same ID subagents report as their parent, so one ID identifies the principal everywhere. Do not use any other chat UUID. | The agent/task ID returned by the Task tool when the subagent is created |
| Claude Code | The session ID exposed by the host | The ID/handle returned when the subagent is launched |
| Codex | The thread/session ID exposed by the host | The ID returned when the subagent is spawned |

Never derive an ID from the session slug, task name, profile (`architect`,
`engineer`...), subagent type, timestamp, or a `HOST_*_ID` placeholder, and never
invent one. If the host does not provide a real ID, **block**: report that the
identity is unavailable, do not init or register, and do not claim observability.
The writer rejects visible placeholders, profile names, and the session name; it
cannot prove an ID is real.

### Host subagent types vs Odradek profiles

Host types are launchers, not profiles. Record the Odradek profile
(`agent-kit/config/agents.yaml`) in `agent_registered`; the host type is
metadata at most.

| Host subagent type | Odradek profile |
| --- | --- |
| `architecture-reviewer`, `Plan`-style architect agents | `architect` |
| `generalPurpose`, `best-of-n-runner` doing implementation | `engineer` |
| `explore` | the profile of the requester's assignment (usually `architect` or `engineer`); never its own profile |
| `qa-verifier`, `bugbot`, `security-review`, `ci-investigator` | `reviewer` |
| `devops`-style / deploy / CI agents | `devops` |
| Anything unmapped | Ask the architect to pick the closest profile in `agents.yaml`; do not invent a profile |

### Visibility is verified, never assumed

The path printed by the writer (`odradek-event`) only proves a local file was
written. It is **not** evidence that the session is visible in the observatory.
Visibility is proven only by `observatory:verify` (exit code 0) against the real
API:

```bash
npm --prefix <ODRADEK_ROOT>/agent-kit run observatory:verify -- --session <ID> [--require-registration] [--no-close]
```

It prints JSON and exits non-zero if the session is not visible, or init,
closure, or the required events are missing.

### If verify fails while the service is healthy

If `observatory:verify` fails with `api_reachable: true` and `visible_in_api: false`
(the JSON includes a `hint`; probable cause: the container's bind mount
`./agent-kit/output:/watched:ro` points to a stale directory), the principal must:

1. Retry once after a few seconds.
2. If it persists, diagnose without restarting: with the user's permission, compare
   the container mount with `<ODRADEK_ROOT>/agent-kit/output` using read-only
   commands only; otherwise ask the user.
3. Ask the user for a decision before recreating the container; never recreate or
   start Docker on its own.
4. Report `FALLÓ: observabilidad no verificada` and do not mark the task done.
5. Do not switch to `unavailable` to sidestep the failure; that state is only for
   failed init/startup or the user's choice.

### Closure checklist (when `active`; all items, in order)

1. Architect plan (original or amended) and routing-evidence justification exist.
2. Every assigned agent has a real host-issued ID, was registered with
   `agent_registered`, and has a terminal result.
3. Acceptance/review evidence exists from the real reviewers.
4. Session closed with the writer `close`.
5. `observatory:verify --session <ID>` was **executed** **without `--no-close`** and exited 0
   (paste the result). `--no-close` is only for mid-session checks; its exit 0 never
   satisfies this step or the closure.
6. Final report states PASÓ / FALLÓ / NO EJECUTADA for each check.

If step 5 did not run, report `verify: NO EJECUTADA` and do not close the task as
done: report it as incomplete/blocked. If it failed, report FALLÓ and the failed
checks. When declined/unavailable, items 4-5 do not apply and no visibility claim is made.

### One instance per checkout (port and instance are not shared)

Each checkout of Odradek has its own `ODRADEK_PORT` and `ODRADEK_INSTANCE`,
declared in its own `<ODRADEK_ROOT>/.env` (not versioned). The preflight queries
**only** this checkout's URL; the port is never shared between checkouts, never
assumed to be 8090, and must not be another instance's port. If `.env` lacks the
port or instance (`reason: setup_required`), run
`npm --prefix <ODRADEK_ROOT>/agent-kit run observatory:setup`: it adds only the
missing `ODRADEK_INSTANCE` (directory name + short path hash), a free deterministic
`ODRADEK_PORT` (8100-8899), and a random local `POSTGRES_PASSWORD` (never printed),
without overwriting existing values. Setup only edits `.env`; it starts nothing.
Starting the stack (`docker compose up -d --build` from `<ODRADEK_ROOT>`) still needs
explicit user consent, unless the user already gave it for the task. Never stop,
restart, or modify containers, volumes, or networks of other instances.

### Instance ownership (healthy_own vs healthy_foreign)

A healthy `/api/projects` answer does not prove the service belongs to **this**
checkout (`<ODRADEK_ROOT>`); another checkout or a stale container may own the port.
`observatory:check` therefore writes a short-lived probe transcript into
`<ODRADEK_ROOT>/agent-kit/output/sessions/`, asks the API whether it imported it, and
always removes the file and the probe session. Results (`service`):

- `healthy_own`: the instance sees this checkout. Only this state proceeds to `starting`.
- `healthy_foreign` (`reason: foreign_instance`) or `healthy_unknown`
  (`reason: instance_unknown`, probe could not run): treated the same. Exit code != 0.
  **Never** enter `starting`/`active` and never publish. Ask the user **once**:
  (a) start this copy on another port (`ODRADEK_PORT`/`ODRADEK_INSTANCE` in `.env`,
  only with explicit consent; no Docker otherwise), (b) point to another URL
  (`--base-url` or `ODRADEK_BASE_URL`), or (c) continue without the observatory
  (`declined`). Do not ask again for the same task.
- `unavailable`: as in the preflight rules below.

The URL is resolved as `--base-url` > `ODRADEK_BASE_URL` > `ODRADEK_PORT` in
`<ODRADEK_ROOT>/.env` > (none: `setup_required`; 8090 is never assumed); check/verify print `url` and
`urlSource`. With several checkouts, give each its own `ODRADEK_PORT` and
`ODRADEK_INSTANCE`; each session is only valid in the instance of its checkout.
`observatory:verify` repeats the ownership probe and fails with
`reason: foreign_instance` on a foreign one.

## Mandatory observatory preflight (before architect routing)

At the beginning of each task, before creating the architect or doing substantive
work, check the local observatory once. Use
`npm --prefix <ODRADEK_ROOT>/agent-kit run observatory:check` (or equivalently
check the configured public `/api/projects` endpoint). Keep exactly one
task-scoped observability state, including the transient `starting` state:

- A successful health check means the service is `healthy_own`, not yet that task
  observability is `active` (`healthy_foreign`/`healthy_unknown` never qualify; see above). Do not ask the user. Set `starting`, generate a
  candidate session ID in host memory, and submit exactly the atomic writer
  `init` containing the goal, mode, and real principal identity. `starting` does
  not permit any other event or observability claim.
- If atomic `init` succeeds, keep the candidate ID, transition to `active`, and
  then create the architect.
- If the health check succeeds but writer initialization fails, set
  `unavailable`, report the cause, stop publishing, and continue with real agents
  and normal host evidence. Do not claim `active` and do not start or restart
  Docker automatically; request a user decision only if the contract requires a
  recovery choice.
- If the check does not succeed, ask the user **once** whether to start the local
  observatory or continue with agents without it. Never run Docker or another
  startup command before explicit consent.
- `declined`: the user chooses to continue without it. Continue the complete
  architect-first agent workflow, but do not write events or claim the task is
  observable.
- `unavailable`: the user consented but startup or the repeated check failed, or
  the environment cannot run/check the observatory. Explain the failure and
  continue the complete agent workflow without claiming observability, unless
  observability itself is an acceptance requirement.

Do not ask again during the same task. A continuation inside the approved scope
inherits its terminal state; `starting` must resolve to `active` or `unavailable`
before agent creation. A materially new task runs a new preflight. When `active`,
record every real agent registration, delegation, meaningful checkpoint, result,
and session closure. Store concise facts and evidence paths only: never secrets,
credentials, private prompts, sensitive payloads, or chain-of-thought.

## Mandatory once-per-task architect routing

Every task must go first to a real architect subagent. This includes questions,
investigations, reviews, documentation, translations, tiny fixes, and UI changes.
There is no small-task, single-agent, or urgency exception. Read
`agent-kit/config/agents.yaml`, `agent-kit/config/prompts/architect.md`, and its
assigned skills before launching the architect through the host's native mechanism.
Architecture is mandatory **once per task, not once per phase**.
The architect plans the task once before execution. Its plan covers the full
approved scope: implementation or investigation, validation and review, commit
or other integration, and deployment when applicable. Continuations within that
architect-approved scope reuse the plan and real agents already assigned; new
objectives or material scope changes return to the architect before execution.

The architect decides the **minimum sufficient delegation**: specialists,
ownership, dependencies, acceptance criteria, reviewers, and the skills needed
to deliver the plan. It may answer architecture-only tasks itself. Otherwise it
assigns real implementers, investigators, or reviewers. One assignment may cover
sequential implementation, validation, commit, and deployment work within its
ownership. Do not create duplicate agents merely because work moves to another
phase. Add or replace an agent only after the architect amends the plan for a
material scope change, independent expertise or review, a risk boundary, or a
real parallel benefit. Parallel execution is optional; required delegation is
not. Specialists execute their approved assignments without recursively launching
another architect for the same scope.

### Required routing evidence

The architect's structured routing output, and the corresponding Odradek
evidence, must state:

- the task scope;
- a concise reason why the total team is the minimum sufficient team;
- every assignment's real-instance evidence and role profile, responsibility,
  reason a separate instance needs independence, and phases it covers;
- phases deliberately consolidated into the same assignment; and
- the only amendment triggers: a material scope change, need for independent
  expertise or review, a risk boundary, or a demonstrated parallel benefit.

Before an assigned agent begins work, its evidence must replace any planned
instance placeholder with the real host-issued ID. A profile is never an ID, and
the architect must not invent one in a plan. A new delivery phase alone never
triggers a new agent.

For user-facing UI, the architect must include real UX and QA reviewers, using
existing profiles with explicit task briefs where needed. Role labels alone are
never evidence of review.

## Principal boundary

The principal reads the contract, launches the architect and the minimum set of
agents in its plan, relays context, collects results, integrates approved delivery,
and communicates with the user. When observability is `active`, it also opens the
Odradek session and records and verifies events. When it is `declined` or
`unavailable`, it coordinates through real host-issued IDs and preserves normal
host evidence without claiming publication or visibility in Odradek. It must not
perform substantive investigation, design, implementation, testing, or review on
its own.
Integration applies approved results; fixes or conflict resolutions requiring
technical judgment return to the assigned agents.

If delegation or a required real identity is unavailable, preserve the blocker in
the active Odradek session or, when declined/unavailable, in normal host evidence,
and report it. Never silently fall back to solo execution or fabricate an instance.
Historical single-node sessions remain evidence, not authorization for new solo work.

## Identity and evidence

1. After a healthy service check, enter `starting`, generate a candidate session
   ID in memory, and atomically initialize it with the principal's actual
   host-issued ID and identity source. Do not publish other events in `starting`.
   Set `active` only after the writer accepts initialization. If it fails, set
   `unavailable`, report the cause, stop publication, and retain normal host
   evidence without weakening agent routing. Preserve any failed/partial file
   only as technical failure evidence; it is never an observable session.
2. Create the architect and capture its returned ID, host, profile, task,
   delegation, and routing decision before launching assigned agents, including
   the required routing-evidence justification. Publish these facts to Odradek
   only when observability is `active`; otherwise retain them as normal host
   evidence.
3. Create additional agents before using their real identities. When active,
   register them in Odradek only after real creation with the writer
   `agent_registered` event (`--agent` real ID, `--provider`, `--profile`,
   `--task`; optional `--parent`), which is distinct from `turn`. Profile names such as
   `architect`, `engineer`, or `reviewer` are metadata, never substitute IDs.
4. Attribute decisions, results, validation, and reviews to their real producers
   in every state. When active, publish those records as checkpoints and require
   the principal to verify their publication and visibility in Odradek. When
   declined/unavailable, retain normal host evidence and make no publication or
   visibility claim.
5. Before closure, follow the closure checklist above and verify the architect's original or amended task plan, the
   complete routing-evidence justification above, required assignments and terminal
   results, and acceptance/review evidence. When active, also verify the observable
   session and its terminal closure. Missing routing justification or other
   required evidence blocks acceptance, commit, and deployment. Preserve failures
   in Odradek when active and in normal host evidence otherwise.
6. Never include secrets, credentials, sensitive data, or full private prompts.

## Enforcement boundary

This contract and host entry points are mandatory instructions for cooperating
hosts. Markdown and configuration cannot physically force a host to spawn agents.
The writer records supplied events; it does not independently authenticate host
creation or enforce routing. Verify actual host creation records and report
missing evidence as a blocker. Never claim a technical gate passed without an
implemented check and its actual result.

Limits: no file or rule can force Cursor/Claude/Codex to read this contract first;
`alwaysApply` rules and entry points only make it likely. `agent_registered` and
`observatory:verify` check format, placeholders, and what the API shows; they
cannot prove an ID was truly issued by the host or that work was done by that
agent. A skipped check is NO EJECUTADA, never PASÓ.
