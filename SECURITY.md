# Security policy

Odradek is designed for local-only use. The web UI binds to loopback by default
and the API reads only the configured output directory as a read-only volume.

## Data handling

- Do not commit `.env`, session output, database volumes, tokens, or credentials.
- Session events are retained locally in PostgreSQL until explicitly deleted.
- Use short summaries; do not put source secrets or sensitive content in events.
- Review any custom MCP integration independently before enabling it.

## Reporting a vulnerability

Please do not open a public issue for a suspected security vulnerability.
Contact the repository owner privately through GitHub and include reproducible,
minimal details. This project has not received a formal security audit.
