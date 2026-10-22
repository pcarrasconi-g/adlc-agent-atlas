# Orchestration and real identity

## Purpose

Run a task with truthful orchestration: delegate only work that is genuinely
independent, create real subagents before claiming they exist, and make the
Odradek session an evidence record of those real executions.

This skill is portable. A host may call agents *subagents*, *workers*, or
*child sessions*; the rules below apply regardless of its vocabulary.

## When to use it

Use this skill whenever an AI host coordinates a task, and especially before:

- splitting a task into parallel work;
- creating a subagent or handing work to another person/tool;
- emitting an Odradek delegation or closing an Odradek session.

Use the single-agent path for work that is small, coupled, or cannot be split
without duplicated investigation. Delegation is not a display feature.

## Identity invariant

An Odradek `agentId` identifies an execution instance, never a job title.

- Register the real principal instance first (for example the host's session,
  run, or thread identifier).
- Register a child only after the host has actually created it and returned a
  stable instance ID.
- Preserve the exact principal/child instance ID in every event.
- A label such as `architect`, `engineer`, `qa`, or `reviewer` is a **role
  profile**. It may appear in task metadata or the summary, but it must not be
  used as an agent identity unless it is literally the provider-issued instance
  ID.
- Never fabricate nodes to make a graph look multi-agent. If no child was
  created, report only the real principal.

If a host cannot expose stable instance IDs, use a host-generated opaque run ID
and state the provider plus identity source in the registration metadata. Do
not substitute a role name.

## Procedure

1. Read the objective, acceptance criteria, safety limits, and the relevant
   role profiles/skills.
2. Choose `single` or `multi` mode before work begins. Record the decision and
   why it is appropriate.
3. Initialize one Odradek session for the iteration. Register the real
   principal instance ID and provider.
4. In `multi` mode, partition ownership by artifact or responsibility. Each
   child needs a bounded task, relevant skills, permitted files/tools, and an
   expected evidence artifact.
5. Create each child in the host. Only after successful creation, register its
   returned real ID and emit the delegation from the real principal ID to that
   real child ID.
6. Record meaningful checkpoints under the instance that produced them:
   decision, implementation, test result, block, handoff, or escalation.
7. Reconcile results in the principal. Resolve conflicts using evidence rather
   than inventing agreement among agents.
8. Close only after required checks and the Odradek identity/observability
   gate pass. Preserve a blocked or error session when work cannot close.

## Required evidence

For every session, persist or link:

- session mode (`single` or `multi`), principal ID, provider, and goal;
- for each real child: provider-returned ID, assigned role profile, bounded
  task, delegated-by ID, and completion/error state;
- commands/tests/checks actually run and their concise outcome;
- artifact paths, commits, or review links needed to reproduce the result;
- the explicit reason if a planned delegation was not created.

## Safety and integrity

- Do not place credentials, private prompts, cookies, or sensitive source
  content in Odradek summaries.
- Do not close a session merely because a transcript has events; its events
  must map to real work and real identities.
- Do not make a subagent responsible for work that the principal performed.
- Escalate when the task needs authority, secrets, a production action, or a
  decision outside the accepted scope.

