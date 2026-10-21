# Reusable skills

Kit skills are plain Markdown files with no proprietary format. Any AI host can
read and apply them during a turn without installing an SDK.

## Suggested convention

Each skill may live at `config/skills/<name>.md` and should declare:

1. **Purpose**: which problem it solves.
2. **When to use it**: input signals and boundaries.
3. **Steps**: procedure the agent must follow.
4. **Output**: verifiable format, files, or expected decisions.
5. **Safety**: data it must not expose and actions requiring approval.

To reuse a skill, tell the host agent to read the Markdown before creating the
subagent and keep its rules in the host prompt.
