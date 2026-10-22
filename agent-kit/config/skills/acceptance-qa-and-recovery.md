# Acceptance QA and recovery

## Purpose

Turn an implementation into a demonstrably acceptable change through layered
testing, failure handling, and clear escalation.

## When to use it

Use whenever code, configuration, workflows, or agent behavior changes. Apply it
before declaring an objective done. The architect assigns validation and review
to real agents; the principal verifies their evidence without running task QA itself.

## Identity and observability invariant

Test evidence belongs to the agent that ran it. A QA profile can be used by a real
subagent, but the label `qa` is not an identity by itself. Missing required QA
delegation blocks acceptance; never replace it with principal testing or a
synthetic QA node. Preserve historical evidence under its actual producer.

## Procedure

1. Translate the request into explicit acceptance criteria: observable behavior,
   boundaries, failure conditions, and evidence required for each.
2. Select the smallest complete validation stack:
   - unit tests for deterministic rules and transformations;
   - integration or smoke tests for real component boundaries;
   - end-to-end tests for a user-visible critical path;
   - security and policy checks for permissions, secrets, and protected paths.
3. Exercise one expected failure path, not only a happy path. Verify that an error
   is controlled, state remains valid, and the user/operator receives useful
   feedback.
4. For asynchronous or unreliable work, configure bounded retries, a timeout,
   backoff, idempotency where needed, and a clear terminal escalation. Do not
   retry indefinitely or convert a permanent failure into a false success.
5. On failure, classify it as product defect, test defect, environmental issue,
   blocked authorization, or acceptance ambiguity. Capture the minimal evidence
   needed to reproduce it.
6. Repair only within the assigned scope, rerun the affected checks, then rerun
   the closing acceptance suite. A prior green run is not evidence after a change.
7. Mark work `done` only if every acceptance criterion has a corresponding result
   or an explicitly approved exception.

## Output

Produce a concise acceptance record:

- acceptance criteria and their pass/fail/approved-exception status;
- commands or test identifiers, environment assumptions, and outcomes;
- a controlled failure-path result;
- retry/timeout/escalation behavior where applicable;
- defect, rework, or blocker references and final disposition.

Publish the record to Odradek under the real executing agent identity. In a real
multi-agent run, link evidence to the specific registered subagent that ran it.

## Safety

- Do not report a test as executed when it was only designed, mocked, or inferred.
- Do not mask flaky, skipped, timed-out, or unavailable tests as passes.
- Do not use production data or live destructive systems for routine validation
  without explicit authorization and containment.
