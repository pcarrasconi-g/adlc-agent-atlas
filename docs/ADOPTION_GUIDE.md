# Adopt Atlas in a project: a 10-minute guide

Atlas is optional, per person and per project. It adds a small hook to Claude
Code, records IDs, timing and check results locally, and draws them. It does not
change how agents are created or checked, and it needs no `justfile`, no
particular stack and no branch naming.

You need: Node 22 or newer, Claude Code, and git if you want revision and
worktree information. ADLC is not required; with it the stories are richer.

## 1. See what you will get (2 minutes)

Build the app once and open the recorded demo; no API and no Claude Code needed
([demo guide](DEMO_GUIDE.md)). To watch real runs, start the viewer from this
checkout:

```bash
npm --prefix agent-kit run observatory:setup
docker compose up -d --build
```

## 2. Turn it on for one project (1 minute)

```bash
node agent-kit/scripts/atlas-install.mjs install --project /path/to/your/project
```

It edits one file, `/path/to/your/project/.claude/settings.local.json` (Claude
Code's per-user settings for that project), and only adds hook entries that run
`atlas-hook.mjs`. It never touches the project's committed settings, ADLC or any
hook you already have. Add `--dry-run` to see the result first. If git does not
ignore that file it tells you; add it to `.git/info/exclude` so it is not
committed.

Options, all optional:

| Option | What it does |
| --- | --- |
| `--out-dir <dir>` | where sessions are written (default: this checkout's `agent-kit/output`, which the viewer watches) |
| `--retention-days <n>` | delete adapter recordings older than `n` days at the next session start (default 7) |
| `--gate "<regex>=<label>"` | teach Atlas a check it does not know, e.g. `--gate '^ng (test\|lint)\b=ng $1'` (repeatable) |

Start a **new** Claude Code session in the project (every test here installed
first and then started a session; changing hooks inside a running session was not
tried).

## 3. Work as usual, open the viewer (live) or reopen it later (replay)

Sessions appear under the viewer's project list and update as the run goes.
Recordings are plain JSON in the out dir, so a finished run can be reopened later.

## 4. Check that it works

```bash
node agent-kit/scripts/atlas-install.mjs status --project /path/to/your/project
ls agent-kit/output/sessions            # a file per Claude Code session
echo '{"hook_event_name":"SessionStart","session_id":"selftest","cwd":"."}' \
  | ATLAS_DEBUG=1 ATLAS_OUT_DIR=/tmp/atlas-selftest node agent-kit/scripts/atlas-hook.mjs
                                        # self-test: prints "[atlas] session_start recorded" and writes /tmp/atlas-selftest/sessions/selftest.json
```

## 5. Turn it off, delete what it recorded

```bash
node agent-kit/scripts/atlas-install.mjs uninstall --project /path/to/your/project
node agent-kit/scripts/atlas-hook.mjs purge --all        # or a session id
```

Uninstall removes exactly what install added and puts the file back as it was
(same bytes), or deletes it if Atlas was all it held. For a single session
without uninstalling, start Claude Code with `ATLAS_DISABLED=1`. `purge` never
touches sessions you wrote by hand.

## What it records, and what it never does

IDs Claude Code issued, timing, agent type, a short task label, status, the name
of a recognised check (`just lint`, `npm test`, `make test`, `pytest`, ...), its
exit code, a finding count, git revision and whether the tree had changes, and the
worktree name. Never prompts, answers, tool inputs or outputs, command lines,
file contents, environment variables or secrets. Details and the verified
payloads: [the event contract](ATLAS_EVENT_CONTRACT.md). A failing or slow hook
cannot block Claude Code: it always exits 0, prints nothing and gives up after 4
seconds.

## Two project shapes, both checked

- **Worktrees and checks** (e.g. ADLC executing in worktrees with `just`
  recipes): you see agents in their worktrees, each check with its exit code and
  where it ran, the baseline comparison, and what ADLC's completion guard
  reported.
- **Sequential, no checks** (no `justfile`, no worktrees): you see the principal,
  its subagents, their order and timing. Atlas says that no check was observed
  and that nothing is verified; it does not turn that into a green mark.

## If something looks wrong

- **Nothing appears:** start a new Claude Code session after installing; check
  `status`; run the self-test above; make sure the viewer watches the out dir.
- **A check shows "unknown result":** the command was chained (`just lint; echo
  $?`, `just lint | tail`), which hides its exit code. Run it on its own.
- **A check is not recognised:** add it with `--gate`.
- **No guard shown:** Atlas can only read ADLC's guard when it blocks a
  completion, and only for the `TaskCompleted` guard in the setups tested.
- **Branch is never shown:** Claude Code does not report it.
