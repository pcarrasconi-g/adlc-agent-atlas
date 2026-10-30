#!/usr/bin/env node
// ADLC Agent Atlas observation hook. Reads one Claude Code hook payload on
// stdin and records a small whitelisted event locally.
//
// Contract with Claude Code and ADLC:
//   - always exits 0 and prints nothing (SessionStart stdout would be injected
//     into the model's context), whatever goes wrong;
//   - never blocks, never alters a decision, never touches ADLC's own hooks;
//   - ATLAS_DISABLED=1 turns it off; ATLAS_DEBUG=1 prints diagnostics to stderr.
//
// Other uses:  atlas-hook.mjs purge <session-id|--all>
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeHook } from "./lib/atlas-normalize.mjs";
import { prune, purge, recordHook } from "./lib/atlas-store.mjs";

const debug = process.env.ATLAS_DEBUG === "1";
const note = (...a) => debug && console.error("[atlas]", ...a);
const finish = () => process.exit(0);
process.on("uncaughtException", (e) => {
  note("uncaught", e?.message);
  finish();
});
setTimeout(finish, 4000).unref(); // watchdog: never hold up Claude Code

const out = process.env.ATLAS_OUT_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "output");

async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) {
    chunks.push(c);
    if (chunks.reduce((n, x) => n + x.length, 0) > 5_000_000) break; // payloads can embed large tool output
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  if (process.env.ATLAS_DISABLED === "1") return;
  if (process.argv[2] === "purge") {
    const target = process.argv[3];
    if (!target) return note("usage: purge <session-id|--all>");
    process.stderr.write(`removed ${purge(out, target)} session(s)\n`);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(await readStdin());
  } catch {
    return note("stdin is not JSON");
  }
  const record = normalizeHook(payload, { receivedAt: new Date().toISOString(), env: process.env });
  if (!record) return note("ignored", payload?.hook_event_name);
  if (record.kind === "session_start") {
    try {
      prune(out, Number(process.env.ATLAS_RETENTION_DAYS) || 7);
    } catch {}
  }
  note(record.kind, recordHook(out, record));
}

try {
  await main();
} catch (e) {
  note("error", e?.message);
}
finish();
