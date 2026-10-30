// Turns one Claude Code hook payload into a small, whitelisted record.
// Nothing outside this file's output is ever stored: no prompts, answers,
// tool inputs/outputs, file contents or command lines (only a recipe label).
// See docs/ATLAS_EVENT_CONTRACT.md for the verified payload shapes.
import { createHash } from "node:crypto";
import { redactText } from "./atlas-redact.mjs";

export const SCHEMA = 1;
const sha = (s) => createHash("sha256").update(s).digest("hex");
const id = (v) => (typeof v === "string" && /^[A-Za-z0-9_.:-]{1,160}$/.test(v) ? v : undefined);

/** Internal reference to a path: its last segment plus a short hash of the whole path (never a user name). */
export function pathRef(p) {
  if (typeof p !== "string" || !p) return undefined;
  const parts = p.split(/[\\/]/).filter(Boolean);
  return `…/${redactText(parts.at(-1) ?? "", 60)}#${sha(p).slice(0, 6)}`;
}
export function worktreeOf(p) {
  const m = typeof p === "string" ? p.match(/[\\/]worktrees[\\/]([^\\/]+)/) : null;
  return m ? m[1].slice(0, 80) : undefined;
}

// Verification commands. Only the recipe label is kept, never the full command.
const GATES = [
  [/^just\s+(lint|test|typecheck|build|format|fmt|check|ci|verify)\b/, (m) => `just ${m[1]}`],
  [/^(npm|pnpm|yarn|bun)\s+(run\s+)?(test|lint|typecheck|type-check|build|check|format|verify)\b/, (m) => `${m[1]} ${m[2] ? "run " : ""}${m[3]}`],
  [/^(?:npx\s+)?(tsc|eslint|prettier|vitest|jest|mypy|pyright)\b/, (m) => m[1]],
  [/^(?:npx\s+)?ruff\s+(check|format)\b/, (m) => `ruff ${m[1]}`],
  [/^(?:python3?\s+-m\s+)?(pytest|py\.test)\b/, () => "pytest"],
  [/^cargo\s+(test|clippy|check|build|fmt)\b/, (m) => `cargo ${m[1]}`],
  [/^go\s+(test|vet|build)\b/, (m) => `go ${m[1]}`],
  [/^make\s+(test|lint|check|build|verify|ci)\b/, (m) => `make ${m[1]}`],
  [/^dotnet\s+(test|build)\b/, (m) => `dotnet ${m[1]}`],
  [/^(?:mvn|\.\/gradlew|gradle)\s+(test|verify|check|build)\b/, (m) => `${/mvn/.test(m[0]) ? "mvn" : "gradle"} ${m[1]}`],
];
export function gateRecipe(command) {
  if (typeof command !== "string") return undefined;
  for (let seg of command.split(/&&|\|\||;|\n|\|/)) {
    seg = seg.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "");
    for (const [re, label] of GATES) {
      const m = seg.match(re);
      if (m) return label(m);
    }
  }
  return undefined;
}

/** Hash of the shape of a failure's output: lets repeats be grouped without storing the output. */
export function fingerprint(text) {
  if (typeof text !== "string") return undefined;
  const lines = text
    .replace(/\x1b\[[0-9;]*m/g, "")
    .split("\n")
    .slice(1) // first line is "Exit code N"
    .map((l) => l.toLowerCase().replace(/(?:[a-z]:)?[\\/][\w.@~/\\-]+/g, "<p>").replace(/\b[0-9a-f]{7,}\b/g, "<h>").replace(/\d+/g, "#").trim())
    .filter(Boolean)
    .slice(0, 5);
  return lines.length ? sha(lines.join("\n")).slice(0, 8) : undefined;
}

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/**
 * @param payload parsed hook JSON
 * @param opts { receivedAt: ISO string, env: process.env-like }
 * @returns a record, or null when the event is not one Atlas stores
 */
export function normalizeHook(payload, { receivedAt, env = {} } = {}) {
  if (!payload || typeof payload !== "object") return null;
  const event = payload.hook_event_name;
  const session = id(payload.session_id);
  if (typeof event !== "string" || !session || !receivedAt) return null;
  const agent = id(payload.agent_id);
  const agentType = id(payload.agent_type);
  const toolUseId = id(payload.tool_use_id);
  const tool = id(payload.tool_name);
  const ctx = { cwd: pathRef(payload.cwd), worktree: worktreeOf(payload.cwd), projectDir: pathRef(env.CLAUDE_PROJECT_DIR) };
  const input = payload.tool_input && typeof payload.tool_input === "object" ? payload.tool_input : {};
  const base = { v: SCHEMA, at: receivedAt, session, source: event };
  let fields;
  let taskId;

  switch (event) {
    case "SessionStart":
      fields = { kind: "session_start", origin: id(payload.source), cwd: ctx.cwd };
      break;
    case "SessionEnd":
      fields = { kind: "session_end", reason: id(payload.reason) };
      break;
    case "SubagentStart":
      fields = { kind: "subagent_start", agent, agentType, ...ctx };
      break;
    case "SubagentStop":
      fields = { kind: "subagent_stop", agent, agentType, ...ctx };
      break;
    case "Stop":
      fields = { kind: "stop", agent };
      break;
    case "TeammateIdle":
      fields = { kind: "teammate_idle", agent };
      break;
    case "TaskCreated":
    case "TaskCompleted":
      taskId = id(String(payload.task_id ?? ""));
      fields = { kind: event === "TaskCreated" ? "task_created" : "task_completed", taskId, task: redactText(payload.task_subject) };
      break;
    case "PreToolUse":
      if (tool === "Agent") fields = { kind: "agent_launch", agent, toolUseId, task: redactText(input.description), agentType: id(input.subagent_type), isolation: id(input.isolation) };
      else if (tool === "Bash" && gateRecipe(input.command)) fields = { kind: "gate_started", agent, toolUseId, recipe: gateRecipe(input.command), ...ctx };
      break;
    case "PostToolUse":
      if (tool === "Agent") {
        const r = payload.tool_response && typeof payload.tool_response === "object" ? payload.tool_response : {};
        fields = { kind: "agent_launch_result", agent, toolUseId, child: id(r.agentId), agentType: id(r.agentType), status: id(r.status), task: redactText(input.description) };
      } else if (tool === "Bash" && gateRecipe(input.command)) fields = { kind: "gate_finished", agent, toolUseId, recipe: gateRecipe(input.command), exit: 0, durationMs: Number.isFinite(payload.duration_ms) ? payload.duration_ms : undefined, ...ctx };
      else if (tool) fields = { kind: "tool", agent, tool, durationMs: Number.isFinite(payload.duration_ms) ? payload.duration_ms : undefined };
      break;
    case "PostToolUseFailure":
      if (tool === "Bash" && gateRecipe(input.command)) {
        const m = typeof payload.error === "string" ? payload.error.match(/^Exit code (\d+)/) : null;
        fields = { kind: "gate_finished", agent, toolUseId, recipe: gateRecipe(input.command), exit: m ? Number(m[1]) : undefined, interrupted: payload.is_interrupt === true ? true : undefined, fingerprint: fingerprint(payload.error), durationMs: Number.isFinite(payload.duration_ms) ? payload.duration_ms : undefined, ...ctx };
      } else if (tool) fields = { kind: "tool", agent, tool, failed: true };
      break;
    default:
      break;
  }
  if (!fields) return null;
  const key = sha([session, event, agent ?? "", toolUseId ?? "", taskId ?? "", payload.prompt_id ?? "", fields.origin ?? fields.reason ?? ""].join("|")).slice(0, 24);
  return clean({ ...base, key, ...fields });
}
