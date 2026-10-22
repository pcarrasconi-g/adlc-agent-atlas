# Odradek agent workflow

Copy or reference the canonical Odradek contract at `<ODRADEK_ROOT>/AGENTS.md`.
Treat profile names as prompt selectors, never as agent instance IDs. Register
only real principal/subagent instances with their host ID and profile; emit
events only for work that actually occurred. The full workflow, secrecy rule,
and closure requirement are defined by the canonical contract.
