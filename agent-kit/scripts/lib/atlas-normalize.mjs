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
/**
 * Extra check recipes for stacks the defaults do not know, from ATLAS_GATE_PATTERNS:
 * a JSON list of {"match": "<regex>", "label": "ng $1"}. Bad entries are skipped.
 */
export function extraGates(raw) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    return JSON.parse(raw)
      .slice(0, 20)
      .flatMap(({ match, label }) => {
        if (typeof match !== "string" || match.length > 200 || typeof label !== "string") return [];
        try {
          const re = new RegExp(match);
          return [[re, (m) => label.replace(/\$(\d)/g, (_, i) => m[i] ?? "").slice(0, 40)]];
        } catch {
          return []; // one bad pattern must not disable the others
        }
      });
  } catch {
    return [];
  }
}

const recipeOf = (seg, extra = []) => {
  seg = seg.trim().replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=\S*\s+)+/, "");
  for (const [re, label] of [...GATES, ...extra]) {
    const m = seg.match(re);
    if (m) return label(m);
  }
  return undefined;
};
export function gateRecipe(command) {
  if (typeof command !== "string") return undefined;
  for (const seg of command.split(/&&|\|\||;|\n|\|/)) {
    const r = recipeOf(seg);
    if (r) return r;
  }
  return undefined;
}

const HARMLESS = /^(?:cd|echo|export|pwd|true|:)(?:\s|$)/;
/**
 * Which checks a Bash command runs, and whether its exit code can be read as
 * theirs. `just lint; echo "exit=$?"` always exits 0, `just lint | tail` exits
 * with tail's code: in those cases the result is unknown, never "passed".
 */
export function analyzeCommand(command, extra = []) {
  if (typeof command !== "string") return { recipes: [], simple: false };
  const recipes = [...new Set(command.split(/&&|\|\||;|\n|\|/).map((s) => recipeOf(s, extra)).filter(Boolean))];
  if (!recipes.length) return { recipes, simple: false };
  const masked = /;|\|\||\||\n|`|\$\(|&\s*$/.test(command);
  const others = command.split("&&").map((s) => s.trim()).filter((s) => s && !recipeOf(s, extra));
  const simple = !masked && others.every((s) => HARMLESS.test(s));
  return { recipes, simple };
}

/** Number of findings in a check's output ("5 problems", "3 errors"); a count only, never text. */
export function countFindings(text) {
  if (typeof text !== "string") return undefined;
  // "file.ts:3  error" is a line number, not a count.
  const m = text.match(/(?<![:\w.])(\d{1,6})\s+(?:problems?|errors?|failures?|failed|issues?|violations?)\b/i);
  return m ? Number(m[1]) : undefined;
}

const argOf = (s, name) => {
  const m = s.match(new RegExp(`--${name}\\s+(?:"([^"]*)"|'([^']*)'|(\\S+))`));
  return m ? m[1] ?? m[2] ?? m[3] : undefined;
};
/** `atlas-checkpoint.mjs --phase … --decision … --reason …`: what a person or the principal chose to publish. */
export function parseCheckpoint(command) {
  const m = typeof command === "string" ? command.match(/atlas-checkpoint(?:\.mjs)?\s+(.*)$/s) : null;
  if (!m) return undefined;
  const decision = redactText(argOf(m[1], "decision"));
  if (!decision) return undefined;
  return { phase: redactText(argOf(m[1], "phase"), 40), decision, reason: redactText(argOf(m[1], "reason")) };
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

const gitOf = (git, dir) => {
  const g = typeof git === "function" && typeof dir === "string" ? git(dir) : undefined;
  return g ? { rev: g.rev, dirty: g.dirty, repo: g.repo } : {};
};
// The ADLC guard runs in CLAUDE_PROJECT_DIR; remember the state of that tree.
const rootOf = (git, env) => {
  const g = typeof git === "function" && env.CLAUDE_PROJECT_DIR ? git(env.CLAUDE_PROJECT_DIR) : undefined;
  return g ? { rootRev: g.rev, rootDirty: g.dirty, rootRepo: g.repo } : {};
};

const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ""));

/**
 * @param payload parsed hook JSON
 * @param opts { receivedAt: ISO string, env: process.env-like }
 * @returns a record, or null when the event is not one Atlas stores
 */
export function normalizeHook(payload, { receivedAt, env = {}, git } = {}) {
  if (!payload || typeof payload !== "object") return null;
  const event = payload.hook_event_name;
  const session = id(payload.session_id);
  if (typeof event !== "string" || !session || !receivedAt) return null;
  const agent = id(payload.agent_id);
  const agentType = id(payload.agent_type);
  const toolUseId = id(payload.tool_use_id);
  const tool = id(payload.tool_name);
  const extra = extraGates(env.ATLAS_GATE_PATTERNS);
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
      fields = { kind: "subagent_stop", agent, agentType, ...ctx, ...rootOf(git, env) };
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
      fields = { kind: event === "TaskCreated" ? "task_created" : "task_completed", taskId, task: redactText(payload.task_subject), ...(event === "TaskCompleted" ? rootOf(git, env) : {}) };
      break;
    case "PreToolUse": {
      const cmd = tool === "Bash" ? analyzeCommand(input.command, extra) : undefined;
      if (tool === "Agent") fields = { kind: "agent_launch", agent, toolUseId, task: redactText(input.description), agentType: id(input.subagent_type), isolation: id(input.isolation) };
      else if (cmd?.recipes.length) fields = { kind: "gate_started", agent, toolUseId, recipe: cmd.recipes.join(" + "), complex: cmd.simple && cmd.recipes.length === 1 ? undefined : true, ...ctx };
      break;
    }
    case "PostToolUse": {
      const cmd = tool === "Bash" ? analyzeCommand(input.command, extra) : undefined;
      const duration = Number.isFinite(payload.duration_ms) ? payload.duration_ms : undefined;
      if (tool === "Agent") {
        const r = payload.tool_response && typeof payload.tool_response === "object" ? payload.tool_response : {};
        fields = { kind: "agent_launch_result", agent, toolUseId, child: id(r.agentId), agentType: id(r.agentType), status: id(r.status), task: redactText(input.description) };
      } else if (tool === "Bash" && parseCheckpoint(input.command)) fields = { kind: "checkpoint", agent, toolUseId, ...parseCheckpoint(input.command) };
      else if (cmd?.recipes.length) {
        // A succeeded command exited 0; that is only the check's exit code when nothing can mask it.
        const reliable = cmd.simple;
        fields = { kind: "gate_finished", agent, toolUseId, recipe: cmd.recipes.join(" + "), exit: reliable ? 0 : undefined, complex: reliable ? undefined : true, durationMs: duration, ...ctx, ...gitOf(git, payload.cwd) };
      } else if (tool) fields = { kind: "tool", agent, tool, durationMs: duration };
      break;
    }
    case "PostToolUseFailure": {
      const cmd = tool === "Bash" ? analyzeCommand(input.command, extra) : undefined;
      if (cmd?.recipes.length) {
        const m = typeof payload.error === "string" ? payload.error.match(/^Exit code (\d+)/) : null;
        const reliable = cmd.simple && cmd.recipes.length === 1;
        fields = { kind: "gate_finished", agent, toolUseId, recipe: cmd.recipes.join(" + "), exit: reliable && m ? Number(m[1]) : undefined, complex: reliable ? undefined : true, interrupted: payload.is_interrupt === true ? true : undefined, fingerprint: fingerprint(payload.error), findings: countFindings(payload.error), durationMs: Number.isFinite(payload.duration_ms) ? payload.duration_ms : undefined, ...ctx, ...gitOf(git, payload.cwd) };
      } else if (tool) fields = { kind: "tool", agent, tool, failed: true };
      break;
    }
    default:
      break;
  }
  if (!fields) return null;
  const key = sha([session, event, agent ?? "", toolUseId ?? "", taskId ?? "", payload.prompt_id ?? "", fields.origin ?? fields.reason ?? ""].join("|")).slice(0, 24);
  return clean({ ...base, key, ...fields });
}
