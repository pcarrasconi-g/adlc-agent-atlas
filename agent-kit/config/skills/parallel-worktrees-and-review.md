# Parallel worktrees and review

## Purpose

Deliver independent changes concurrently without corrupting another agent's
worktree, hiding review responsibility, or claiming reviews that did not occur.

## When to use it

Use this skill when work has two or more independently testable slices, when a
change needs isolated review, or when a risky experiment should not alter the
main working tree.

Do not use parallelism when agents must edit the same files, one decision
depends on another's result, or the overhead is larger than the work.

## Before delegation

1. Split work by clear ownership: directories, modules, tests, documentation,
   or an explicitly non-overlapping responsibility.
2. Name the expected evidence for each slice: file paths, a command result,
   commit, benchmark, or review finding.
3. Create a real child instance for each slice using the host's native
   mechanism. Register its real instance ID in Odradek only after creation.
4. Give each child its role profile and relevant skills as instructions; role
   profile names are not agent IDs.
5. Create a Git worktree/branch for each isolated implementation when Git is
   available. Record the branch, base revision, and worktree path as evidence.

## Worktree procedure

1. Inspect the current repository status and preserve pre-existing user
   changes. Never reset, discard, or rewrite unrelated edits.
2. Create the worktree from an explicit base revision and branch name.
3. Limit each child to its assigned files. If ownership must overlap, stop and
   re-plan rather than racing edits.
4. Run the smallest relevant tests inside that worktree. Record failures as
   failures, including retry/recovery evidence where applicable.
5. Commit a coherent change with an evidence-oriented message. Do not include
   secrets, generated credentials, or unrelated formatting churn.
6. Integrate through a reviewable mechanism: pull request, patch, cherry-pick,
   or merge. Record the exact review/integration reference.

## Review procedure

Review is a real activity, not a role label:

- The reviewer must be a real person or real agent instance with an identifiable
  execution record.
- The review must name the revision, scope, checks run, findings, and decision.
- If the principal self-reviews, record it as a principal review; do not create
  a fictional `reviewer` node.
- A no-findings result is valid only when the reviewer actually inspected the
  declared scope and evidence.
- External systems such as GitHub or CodeRabbit may be cited only after their
  actual review/run exists. A prepared checklist is not an executed review.

## Odradek evidence

For each parallel slice, record under its real producing instance:

- delegation from the real principal to the real child ID;
- assigned artifact ownership and worktree/branch;
- test and evaluation results;
- commit or patch identifier;
- review outcome and integration result.

Record coordination, conflict resolution, and final integration under the
real principal. The Odradek graph should let a reader trace every delivered
artifact to a real execution instance.

## Safety

- Never use a broad destructive Git command to "clean" another worktree.
- Keep secrets and environment-specific configuration out of commits and
  Odradek events.
- Escalate if integration requires protected-branch rights, remote credentials,
  production access, or a scope decision that was not delegated.

