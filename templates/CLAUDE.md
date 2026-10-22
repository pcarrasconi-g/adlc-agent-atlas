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
