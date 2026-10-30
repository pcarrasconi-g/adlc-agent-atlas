# ADLC Agent Atlas: event contract and trust semantics (v1 draft)

Status: draft for Increment 0 of [the MVP plan](ADLC_AGENT_ATLAS_MVP_PLAN.md).
Contract version: `atlas.contract.v1`. Atlas only observes; Claude Code and the
ADLC plugin create and coordinate agents.

## 1. What was verified, and how

Payloads were captured with a throwaway logging hook in an isolated scratch
project (`--setting-sources project`, so no user plugins ran), on **Claude Code
2.1.311**, in two short headless runs: one launching two parallel subagents, one
using `TaskCreate`/`TaskUpdate`. Sanitized records (paths, IDs and all content
replaced) are in
[`contract-examples/claude-code-2.1.311-hooks.sample.jsonl`](contract-examples/claude-code-2.1.311-hooks.sample.jsonl).
Re-run the capture whenever Claude Code or the ADLC plugin is upgraded; field
names below are facts about that version, not a promise about others.

| Event | Fields seen (besides common `session_id`, `cwd`, `hook_event_name`) | Notes |
| --- | --- | --- |
| `SessionStart` | `source` (`startup`) | Principal identity = `session_id`. |
| `SessionEnd` | `reason` | |
| `SubagentStart` | `agent_id`, `agent_type` | **No parent, task, model or worktree.** |
| `SubagentStop` | `agent_id`, `agent_type`, `last_assistant_message`, `agent_transcript_path`, `background_tasks`, `stop_hook_active` | `background_tasks` still lists the stopping agent as `running`; never use it as liveness. |
| `PreToolUse` / `PostToolUse` | `tool_name`, `tool_use_id`, `tool_input`, `tool_response` (post), `duration_ms` (post); **`agent_id` + `agent_type` only when a subagent ran the tool** | Free per-agent activity signal. |
| `PostToolUseFailure` | `tool_name`, `tool_use_id`, `tool_input`, `error`, `is_interrupt`, `duration_ms`; `agent_id` + `agent_type` for subagents | A failed `Bash` call. `error` starts with `Exit code N` and then carries the command output (never stored). A succeeded call arrives as `PostToolUse` and has no exit field: success means exit 0. |
| `PostToolUse` for `Agent` | `tool_response.agentId`, `.agentType` (sync), `.status` (`async_launched` or `completed`), `.resolvedModel`; `tool_input.description`, `.subagent_type` | The only place the new agent's ID is tied to who launched it. In a **synchronous** launch it arrives only after the subagent stopped. |
| `TaskCreated` / `TaskCompleted` | `task_id`, `task_subject`, `task_description` | No `agent_id` seen in a non-team session. |
| `Stop` | `last_assistant_message`, `background_tasks`, `stop_hook_active` | |
| `UserPromptSubmit` | `prompt`, `prompt_id` | Async agent completion arrives as a `<task-notification>` prompt. Not a source for Atlas. |

**No payload carries a timestamp, a parent agent ID or a branch.** The adapter
stamps receipt time and keeps its own order. **Worktree:** there is no field,
but for a subagent launched with `isolation: worktree` every hook it triggers
(`SubagentStart`, tool hooks, `SubagentStop`) reports `cwd` =
`<repo>/.claude/worktrees/<name>`, while the principal's hooks report the
repository root. Atlas reads the worktree name from that path. Hooks defined with
`--settings` add to the ones a project or plugin defines (checked with a second
project hook); they do not replace ADLC's guards.

Both launch styles were seen: the first run launched subagents asynchronously
(`async_launched`), the second synchronously (`completed`, see section 2). A
timestamped second capture is in
[`contract-examples/claude-code-2.1.311-hooks-timestamped.sample.jsonl`](contract-examples/claude-code-2.1.311-hooks-timestamped.sample.jsonl).

Not verified (shown as unknown in Atlas until checked): `TeammateIdle` and
Agent Teams behavior (never fired in these runs), `Notification`, `PreCompact`,
and ADLC-specific `agent_type` values (the probe used `general-purpose`). Hook output may differ in the
Claude Code build bundled with the desktop app (bundled skills reported 2.1.308).

## 2. Identity and relations

- Principal ID = `session_id`. Agent instance ID = `agent_id`. Both are issued
  by Claude Code; Atlas never derives IDs from slugs, profiles or types.
- `agent_type` (for example `frontend-engineer`) is a label, not an identity.
  A relaunched agent has a new `agent_id` and is a new node.
- **Parent edge:** `SubagentStart` has no parent. Derive it from the launching
  tool call: on `PostToolUse` with `tool_name=Agent`, child = `tool_response.agentId`,
  parent = the event's `agent_id` if present, otherwise the principal. This is
  structural correlation of hook payloads, so the edge is `observed by hook`.
  If `agentId` is missing, draw no edge.
- **Asynchronous launch:** `PreToolUse(Agent)` → `PostToolUse(Agent)` (carries
  `agentId`) → `SubagentStart`. The edge is observed before the child's first event.
- **Synchronous launch:** `PreToolUse(Agent)` → `SubagentStart` (no link to the
  call) → … → `SubagentStop` → `PostToolUse(Agent)` (carries `agentId`, `status:
  completed`). While the agent runs there is no observed edge. Atlas draws a
  **two-phase edge**: at `SubagentStart`, if exactly one launch call is pending,
  an *inferred* delegation (confidence 0.6, rule `adjacent-to-agent-launch`) and
  the call's `description` as the task label; when `PostToolUse(Agent)` arrives
  with the same `agentId`, the edge becomes *observed*. If the pending launches
  are ambiguous, no edge is drawn. The map keeps the stronger of two edges for
  the same pair, and Learn mode explains the change.
- The importer must accept edges announced before the child's first event and
  tolerate out-of-order delivery.
- Task ↔ agent association is **not established** by these payloads. Show it as
  unknown until verified with Agent Teams.
- ADLC phases (refine/plan/breakdown/execute/pr) are context, never agents.

## 3. Normalized event and idempotency

The adapter maps hooks onto the existing backend schema (`aw.event.v1`,
`observatory/backend/src/lib/events.ts`: `externalKey`, `sequence`,
`agent{key,…,evidenceLevel}`, `status`, `relations[{source,target,kind,provenance,confidence}]`),
extending it only where needed. Plan fields map as: `event_id`→`externalKey`,
`principal_id`/`agent_id`→`agent.key`, `agent_type`→`agent.profile`,
`parent_id`→`relations[].source`, `evidence_ref`→`payload`.

`externalKey` must be stable so re-import is a no-op:
`sha256(session_id | hook_event_name | agent_id? | tool_use_id? | task_id? | prompt_id?)`,
plus the `source` value for `SessionStart`/`SessionEnd`. The same hook delivered
twice yields the same key.

## 4. What may be stored

Allowed: IDs (`session_id`, `agent_id`, `tool_use_id`, `task_id`), `agent_type`,
`hook_event_name`, `tool_name` (name only), status derived from the event kind,
`duration_ms`, receipt time, a task label (the Agent `description`, redacted and
truncated to 120 characters), and later gate fields (recipe name, exit code,
fingerprint, normalized cwd).

Never stored: `prompt`, `last_assistant_message`, `tool_input` and `tool_response`
contents, file contents, command output, environment variables, tokens and
secrets, transcript paths. `cwd` and any path are internal references and are
not used as public names. Sanitize and truncate before writing; the existing
redaction (`lib/redact.ts`) applies on top. If the writer fails, the hook must
still exit `0` and print nothing that changes Claude Code's behavior.

## 5. Trust semantics

Every visible claim carries exactly one provenance:

| Provenance | Meaning | Example |
| --- | --- | --- |
| **Observed by hook** | A hook payload says it happened. | `qa-engineer` started / stopped; an Agent launch created this edge. |
| **Verified by command** | A check ran and its exit code was recorded. | `lint` exited 1 in `<cwd>`. |
| **Declared by agent** | Only the agent's own words say it. | "tests pass" in a final message. |
| **Inferred by rule** | A deterministic Atlas rule concluded it. | Same gate failed 3 times with the same fingerprint. |

Rules: a declaration is never painted as success; "no signal" is neither
"finished" nor "failed"; baseline is never inferred from error volume, only from
a comparable earlier measurement of the same recipe, revision and configuration;
unknown stays unknown. Status is conveyed by text and icon as well as color.

Mapping to the current backend vocabulary (`evidenceLevel`, for agents):
`host-recorded` ≈ observed by hook, `behavior-evidenced` ≈ verified by command,
`declared` ≈ declared, `unverifiable` ≈ unknown. Relations carry their own
`provenance` (`observed`, `verified`, `declared` or `inferred`; the legacy value
`explicit` is read as declared). Decision in Increment 1: nodes keep the existing
`evidenceLevel` enum and only relations and rule results are "inferred", so no
migration was needed. The mapping lives in
`observatory/frontend/src/lib/provenance.ts`.

## 6. Liveness

Claude Code exposes no per-agent heartbeat. Evidence of life is `SubagentStart`
(start), any tool hook carrying that `agent_id` (activity), and `SubagentStop`
(terminal). Atlas shows "activity reported N s ago" and moves to **uncertain**
after a configurable threshold (proposed default 120 s, `ATLAS_STALE_AFTER_SEC`);
the green pulse stops at that point. Long reasoning without tool calls looks
silent, so staleness is low confidence. A missing `SubagentStop` does not prove
an agent is running. Adapter downtime and dropped events are recorded as gaps.

## 7. Open items for later increments

1. Verify `TeammateIdle`, Agent Teams and task↔agent correlation with a real ADLC team run.
2. Verify ADLC `agent_type` values on the target setup.
3. ADLC's own guard (`verify-guard.sh`) runs as a hook command, so its result is
   not visible to other hooks. Atlas observes the checks agents run through the
   Bash tool, and records the guard's context (`projectDir`, from
   `CLAUDE_PROJECT_DIR`) beside each agent's `cwd`/worktree so Increment 3 can
   show a mismatch. Observing the guard's own exit code would need a wrapper
   around it, which would change ADLC; it is not planned.
4. Branch is never reported; do not display or infer it.

## 8. The adapter (Increment 2)

`agent-kit/scripts/atlas-hook.mjs` is a hook command that records the events
above. It is optional and per session:

```bash
node agent-kit/scripts/atlas-hook-config.mjs --write /tmp/atlas-settings.json
claude --settings /tmp/atlas-settings.json      # leave the flag out to turn it off
```

- **What it stores** (`agent-kit/output/atlas/<session>.jsonl`, 0600, append-only):
  a version, receipt time, session, hook name, a stable key, IDs, `agent_type`, a
  kind (`session_start`, `agent_launch`, `subagent_start`, `gate_finished`, ...),
  a task label (redacted, 120 characters), tool name and duration, and for
  checks the recipe label (`just lint`, `npm test`, ...), exit code, a failure
  fingerprint and path references (last segment plus a short hash; the
  worktree name). Never prompts, answers, tool input or output, command lines,
  file contents, transcript paths or environment variables.
- **Session file:** after each record the log is turned into
  `agent-kit/output/sessions/<session>.json`, which the observatory already
  imports. The build is deterministic and deduplicates by key, so a repeated hook
  changes nothing and a late hook only fills in what it carries.
- **Checks:** a `Bash` call whose command matches a verification recipe becomes
  `gate.started` / `gate.finished`. A failed check is a fact about the check;
  it never marks the agent failed.
- **Failure behavior:** the hook always exits 0, prints nothing (stdout of
  `SessionStart` would reach the model), has a 4 s watchdog and a lock with a
  stale-lock timeout. If it cannot lock it still appends the record. Median cost
  measured at about 50 ms per hook, also with 1,500 records in the log.
- **Retention:** adapter logs and sessions older than 7 days (`ATLAS_RETENTION_DAYS`)
  are removed at `SessionStart`; `atlas-hook.mjs purge <session|--all>` removes
  them on demand and never touches sessions written by hand.
- **Environment:** `ATLAS_OUT_DIR`, `ATLAS_DISABLED=1`, `ATLAS_DEBUG=1`.
