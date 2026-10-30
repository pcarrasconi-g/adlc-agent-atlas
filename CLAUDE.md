# ADLC Agent Atlas

Atlas observes Claude Code runs that use the ADLC plugin; it does not orchestrate
them. For work on this checkout, ADLC and Claude Code decide which agents exist.
Do not run an observatory preflight, launch an architect, or require
`observatory:verify` because of this repository.

Read [AGENTS.md](AGENTS.md) for the short rules and
[the MVP plan](docs/ADLC_AGENT_ATLAS_MVP_PLAN.md) for current work. The retired
Odradek orchestration contract lives in [docs/legacy/](docs/legacy/) and is not
active.
