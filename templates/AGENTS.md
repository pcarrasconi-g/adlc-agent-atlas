# Odradek agent workflow

Copy or reference the canonical Odradek contract at `<ODRADEK_ROOT>/AGENTS.md`.
Before creating any agent, run its once-per-task observatory preflight. A healthy
service is only a candidate: enter `starting`, create an in-memory candidate ID,
and issue only atomic `init`. Set `active` only if the writer accepts it. If init
fails, use `unavailable`, treat any partial artifact only as technical failure,
report it, and
do not publish or restart Docker automatically. If down, ask once whether to start it or
continue without visualization; never start Docker without consent. Preserve the
resulting `active`, `declined`, or `unavailable` state after `starting` resolves. Every task,
including questions, reviews, and tiny fixes, then starts once with a real
architect subagent. Its initial end-to-end plan decides the minimum sufficient
specialist assignments, validation/review, commit/integration, and deployment when
applicable. Do not create duplicate agents just because work enters another phase;
add one only after architect approval for material scope change, independent
expertise or review, risk, or real parallel benefit. The principal only coordinates,
records evidence, and integrates approved results. Unavailable delegation blocks
work. Treat profile names as prompt selectors, never as agent instance IDs. Register
only real principal/subagent instances with their host ID and profile; emit
events only for work that actually occurred. The full workflow, secrecy rule,
and closure requirement are defined by the canonical contract.
