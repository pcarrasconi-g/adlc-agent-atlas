// Local storage for the adapter: one append-only log per session plus the
// session file the observatory imports. Everything here is best effort; the
// caller must never let a failure reach Claude Code.
import { appendFileSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSession } from "./atlas-session.mjs";

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
