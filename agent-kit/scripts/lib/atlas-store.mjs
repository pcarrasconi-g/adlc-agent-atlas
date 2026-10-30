// Local storage for the adapter: one append-only log per session plus the
// session file the observatory imports. Everything here is best effort; the
// caller must never let a failure reach Claude Code.
import { appendFileSync, closeSync, mkdirSync, openSync, readSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { buildSession } from "./atlas-session.mjs";
import { countFindings } from "./atlas-normalize.mjs";

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const dirs = (out) => ({ logs: path.join(out, "atlas"), sessions: path.join(out, "sessions") });

function acquire(lock, waitMs) {
  const deadline = Date.now() + waitMs;
  for (;;) {
    try {
      mkdirSync(lock);
      return true;
    } catch (e) {
      if (e.code !== "EEXIST") return false;
      try {
        if (Date.now() - statSync(lock).mtimeMs > 10_000) rmSync(lock, { recursive: true, force: true }); // stale
      } catch {}
      if (Date.now() >= deadline) return false;
      sleep(15);
    }
  }
}

const readRecords = (file) => {
  let text = "";
  try {
    text = readFileSync(file, "utf8");
  } catch {}
  return text.split("\n").flatMap((l) => {
    if (!l) return [];
    try {
      return [JSON.parse(l)];
    } catch {
      return []; // a torn line never breaks the session
    }
  });
};

function writeSession(out, session, records) {
  const { sessions } = dirs(out);
  const file = path.join(sessions, `${session}.json`);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(buildSession(records), null, 1));
  renameSync(tmp, file);
}

/** Append one record (idempotent by key) and refresh the session file. */
export function recordHook(out, record, { maxRecords = 6000, lockWaitMs = 1500 } = {}) {
  const { logs, sessions } = dirs(out);
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  mkdirSync(sessions, { recursive: true });
  const log = path.join(logs, `${record.session}.jsonl`);
  const lock = path.join(logs, `${record.session}.lock`);
  const terminal = ["session_end", "subagent_stop", "stop"].includes(record.kind);
  const locked = acquire(lock, terminal ? lockWaitMs * 2 : lockWaitMs);
  try {
    if (!locked) {
      // Cannot rebuild safely: keep the fact, the next hook rebuilds from the log.
      appendFileSync(log, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      return "appended-unlocked";
    }
    const records = readRecords(log);
    if (records.some((r) => r.key === record.key)) return "duplicate";
    if (records.length >= maxRecords && record.kind === "tool") return "dropped";
    appendFileSync(log, `${JSON.stringify(record)}\n`, { mode: 0o600 });
    records.push(record);
    writeSession(out, record.session, records);
    return "recorded";
  } finally {
    if (locked) rmSync(lock, { recursive: true, force: true });
  }
}

const isAtlasSession = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8")).source === "atlas-adapter";
  } catch {
    return false;
  }
};

/** Remove one session (or all) recorded by the adapter. Sessions written by hand are never touched. */
export function purge(out, session) {
  const { logs, sessions } = dirs(out);
  let removed = 0;
  let names = [];
  try {
    names = readdirSync(logs).filter((n) => n.endsWith(".jsonl")).map((n) => n.slice(0, -6));
  } catch {}
  for (const name of names) {
    if (session !== "--all" && name !== session) continue;
    rmSync(path.join(logs, `${name}.jsonl`), { force: true });
    const file = path.join(sessions, `${name}.json`);
    if (isAtlasSession(file)) rmSync(file, { force: true });
    removed++;
  }
  return removed;
}

/** Retention: drop adapter sessions whose log has not changed for `days`. */
export function prune(out, days = 7) {
  const { logs } = dirs(out);
  let removed = 0;
  let names = [];
  try {
    names = readdirSync(logs).filter((n) => n.endsWith(".jsonl"));
  } catch {
    return 0;
  }
  for (const n of names.slice(0, 200)) {
    try {
      if (Date.now() - statSync(path.join(logs, n)).mtimeMs > days * 86_400_000) removed += purge(out, n.slice(0, -6));
    } catch {}
  }
  return removed;
}

// ADLC's verification guard blocks a completion from a hook, so no other hook
// sees its result. Claude Code writes the guard's feedback into the transcript
// as a tool result. We read only new bytes, only to find that message, and keep
// recipe names and finding counts: never the text around them.
const GUARD_MARK = "Verification failed before completion";
const sha = (s) => createHash("sha256").update(s).digest("hex");

function readNew(file, from) {
  const size = statSync(file).size;
  if (from > size) from = 0;
  if (size - from > 8_000_000) from = size - 8_000_000;
  const len = size - from;
  if (len <= 0) return { text: "", start: from, next: from };
  const buf = Buffer.alloc(len);
  const fd = openSync(file, "r");
  try {
    readSync(fd, buf, 0, len, from);
  } finally {
    closeSync(fd);
  }
  const cut = buf.lastIndexOf(0x0a);
  if (cut < 0) return { text: "", start: from, next: from };
  return { text: buf.subarray(0, cut).toString("utf8"), start: from, next: from + cut + 1 };
}

const strings = (v, out = []) => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
};

export function parseGuardFeedback(text) {
  const marks = [...text.matchAll(/--- just ([\w:-]+) failed ---/g)];
  const recipes = [...new Set(marks.map((m) => m[1]))];
  const findings = {};
  marks.forEach((m, i) => {
    const n = countFindings(text.slice(m.index, marks[i + 1]?.index ?? text.length));
    if (n !== undefined && findings[m[1]] === undefined) findings[m[1]] = n;
  });
  return { recipes, findings, mode: text.match(/verify-guard\.sh\s+(\w+)/)?.[1], hook: text.match(/(\w+) hook feedback/)?.[1] };
}

/** Returns new `guard_blocked` records found since the last scan of these transcripts. */
export function scanTranscripts(out, session, { event, paths, agent, root = {}, now = Date.now() }) {
  const { logs } = dirs(out);
  const stateFile = path.join(logs, `${session}.scan.json`);
  let st = {};
  try {
    st = JSON.parse(readFileSync(stateFile, "utf8"));
  } catch {}
  const arming = event === "TaskCompleted" || event === "SubagentStop";
  const closing = event === "Stop" || event === "SessionEnd";
  if (!arming && !closing && !((st.pending ?? 0) >= now)) return []; // nothing to look for: stay cheap
  mkdirSync(logs, { recursive: true, mode: 0o700 });
  const lock = path.join(logs, `${session}.scan.lock`);
  if (!acquire(lock, 300)) return [];
  try {
    try {
      st = JSON.parse(readFileSync(stateFile, "utf8"));
    } catch {}
    st.offsets ||= {};
    if (arming) {
      st.pending = now + 120_000;
      if (root.rootRev) st.root = root;
    }
    const found = [];
    for (const file of paths) {
      let chunk;
      try {
        chunk = readNew(file, st.offsets[file] ?? 0);
      } catch {
        continue;
      }
      st.offsets[file] = chunk.next;
      let pos = chunk.start;
      for (const line of chunk.text.split("\n")) {
        const at = pos;
        pos += Buffer.byteLength(line) + 1;
        if (!line.includes(GUARD_MARK)) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch {
          continue;
        }
        if (obj.type !== "user") continue; // the model quoting the message does not count
        const text = strings(obj.message ?? obj).find((s) => s.includes(GUARD_MARK) && /hook feedback/.test(s));
        if (!text) continue;
        found.push({ v: 1, key: sha(`${session}|guard|${file}|${at}`).slice(0, 24), at: typeof obj.timestamp === "string" ? obj.timestamp : new Date(now).toISOString(), session, source: "transcript", kind: "guard_blocked", agent, ...parseGuardFeedback(text), ...(st.root ?? root) });
      }
    }
    if (found.length) st.pending = 0;
    writeFileSync(stateFile, JSON.stringify(st), { mode: 0o600 });
    return found;
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}
