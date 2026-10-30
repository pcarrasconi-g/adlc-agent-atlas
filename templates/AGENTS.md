# Atlas observer (optional)

This repository may be observed by ADLC Agent Atlas, a local read-only visualizer.
Nothing here changes how you work:

- Do not create extra agents, run a preflight or require verification because of
  Atlas. Claude Code and ADLC remain the only orchestrators.
- If the Atlas adapter is enabled for this project, it records only IDs, timing,
  agent type, a short task label, status, check name and exit code. Never prompts,
  responses, file contents, command output, environment variables or secrets.
- A telemetry failure must never block or alter the work.

Contract: `<ATLAS_ROOT>/docs/ATLAS_EVENT_CONTRACT.md`. The adapter itself ships in a
later increment of the Atlas MVP plan.
