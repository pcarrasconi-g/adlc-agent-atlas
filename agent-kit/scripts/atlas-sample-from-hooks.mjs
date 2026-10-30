#!/usr/bin/env node
// Builds the committed sample recording from a raw, timestamped hook capture
// (one JSON object per line: {"_t": receipt time, "p": hook payload}).
// Outputs: a sanitized copy of the hook payloads and a session file the
// observatory can import. This is a fixture builder, not the Atlas adapter.
//
// usage: node atlas-sample-from-hooks.mjs <raw.jsonl> <hooks-out.jsonl> <session-out.json>
import { readFileSync, writeFileSync } from "node:fs";

const [rawPath, hooksOut, sessionOut] = process.argv.slice(2);
if (!rawPath || !hooksOut || !sessionOut) {
  console.error("usage: atlas-sample-from-hooks.mjs <raw.jsonl> <hooks-out.jsonl> <session-out.json>");
  process.exit(2);
}

const records = readFileSync(rawPath, "utf8").replace(/\n\}\n/g, "}\n").split("\n").filter(Boolean).map((l) => JSON.parse(l));

// Stable, readable aliases instead of the real IDs.
const aliases = new Map();
const alias = (prefix, value) => {
  if (!aliases.has(value)) aliases.set(value, `${prefix}-${[...aliases.keys()].filter((k) => aliases.get(k).startsWith(prefix)).length + 1}`);
  return aliases.get(value);
};

const PATH_KEYS = new Set(["cwd", "transcript_path", "scratchpad_dir", "agent_transcript_path", "outputFile"]);
const sanitize = ({ _t, p }) => {
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    if (PATH_KEYS.has(k)) out[k] = "<path>";
    else if (k === "prompt" || k === "last_assistant_message") out[k] = "<omitted>";
    else if (k === "session_id") out[k] = alias("session", v);
    else if (k === "agent_id") out[k] = alias("agent", v);
    else if (k === "tool_use_id") out[k] = alias("toolu", v);
    else if (k === "prompt_id") out[k] = alias("prompt", v);
    else if (k === "tool_input") out[k] = Object.fromEntries(Object.entries(v).map(([a, b]) => [a, ["prompt", "file_path", "content"].includes(a) ? "<omitted>" : b]));
    else if (k === "tool_response") {
      out[k] = p.tool_name === "Agent"
        ? { agentId: alias("agent", v.agentId), agentType: v.agentType, status: v.status, resolvedModel: v.resolvedModel, totalDurationMs: v.totalDurationMs, totalToolUseCount: v.totalToolUseCount, content: "<omitted>", prompt: "<omitted>" }
        : "<omitted>";
    } else if (k === "background_tasks") out[k] = v.map((t) => ({ ...t, id: alias("agent", t.id) }));
    else out[k] = v;
  }
  return { _t, p: out };
};
const clean = records.map(sanitize);
const text = clean.map((r) => JSON.stringify(r)).join("\n") + "\n";
if (/\/home\/|\/tmp\/|osbulb|sovos/i.test(text)) throw new Error("sanitization leak");
writeFileSync(hooksOut, text);

// Session file in the agent-kit explicit format.
const principal = clean.find((r) => r.p.hook_event_name === "SessionStart").p.session_id;
const transcript = [];
const pendingLaunches = []; // descriptions of Agent calls not yet matched to a SubagentStart
const agentTask = new Map();
const add = (entry) => transcript.push({ round: transcript.length, ...entry });
const short = (id) => id.replace(/^agent-/, "agent ");

for (const { _t: at, p } of clean) {
  const ev = p.hook_event_name;
  if (ev === "PreToolUse" && p.tool_name === "Agent" && !p.agent_id) {
    pendingLaunches.push(p.tool_input.description);
    add({ agentId: principal, at, parsed: { status: "working", summary: `Delegating: ${p.tool_input.description}`, tool: "Agent" } });
  } else if (ev === "SubagentStart") {
    // Claude Code gives no parent or task here. The launch call that just
    // happened is the only candidate, so the edge starts as an inference.
    const task = pendingLaunches.shift();
    agentTask.set(p.agent_id, task);
    add({
      agentId: p.agent_id, at,
      parsed: { event: "agent_registered", status: "working", summary: "Started", profile: p.agent_type, displayName: p.agent_type, provider: "claude-code", task, evidenceLevel: "host-recorded" },
      relations: [{ source: principal, target: p.agent_id, kind: "delegation", provenance: "inferred", confidence: 0.6, metadata: { rule: "adjacent-to-agent-launch" } }],
    });
  } else if (ev === "PostToolUse" && p.agent_id) {
    add({ agentId: p.agent_id, at, parsed: { status: "working", summary: `Tool ${p.tool_name} finished`, tool: p.tool_name, durationMs: p.duration_ms } });
  } else if (ev === "SubagentStop") {
    add({ agentId: p.agent_id, at, parsed: { status: "done", summary: "Stopped (result text not stored)" } });
  } else if (ev === "PostToolUse" && p.tool_name === "Agent" && !p.agent_id) {
    const child = p.tool_response.agentId;
    add({
      agentId: principal, at,
      parsed: { status: "working", summary: `Launch of ${short(child)} confirmed: ${p.tool_response.status}`, tool: "Agent" },
      relations: [{ source: principal, target: child, kind: "delegation", provenance: "observed", confidence: 1, metadata: { rule: "agent-tool-response", confirmsTask: agentTask.get(child) === p.tool_input.description } }],
    });
  } else if (ev === "Stop" && !p.agent_id) {
    add({ agentId: principal, at, parsed: { status: "done", summary: "Principal finished its turn" } });
  }
}

const first = clean[0]._t;
writeFileSync(sessionOut, JSON.stringify({
  sessionId: "atlas-sample-two-subagents",
  goal: "Recorded sample: two parallel subagents (real Claude Code 2.1.311 hooks)",
  kind: "done",
  principal: { agentId: principal, displayName: "Claude Code (principal)", profile: "principal", provider: "claude-code", task: "Launch two subagents in parallel", identitySource: "host-issued" },
  recordedAt: first,
  transcript,
}, null, 2) + "\n");
console.log(`${clean.length} hook records, ${transcript.length} transcript entries, ${aliases.size} aliased ids`);
