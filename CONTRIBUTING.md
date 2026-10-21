# Contributing

Odradek is a learning framework, not a mandatory development process. Small,
portable improvements are welcome.

## Contribution guidelines

1. Keep provider-specific behavior out of the core contract.
2. Do not add telemetry, remote calls, or credential handling to Odradek.
3. Preserve explicit parent-child relations; do not infer cross-session links by time.
4. Add or update tests for backend contract changes.
5. Never include real session output, secrets, internal URLs, or customer data.

Open an issue first for architecture changes or new integrations.
