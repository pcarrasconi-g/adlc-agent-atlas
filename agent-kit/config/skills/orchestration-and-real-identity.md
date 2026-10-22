# Orchestration and real identity

## Purpose

Route every task through a real architect, create the real agents it assigns,
and preserve evidence of those executions. Root `AGENTS.md` is authoritative.

This skill is portable. A host may call agents *subagents*, *workers*, or
*child sessions*; the rules below apply regardless of its vocabulary.

## When to use it

Use this skill whenever an AI host coordinates a task, and especially before:

- splitting a task into parallel work;
- creating a subagent or handing work to another person/tool;
- emitting an Odradek delegation or closing an Odradek session.

Questions, reviews, translations, and tiny or coupled tasks still require a real
architect. The architect plans once per approved task scope and chooses the minimum
sufficient delegation for its complete delivery. Parallel execution is optional;
architect-first delegation is mandatory.
The principal only coordinates, records evidence, and integrates approved results.
Unavailable delegation blocks work rather than authorizing solo execution.

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

Use the exact identity returned by the host and record its source. If no real
instance identity is available, report a blocker; never generate a substitute.

## Procedure

1. Read the objective, acceptance criteria, safety limits, and the relevant
   role profiles/skills.
2. Use `multi` mode: every task requires the principal and a real architect.
3. Initialize one Odradek session for the iteration. Register the real
   principal instance ID and provider.
4. Create the real architect first and record its one task plan. It assigns the
   minimum sufficient ownership, dependencies, skills, acceptance criteria,
   reviewers, integration/commit, and deployment when applicable. It may answer
   architecture-only tasks; other work goes to real assigned specialists.
5. Create each child in the host. Only after successful creation, register its
   returned real ID and emit the delegation from the real principal ID to that
   real child ID.
6. Record meaningful checkpoints under the instance that produced them:
   decision, implementation, test result, block, handoff, or escalation.
7. Reuse the approved plan and assigned instances across sequential phases. Do
   not create a phase-specific duplicate agent unless the architect updates the
   plan for a material scope change, independent expertise or review, a risk
   boundary, or a real parallel benefit.
8. Collect results in the principal. Return technical conflicts to the architect
   and assigned agents; the principal does not implement, test, or self-review.
9. Close only after required checks and the Odradek identity/observability
   gate pass. Preserve a blocked or error session when work cannot close.

## Required evidence

For every session, persist or link:

- session mode (`multi`), principal ID, host, and goal;
- real architect creation, once-per-task plan, and required assignments;
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
