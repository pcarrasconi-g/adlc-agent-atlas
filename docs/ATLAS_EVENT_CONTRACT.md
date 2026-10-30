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
| `PostToolUse` for `Agent` | `tool_response.agentId`, `.agentType` (sync), `.status` (`async_launched` or `completed`), `.resolvedModel`; `tool_input.description`, `.subagent_type` | The only place the new agent's ID is tied to who launched it. In a **synchronous** launch it arrives only after the subagent stopped. |
| `TaskCreated` / `TaskCompleted` | `task_id`, `task_subject`, `task_description` | No `agent_id` seen in a non-team session. |
| `Stop` | `last_assistant_message`, `background_tasks`, `stop_hook_active` | |
| `UserPromptSubmit` | `prompt`, `prompt_id` | Async agent completion arrives as a `<task-notification>` prompt. Not a source for Atlas. |

**No payload carries a timestamp, a parent agent ID, a branch or a worktree.**
The adapter must stamp receipt time and assign its own sequence number.

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
3. Gate observation (recipe, exit code, cwd) needs a wrapper or a bounded hook (Increment 2); nothing in these payloads reports it.
4. Decide how a worktree is learned, since no hook payload carries it.
