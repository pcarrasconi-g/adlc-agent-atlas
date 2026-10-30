#!/usr/bin/env node
// Builds the committed sample recording from a raw, timestamped hook capture
// (one JSON object per line: {"_t": receipt time, "p": hook payload}).
// Outputs: a sanitized copy of the hook payloads and a session file the
// observatory can import. This is a fixture builder, not the Atlas adapter.
//
// usage: node atlas-sample-from-hooks.mjs <raw.jsonl> <hooks-out.jsonl> <session-out.json>
import { readFileSync, writeFileSync } from "node:fs";
import { normalizeHook } from "./lib/atlas-normalize.mjs";
import { buildSession } from "./lib/atlas-session.mjs";

const [rawPath, hooksOut, sessionOut] = process.argv.slice(2);
if (!rawPath || !hooksOut || !sessionOut) {
  console.error("usage: atlas-sample-from-hooks.mjs <raw.jsonl> <hooks-out.jsonl> <session-out.json>");
  process.exit(2);
}

const records_ = readFileSync(rawPath, "utf8").replace(/\n\}\n/g, "}\n").split("\n").filter(Boolean).map((l) => JSON.parse(l));

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
const clean = records_.map(sanitize);
const text = clean.map((r) => JSON.stringify(r)).join("\n") + "\n";
if (/\/home\/|\/tmp\/|osbulb|sovos/i.test(text)) throw new Error("sanitization leak");
writeFileSync(hooksOut, text);

// The session file comes from the same normalizer and builder the live adapter
// uses, so the committed sample shows exactly what the adapter produces. Real
// IDs are replaced with readable aliases afterwards.
const records = records_.map(({ _t, p }) => normalizeHook(p, { receivedAt: _t, env: {} })).filter(Boolean);
let session = JSON.stringify(buildSession(records, { title: "Recorded sample: two parallel subagents (real Claude Code 2.1.311 hooks)" }), null, 2);
const real = new Set();
for (const { p } of records_) {
  for (const v of [p.session_id, p.agent_id, p.tool_use_id, p.tool_response?.agentId]) if (typeof v === "string") real.add(v);
}
for (const id of real) session = session.replaceAll(id, alias(id.startsWith("toolu") ? "toolu" : id === records_[0].p.session_id ? "session" : "agent", id));
session = session.replace(/"sessionId": "[^"]+"/, '"sessionId": "atlas-sample-two-subagents"');
if (/\/home\/|\/tmp\/|osbulb|sovos/i.test(session)) throw new Error("sanitization leak in session");
writeFileSync(sessionOut, `${session}\n`);
console.log(`${clean.length} hook records, ${records.length} normalized, ${aliases.size} aliased ids`);
