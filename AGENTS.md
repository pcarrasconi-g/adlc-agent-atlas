# Odradek: canonical orchestration contract

Odradek is the source of truth for profiles, skills, and execution evidence.
Codex, Cursor, Claude, or another host creates and coordinates real subagents.
Odradek observes explicit events; it does not launch agents or require provider
APIs, SDKs, or CLI adapters.

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

The principal reads the contract, opens the session, launches the architect and
the minimum set of agents in its plan, relays context, records and verifies events,
collects results, integrates approved delivery, and communicates with the user. It
must not perform
substantive investigation, design, implementation, testing, or review on its own.
Integration applies approved results; fixes or conflict resolutions requiring
technical judgment return to the assigned agents.

If delegation or a required real identity is unavailable, record and report a
blocker. Never silently fall back to solo execution or fabricate an instance.
Historical single-node sessions remain evidence, not authorization for new solo work.

## Identity and evidence

1. Start Odradek and initialize a session before substantive work. Register the
   principal with its actual host-issued ID and identity source.
2. Create the architect, then record its returned ID, host, profile, task, and
   delegation. Capture its routing decision before launching assigned agents,
   including the required routing-evidence justification.
3. Register additional agents only after real creation. Profile names such as
   `architect`, `engineer`, or `reviewer` are metadata, never substitute IDs.
4. Record decisions, results, validation, and reviews under their real producers.
   Subagents may publish checkpoints; the principal remains responsible for
   verifying publication and visibility in Odradek.
5. Before closure, verify the architect's original or amended task plan, the
   complete routing-evidence justification above, required assignments and terminal
   results, acceptance/review evidence, and the observable session. Missing routing
   justification or other required evidence blocks acceptance, commit, and
   deployment. Preserve failures.
6. Never include secrets, credentials, sensitive data, or full private prompts.

## Enforcement boundary

This contract and host entry points are mandatory instructions for cooperating
hosts. Markdown and configuration cannot physically force a host to spawn agents.
The writer records supplied events; it does not independently authenticate host
creation or enforce routing. Verify actual host creation records and report
missing evidence as a blocker. Never claim a technical gate passed without an
implemented check and its actual result.
