<!-- LEGACY: reference only. ADLC Agent Atlas does not orchestrate agents; Claude Code and ADLC do. The "root AGENTS.md" contract mentioned here was retired (see docs/legacy/). -->

# Metrics and evaluations

## Purpose

Measure whether an agentic workflow produces useful, safe, and repeatable results
without confusing activity volume with quality or inventing evidence.

## When to use it

Use while defining an objective, at material checkpoints, and at iteration close.
Apply root `AGENTS.md`: every new task has real architect-first delegation.
Historical single-agent data may be measured but does not authorize solo execution.

## Identity and observability invariant

Metrics must identify the real producing execution. `agentId`, provider, session,
and work-item fields must describe an actual main agent or actually created
subagent. Role names such as `engineer` and `qa` are taxonomy fields only; they
cannot stand in for an agent identifier. Never generate metric events to make a
graph appear multi-agent.

## Procedure

1. Define a small metric contract before implementation. At minimum identify the
   work item, run/session, real producing agent, timestamp, event type, outcome,
   and evidence reference.
2. Choose metrics tied to the objective. Prefer:
   - acceptance pass rate and defect escape rate for quality;
   - rework count and recovery success/timeout/escalation for reliability;
   - elapsed time and human interventions for efficiency;
   - guardrail blocks and policy violations for safety;
   - token and cost fields only when the provider supplies them reliably.
3. Establish a baseline when comparing approaches. Record whether it is manual,
   prior-agent, simulated, or production-derived; do not compare unlike baselines
   without stating the limitation.
4. Emit append-only events at meaningful transitions such as `work_started`,
   `work_completed`, `acceptance_recorded`, `rework_required`,
   `guardrail_blocked`, `human_intervention`, and `usage_recorded`.
5. Validate event schema, required identifiers, allowed enum values, ordering, and
   evidence paths before publication. Reject malformed events instead of guessing
   missing values.
6. Aggregate only after validation. Show numerator, denominator, time window, and
   exclusions next to each percentage or total.
7. Interpret metrics with context: a low rework count may mean quality, but may
   also mean insufficient testing. Pair outcome metrics with acceptance evidence.

## Output

Produce:

- validated, append-only event records with evidence links;
- a compact report defining each metric, its window, and limitations;
- a comparison against an explicitly labeled baseline when one exists;
- Odradek checkpoints that cite the evidence but do not manufacture agents or
  events.

## Safety

- Do not include prompts containing secrets, raw customer data, or credentials in
  metric payloads.
- Do not infer token or cost values when the provider did not report them.
- Do not use a passing metric to override a failed acceptance criterion or a
  guardrail violation.
