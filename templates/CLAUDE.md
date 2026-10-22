# Odradek workflow

Use the instructions in `AGENTS.md` after copying the canonical Odradek
contract into the target workspace, or read `<ODRADEK_ROOT>/AGENTS.md` directly.
Run the canonical once-per-task observatory preflight before creating an agent:
a healthy check is only a candidate; enter `starting`, create an in-memory
candidate ID, and issue only atomic `init`. Set `active` only if the writer accepts
it. If init fails, use `unavailable`, treat any partial artifact only as technical
failure, report it, and do not publish or restart Docker automatically. If down, ask once whether to start it or
continue without it, and never start Docker without consent. Every task then
requires one real architect first. Its initial plan defines the minimum
sufficient end-to-end delegation; the principal coordinates that plan and Odradek
evidence when active. Declined/unavailable visualization does not block agents;
unavailable required delegation does block execution.

Order is mandatory: read `<ODRADEK_ROOT>/AGENTS.md` and run preflight **before any
read or work in this repository** (no exploratory reading first). Preflight is
per task; a continuation inside the approved scope reuses it, a new objective or
doubt means a new task. Use only host-issued IDs (never from slug/profile/placeholder;
block if the host gives none). Register agents with `agent_registered`. The writer's
printed path is not evidence of visibility: before closing, run
`npm --prefix <ODRADEK_ROOT>/agent-kit run observatory:verify -- --session <ID>`;
run it without `--no-close` (that flag never counts for closure); if not run, report NO EJECUTADA and do not close as done. If it fails with a healthy service, retry once, diagnose without restarting, ask the user before recreating the container, report "FALLÓ: observabilidad no verificada", never mark done and never switch to `unavailable` to sidestep it. See the closure
checklist and the subagent-type-to-profile table in AGENTS.md.
 Preflight outcomes are `healthy_own` (may proceed), `healthy_foreign`/`healthy_unknown` (never `starting`/`active`; ask the user once: other port for this copy with consent, other URL via `--base-url`/`ODRADEK_BASE_URL`, or continue without it as `declined`), or `unavailable`; URL precedence is `--base-url` > `ODRADEK_BASE_URL` > `.env` `ODRADEK_PORT`; without configuration the result is `setup_required` (8090 is never assumed).
 Each checkout has its own `ODRADEK_PORT`/`ODRADEK_INSTANCE` in its unversioned `.env`; preflight queries only that URL (never assume 8090, never another instance's port). If missing (`setup_required`), run `npm --prefix <ODRADEK_ROOT>/agent-kit run observatory:setup` (edits `.env` only); starting Docker still needs consent unless already given for the task.
