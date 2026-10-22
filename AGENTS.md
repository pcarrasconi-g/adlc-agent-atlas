# Odradek: canonical orchestration contract

Odradek is the source of truth for profiles, skills, and execution evidence.
Codex, Cursor, Claude, or another host creates and coordinates real subagents.
Odradek observes explicit events; it does not launch agents or require provider
APIs, SDKs, or CLI adapters.

## Mandatory observatory preflight (before architect routing)

At the beginning of each task, before creating the architect or doing substantive
work, check the local observatory once. Use
`npm --prefix <ODRADEK_ROOT>/agent-kit run observatory:check` (or equivalently
check the configured public `/api/projects` endpoint). Keep exactly one
task-scoped observability state, including the transient `starting` state:

- A successful health check means the service is `healthy`, not yet that task
  observability is `active`. Do not ask the user. Set `starting`, generate a
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
   register them in Odradek only after real creation. Profile names such as
   `architect`, `engineer`, or `reviewer` are metadata, never substitute IDs.
4. Attribute decisions, results, validation, and reviews to their real producers
   in every state. When active, publish those records as checkpoints and require
   the principal to verify their publication and visibility in Odradek. When
   declined/unavailable, retain normal host evidence and make no publication or
   visibility claim.
5. Before closure, verify the architect's original or amended task plan, the
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
