# Odradek: canonical orchestration contract

Odradek is the source of truth for profiles, skills, and execution evidence.
Codex, Cursor, Claude, or another host creates and coordinates real subagents.
Odradek observes explicit events; it does not launch agents or require provider
APIs, SDKs, or CLI adapters.

## Mandatory architect-first routing

Every task must go first to a real architect subagent. This includes questions,
investigations, reviews, documentation, translations, tiny fixes, and UI changes.
There is no small-task, single-agent, or urgency exception. Read
`agent-kit/config/agents.yaml`, `agent-kit/config/prompts/architect.md`, and its
assigned skills before launching the architect through the host's native mechanism.
Continuations within an architect-approved scope may reuse that real architect;
new objectives or material scope changes return to it before execution.

The architect decides specialists, ownership, dependencies, acceptance criteria,
and reviewers. It may answer architecture-only tasks itself. Otherwise it assigns
real implementers, investigators, or reviewers. Parallel execution is optional;
delegation is mandatory. Specialists execute their approved assignments without
recursively launching another architect for the same scope.

For user-facing UI, the architect must include real UX and QA reviewers, using
existing profiles with explicit task briefs where needed. Role labels alone are
never evidence of review.

## Principal boundary

The principal reads the contract, opens the session, launches the architect and
its assigned agents, relays context, records and verifies events, collects results,
integrates approved delivery, and communicates with the user. It must not perform
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
   delegation. Capture its routing decision before launching assigned agents.
3. Register additional agents only after real creation. Profile names such as
   `architect`, `engineer`, or `reviewer` are metadata, never substitute IDs.
4. Record decisions, results, validation, and reviews under their real producers.
   Subagents may publish checkpoints; the principal remains responsible for
   verifying publication and visibility in Odradek.
5. Before closure, verify architect routing, required assignments and terminal
   results, acceptance/review evidence, and the observable session. Rejected or
   missing evidence blocks acceptance, commit, and deployment. Preserve failures.
6. Never include secrets, credentials, sensitive data, or full private prompts.

## Enforcement boundary

This contract and host entry points are mandatory instructions for cooperating
hosts. Markdown and configuration cannot physically force a host to spawn agents.
The writer records supplied events; it does not independently authenticate host
creation or enforce routing. Verify actual host creation records and report
missing evidence as a blocker. Never claim a technical gate passed without an
implemented check and its actual result.
