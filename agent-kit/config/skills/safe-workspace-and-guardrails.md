# Safe workspace and guardrails

## Purpose

Make repository changes safely, repeatably, and with an auditable boundary around
tools, secrets, files, and approval-required actions.

## When to use it

Use before any agent edits a workspace, executes commands, installs dependencies,
changes infrastructure, or touches data that could be sensitive. It applies to a
single main agent and to every real subagent.

Do not use this skill to invent access, bypass a sandbox, or replace a project's
own security policy.

## Identity and observability invariant

Odradek records **executions**, not job titles.

1. A prompt such as `engineer` or `reviewer` is a reusable profile, not proof
   that an agent exists.
2. Before a subagent acts, the orchestrator must create it with the host and
   capture its real runtime identifier, provider, assigned task, and parent
   identifier.
3. Publish that real identity to Odradek before its first checkpoint.
4. In a single-agent task, record only the real main-agent identity (for example,
   `codex-main`); never create synthetic `qa`, `engineer`, or `reviewer` nodes.
5. A role may be mentioned in a task description, but it must never be emitted as
   an agent identity unless it is the identity of a real running instance.

## Procedure

1. Read repository guidance (`AGENTS.md`, contribution rules, threat model, and
   relevant local documentation) before acting.
2. State the narrow goal, owned paths, acceptance criteria, and commands expected
   to run. Divide work only when the paths and outputs are independent.
3. Inspect the workspace and preserve pre-existing changes. Do not reset, discard,
   reformat broadly, or overwrite user work to make a task easier.
4. Use the least-privileged tool and command. Prefer read-only inspection first.
   Validate exact targets before deletion, migration, publishing, deployment, or
   other hard-to-reverse action.
5. Treat credentials, tokens, private keys, `.env` files, customer data, and
   production identifiers as sensitive. Never print or commit them. Use approved
   secret injection only.
6. Request explicit approval for material external effects: dependency downloads,
   outbound publication, deployment, changing hosted resources, destructive
   operations, or actions outside the agreed workspace.
7. Run the smallest relevant validation after each meaningful change. Record the
   command, result, and artifact path as evidence.
8. If a guardrail blocks an action, keep the block as evidence, explain the safe
   alternative, and do not silently retry with a bypass.

## Output

Produce a concise safety record containing:

- scope and owned paths;
- actual agent identity (and real child identities, if any);
- guardrails checked and approvals obtained;
- validations executed and their results;
- blocked or deferred external actions.

Publish this record as an Odradek checkpoint for the agent that actually performed
the work. It must not attribute work to a nonexistent role.

## Safety

- Never expose secrets in prompts, terminal output, transcripts, commits, or
  Odradek event payloads.
- Never represent a simulated workflow, fixture, or role label as a real agent
  execution.
- Stop and ask when authorization, target scope, or data classification is
  unclear.
