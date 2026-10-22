# Workflow

## Design principle

The AI host runs agents. Odradek observes only an explicit local output that
the host is instructed to produce. This keeps session ownership, parent-child
relationships, retention, and data minimization under the developer's control.

## Developer flow

1. Start Odradek with `docker compose up -d` from this repository.
2. Work in a separate product repository.
3. Copy the host-appropriate template from `templates/` into the product
   repository, or add its contents to the first task prompt.
4. Create a unique session ID before delegating work.
5. Launch a real architect for every task, including questions, reviews, and tiny
   fixes. Record its returned identity and routing decision before execution.
6. Create the real specialists and reviewers it assigns, sequentially or in
   parallel as appropriate. The principal only coordinates and integrates
   approved delivery. Missing delegation blocks work; it never permits solo work.
7. Record and verify meaningful delegation, handoff, waiting, result, and review
   events. Start the viewer and verify that this evidence can be inspected.
8. Close only after the architect's required results and acceptance evidence exist;
   otherwise report blocked or failed. Follow [AGENTS.md](../AGENTS.md).

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
