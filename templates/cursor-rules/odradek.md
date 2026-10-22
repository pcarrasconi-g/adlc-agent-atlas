---
description: Follow the canonical Odradek identity and observability contract.
alwaysApply: true
---

Follow the Odradek workflow in `AGENTS.md`. Read agent definitions and assigned
skills. First run the once-per-task observatory preflight: a healthy response is
only a candidate; enter `starting`, create an in-memory candidate ID, and issue
only atomic `init`. Set `active` only if the writer accepts it. If init fails, use
`unavailable`, treat any partial artifact only as technical failure, report it, and do not publish
or restart Docker automatically. If down, ask once whether to start it or continue without it, and
never start Docker without consent. Then launch one real architect per task. Its initial plan defines the
minimum sufficient end-to-end delegation; the principal coordinates that plan and
verifies evidence; unavailable delegation blocks work. Read
skills from `<ODRADEK_ROOT>/agent-kit/config/`. Never represent a role as a
running agent; record only IDs of real instances and never put secrets in events.
