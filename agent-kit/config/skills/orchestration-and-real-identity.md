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

1. Run the observatory preflight from root `AGENTS.md` before creating any
   agent. A healthy response is only a candidate: enter `starting`, create an
   in-memory candidate ID, and issue only atomic `init`; no other event or claim
   is allowed. Set `active` only after the writer accepts it. If init fails, set `unavailable`,
   report the cause, publish nothing further, and do not restart Docker
   automatically. If declined or unavailable, continue this procedure without
   emitting events or claiming observability; the choice never permits solo execution.
2. Read the objective, acceptance criteria, safety limits, and the relevant
   role profiles/skills.
3. Use `multi` mode: every task requires the principal and a real architect.
4. Reuse the outcome of step 1; do not issue a second `init`. When step 1
   transitions `starting` to `active`, promote and retain that same candidate
   session ID and its principal metadata for all later publications. Otherwise
   use normal host evidence.
5. Create the real architect first and, when active, record its one task plan. It assigns the
   minimum sufficient ownership, dependencies, skills, acceptance criteria,
   reviewers, integration/commit, and deployment when applicable. It may answer
   architecture-only tasks; other work goes to real assigned specialists.
6. Create each child in the host. Only after successful creation and when active, register its
   returned real ID and emit the delegation from the real principal ID to that
   real child ID.
7. When active, record meaningful checkpoints under the instance that produced them:
   decision, implementation, test result, block, handoff, or escalation.
8. Reuse the approved plan and assigned instances across sequential phases. Do
   not create a phase-specific duplicate agent unless the architect updates the
   plan for a material scope change, independent expertise or review, a risk
   boundary, or a real parallel benefit.
9. Collect results in the principal. Return technical conflicts to the architect
   and assigned agents; the principal does not implement, test, or self-review.
10. Close only after required checks pass. When active, also require the Odradek
   identity/observability gate and publish the terminal result and closure.
   Preserve a blocked or error session when work cannot close.

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
