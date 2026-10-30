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
import { normalizeHook, pathRef } from "./lib/atlas-normalize.mjs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { prune, purge, recordHook, scanTranscripts } from "./lib/atlas-store.mjs";

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

/** Revision and cleanliness of a checkout, to tell whether two measurements are comparable. */
function gitContext(dir) {
  try {
    const run = (args) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", timeout: 700, stdio: ["ignore", "pipe", "ignore"] }).trim();
    const rev = run(["rev-parse", "--short=12", "HEAD"]);
    const dirty = run(["status", "--porcelain", "--", ".", ":(exclude).claude"]).length > 0;
    const common = path.resolve(dir, run(["rev-parse", "--git-common-dir"]));
    return { rev, dirty, repo: createHash("sha256").update(common).digest("hex").slice(0, 8) };
  } catch {
    return undefined; // not a repository, no git, or too slow: leave it unknown
  }
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
  const record = normalizeHook(payload, { receivedAt: new Date().toISOString(), env: process.env, git: gitContext });
  if (!record) return note("ignored", payload?.hook_event_name);
  if (record.kind === "session_start") {
    try {
      prune(out, Number(process.env.ATLAS_RETENTION_DAYS) || 7);
    } catch {}
  }
  note(record.kind, recordHook(out, record));
  // The ADLC guard's verdict lands in the transcript after the hooks ran.
  const paths = [payload.transcript_path, payload.agent_transcript_path].filter((p) => typeof p === "string" && p.endsWith(".jsonl"));
  const root = { rootRev: record.rootRev, rootDirty: record.rootDirty, rootRepo: record.rootRepo, rootCwd: record.rootRev ? pathRef(process.env.CLAUDE_PROJECT_DIR) : undefined };
  for (const g of scanTranscripts(out, record.session, { event: payload.hook_event_name, paths, agent: record.agent, root })) note("guard", recordHook(out, g));
}

try {
  await main();
} catch (e) {
  note("error", e?.message);
}
finish();
