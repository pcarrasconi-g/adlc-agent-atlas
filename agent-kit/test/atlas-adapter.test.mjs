import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { redactText } from "../scripts/lib/atlas-redact.mjs";
import { gateRecipe, normalizeHook, fingerprint } from "../scripts/lib/atlas-normalize.mjs";
import { buildSession } from "../scripts/lib/atlas-session.mjs";
import { recordHook, purge } from "../scripts/lib/atlas-store.mjs";
import { settings } from "../scripts/atlas-hook-config.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOOK = path.join(here, "..", "scripts", "atlas-hook.mjs");
const SECRET = "sk-ABCDEF1234567890SECRET";
const S = "11111111-2222-3333-4444-555555555555";
const t = (n) => new Date(Date.UTC(2026, 9, 30, 12, 0, n)).toISOString();
const hook = (payload, n = 0, env = {}) => normalizeHook({ session_id: S, cwd: "/work/proj", ...payload }, { receivedAt: t(n), env });

test("redaction masks secrets, credentials, e-mails and home paths", () => {
  const s = redactText(`Fix login token=${SECRET} for bob@corp.com in /home/bob/app with https://u:pw@host/x Bearer abcdefghijklmnop`, 400);
  for (const leak of [SECRET, "bob@corp.com", "/home/bob", "u:pw@", "abcdefghijklmnop"]) assert.ok(!s.includes(leak), `leaked ${leak}: ${s}`);
  assert.equal(redactText("word ".repeat(100), 50).length, 50);
  assert.equal(redactText(42), undefined);
});

test("gate recipes keep only a label, never the command line", () => {
  assert.equal(gateRecipe("cd app && just lint --token abc123"), "just lint");
  assert.equal(gateRecipe("CI=1 npm run lint -- --fix"), "npm run lint");
  assert.equal(gateRecipe("npm test"), "npm test");
  assert.equal(gateRecipe("npx tsc --noEmit"), "tsc");
  assert.equal(gateRecipe("python -m pytest -q tests/"), "pytest");
  assert.equal(gateRecipe("ls -la && cat secrets.txt"), undefined);
  assert.equal(gateRecipe("just deploy"), undefined);
});

test("normalizing keeps only whitelisted facts", () => {
  const launch = hook({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: "toolu_1", tool_input: { description: `Refactor with ${SECRET}`, prompt: "SECRET PROMPT TEXT", subagent_type: "frontend-engineer" } });
  const text = JSON.stringify(launch);
  assert.equal(launch.kind, "agent_launch");
  assert.equal(launch.agentType, "frontend-engineer");
  for (const leak of ["SECRET PROMPT TEXT", SECRET]) assert.ok(!text.includes(leak));
  const stop = hook({ hook_event_name: "SubagentStop", agent_id: "agent-a", agent_type: "qa-engineer", last_assistant_message: "ALL TESTS PASSED, trust me", agent_transcript_path: "/home/u/t.jsonl" });
  assert.ok(!JSON.stringify(stop).includes("trust me"));
  assert.ok(!JSON.stringify(stop).includes("/home/u"));
});

test("a failed check yields its exit code and a fingerprint, not its output", () => {
  const err = `Exit code 2\nFAIL: 3 errors in src/app.ts line 42 token=${SECRET}\nmake: *** [Makefile:2: test] Error 1`;
  const a = hook({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_use_id: "toolu_2", tool_input: { command: "make test" }, error: err });
  assert.equal(a.kind, "gate_finished");
  assert.equal(a.exit, 2);
  assert.match(a.fingerprint, /^[0-9a-f]{8}$/);
  assert.ok(!JSON.stringify(a).includes(SECRET));
  const other = fingerprint(err.replace("3 errors", "7 errors").replace("line 42", "line 9"));
  assert.equal(other, a.fingerprint, "same shape of failure groups together");
  assert.notEqual(fingerprint("Exit code 1\nTypeError: x is not a function"), a.fingerprint);
  const ok = hook({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "toolu_3", tool_input: { command: "make lint" }, tool_response: { stdout: "ok" } });
  assert.deepEqual([ok.kind, ok.exit], ["gate_finished", 0]);
});

test("ordinary shell commands are not recorded as checks or stored", () => {
  assert.equal(hook({ hook_event_name: "PreToolUse", tool_name: "Bash", tool_use_id: "t", tool_input: { command: "curl -H 'Authorization: x' https://x" } }), null);
  const post = hook({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "t", tool_input: { command: "cat .env" }, tool_response: { stdout: SECRET } });
  assert.equal(post.kind, "tool");
  assert.ok(!JSON.stringify(post).includes(SECRET) && !JSON.stringify(post).includes(".env"));
});

test("worktree is read from a subagent's cwd and keys are stable", () => {
  const p = { hook_event_name: "SubagentStart", agent_id: "agent-a", agent_type: "backend-engineer", cwd: "/work/proj/.claude/worktrees/agent-a" };
  const r1 = hook(p, 1, { CLAUDE_PROJECT_DIR: "/work/proj" });
  const r2 = hook(p, 99);
  assert.equal(r1.worktree, "agent-a");
  assert.notEqual(r1.cwd, r1.projectDir, "guard context and agent context differ");
  assert.equal(r1.key, r2.key, "re-delivery has the same key");
  assert.equal(hook({ hook_event_name: "Notification" }), null);
  assert.equal(normalizeHook({ hook_event_name: "Stop", session_id: "../../etc" }, { receivedAt: t(0) }), null);
});

const launch = (n, id, desc) => hook({ hook_event_name: "PreToolUse", tool_name: "Agent", tool_use_id: id, tool_input: { description: desc, subagent_type: "general-purpose" } }, n);
const start = (n, agent) => hook({ hook_event_name: "SubagentStart", agent_id: agent, agent_type: "general-purpose" }, n);
const stop = (n, agent) => hook({ hook_event_name: "SubagentStop", agent_id: agent, agent_type: "general-purpose" }, n);
const result = (n, id, child, status = "completed") => hook({ hook_event_name: "PostToolUse", tool_name: "Agent", tool_use_id: id, tool_input: { description: "x" }, tool_response: { agentId: child, agentType: "general-purpose", status } }, n);
const relOf = (s) => s.transcript.flatMap((e) => (e.relations || []).map((r) => `${r.target}:${r.provenance}`));

test("two concurrent agents are distinct instances; a sequential launch is first inferred then observed", () => {
  const s = buildSession([launch(1, "t1", "Read a"), start(2, "A"), launch(3, "t2", "Read c"), start(4, "B"), stop(8, "B"), stop(9, "A"), result(10, "t1", "A"), result(11, "t2", "B")]);
  const agents = new Set(s.transcript.map((e) => e.agentId));
  assert.ok(agents.has("A") && agents.has("B") && agents.has(S));
  assert.deepEqual(relOf(s), ["A:inferred", "B:inferred", "A:observed", "B:observed"]);
  assert.equal(s.transcript.find((e) => e.agentId === "A").parsed.task, "Read a");
  assert.equal(s.kind, "running", "no SessionEnd yet, so we do not claim it ended");
});

test("simultaneous launches are ambiguous: no guessed edge, resolved when results arrive", () => {
  const s = buildSession([launch(1, "t1", "Read a"), launch(1.5, "t1b", "Read c"), start(2, "A"), start(2.5, "B"), result(10, "t1", "A"), result(11, "t1b", "B")]);
  assert.deepEqual(relOf(s), ["A:observed", "B:observed"]);
  const a = s.transcript.filter((e) => e.agentId === "A").map((e) => e.parsed.task).filter(Boolean);
  assert.deepEqual(a, ["Read a"], "task label only appears once confirmed");
});

test("asynchronous launch (result before start) gives an observed edge immediately", () => {
  const s = buildSession([launch(1, "t1", "Read a"), result(2, "t1", "A", "async_launched"), start(3, "A")]);
  assert.deepEqual(relOf(s), ["A:observed", "A:observed"]);
  assert.equal(s.transcript.find((e) => e.parsed.event === "agent_registered").parsed.task, "Read a");
});

test("a failing check is recorded as a fact about the check, never as the agent failing", () => {
  const fail = hook({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_use_id: "g1", agent_id: "A", agent_type: "qa-engineer", tool_input: { command: "just lint" }, error: "Exit code 1\nlint error" }, 5);
  const s = buildSession([start(1, "A"), fail, stop(6, "A")]);
  const gate = s.transcript.find((e) => e.parsed.event === "gate.finished");
  assert.equal(gate.parsed.exit, 1);
  assert.equal(gate.parsed.status, "working");
  assert.match(gate.parsed.summary, /failed \(exit 1\)/);
  assert.equal(s.transcript.at(-1).parsed.status, "done");
});

test("duplicates and out-of-order delivery do not change the result", () => {
  const recs = [launch(1, "t1", "Read a"), start(2, "A"), stop(5, "A"), result(6, "t1", "A")];
  const once = buildSession(recs);
  assert.deepEqual(buildSession([...recs, ...recs]), once);
  assert.deepEqual(buildSession([recs[3], recs[1], recs[2], recs[0]]), once);
  const ended = buildSession([...recs, hook({ hook_event_name: "SessionEnd", reason: "other" }, 9)]);
  assert.equal(ended.kind, "done");
});

test("the store is idempotent, atomic and survives a held lock", () => {
  const out = mkdtempSync(path.join(tmpdir(), "atlas-"));
  const r = launch(1, "t1", "Read a");
  assert.equal(recordHook(out, r), "recorded");
  assert.equal(recordHook(out, r), "duplicate");
  const log = path.join(out, "atlas", `${S}.jsonl`);
  assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 1);
  const file = path.join(out, "sessions", `${S}.json`);
  assert.equal(JSON.parse(readFileSync(file, "utf8")).source, "atlas-adapter");
  mkdirSync(path.join(out, "atlas", `${S}.lock`)); // another hook holds the lock
  assert.equal(recordHook(out, start(2, "A"), { lockWaitMs: 30 }), "appended-unlocked");
  rmSyncLock(out);
  assert.equal(recordHook(out, stop(3, "A")), "recorded");
  assert.ok(JSON.parse(readFileSync(file, "utf8")).transcript.some((e) => e.agentId === "A"), "the unlocked append was not lost");
  writeFileSync(path.join(out, "sessions", "by-hand.json"), JSON.stringify({ sessionId: "by-hand" }));
  assert.equal(purge(out, "--all"), 1);
  assert.ok(existsSync(path.join(out, "sessions", "by-hand.json")), "hand-written sessions are never deleted");
  assert.ok(!existsSync(file));
});
function rmSyncLock(out) {
  spawnSync("rm", ["-rf", path.join(out, "atlas", `${S}.lock`)]);
}

const run = (input, env = {}) => spawnSync("node", [HOOK], { input, env: { ...process.env, ...env }, encoding: "utf8", timeout: 10_000 });

test("the hook never blocks or prints, whatever it is fed", () => {
  const out = mkdtempSync(path.join(tmpdir(), "atlas-"));
  const good = JSON.stringify({ hook_event_name: "SessionStart", session_id: S, source: "startup", cwd: "/w" });
  const cases = [
    ["garbage", "not json at all {"],
    ["empty", ""],
    ["unknown event", JSON.stringify({ hook_event_name: "Notification", session_id: S })],
    ["huge", JSON.stringify({ hook_event_name: "PostToolUse", session_id: S, tool_name: "Read", tool_use_id: "t", tool_response: "x".repeat(2_000_000) })],
    ["valid, output dir is a file", good, { ATLAS_OUT_DIR: path.join(out, "afile") }],
    ["valid, disabled", good, { ATLAS_DISABLED: "1" }],
    ["valid", good],
  ];
  writeFileSync(path.join(out, "afile"), "x");
  for (const [name, input, env] of cases) {
    const r = run(input, { ATLAS_OUT_DIR: out, ...env });
    assert.equal(r.status, 0, `${name}: exit ${r.status}`);
    assert.equal(r.stdout, "", `${name}: stdout must stay empty`);
    assert.equal(r.stderr, "", `${name}: stderr must stay empty`);
  }
  assert.ok(existsSync(path.join(out, "sessions", `${S}.json`)), "the valid event was recorded");
});

test("nothing sensitive reaches disk when real-looking payloads go through the hook", () => {
  const out = mkdtempSync(path.join(tmpdir(), "atlas-"));
  const events = [
    { hook_event_name: "UserPromptSubmit", session_id: S, prompt: `deploy with ${SECRET}` },
    { hook_event_name: "PreToolUse", session_id: S, tool_name: "Agent", tool_use_id: "t1", tool_input: { description: `Use ${SECRET} to fix`, prompt: "PRIVATE-PROMPT" } },
    { hook_event_name: "SubagentStart", session_id: S, agent_id: "A", agent_type: "backend-engineer", cwd: "/home/alice/proj" },
    { hook_event_name: "PostToolUse", session_id: S, agent_id: "A", tool_name: "Read", tool_use_id: "t2", tool_input: { file_path: "/home/alice/.ssh/id_rsa" }, tool_response: { content: "PRIVATE-KEY-DATA" } },
    { hook_event_name: "PostToolUseFailure", session_id: S, agent_id: "A", tool_name: "Bash", tool_use_id: "t3", tool_input: { command: `npm test --token=${SECRET}` }, error: `Exit code 1\nboom ${SECRET}` },
    { hook_event_name: "SubagentStop", session_id: S, agent_id: "A", agent_type: "backend-engineer", last_assistant_message: "PRIVATE-ANSWER", agent_transcript_path: "/home/alice/t.jsonl" },
  ];
  for (const e of events) assert.equal(run(JSON.stringify(e), { ATLAS_OUT_DIR: out }).status, 0);
  const all = [path.join(out, "atlas", `${S}.jsonl`), path.join(out, "sessions", `${S}.json`)].map((f) => readFileSync(f, "utf8")).join("\n");
  for (const leak of [SECRET, "PRIVATE-PROMPT", "PRIVATE-KEY-DATA", "PRIVATE-ANSWER", "alice", "id_rsa", "--token"]) assert.ok(!all.includes(leak), `leaked: ${leak}`);
  assert.ok(all.includes("gate.finished") && all.includes("npm test"));
  assert.ok(readdirSync(path.join(out, "atlas")).every((n) => !n.endsWith(".lock")), "no lock left behind");
});

test("the generated settings add Atlas hooks only, with bounded timeouts", () => {
  const events = Object.keys(settings.hooks);
  for (const e of ["SessionStart", "SubagentStart", "SubagentStop", "PostToolUse", "PostToolUseFailure", "PreToolUse", "TaskCompleted"]) assert.ok(events.includes(e), e);
  for (const group of Object.values(settings.hooks).flat()) for (const h of group.hooks) {
    assert.equal(h.type, "command");
    assert.ok(h.timeout <= 10);
    assert.match(h.command, /atlas-hook\.mjs/);
    assert.doesNotMatch(h.command, /verify-guard|stop-guard/);
  }
});

// ---- Increment 3: honest results, git context, guard feedback, checkpoints

import { analyzeCommand, countFindings, parseCheckpoint } from "../scripts/lib/atlas-normalize.mjs";
import { scanTranscripts, parseGuardFeedback } from "../scripts/lib/atlas-store.mjs";
import { appendFileSync } from "node:fs";

test("a chained command never reports a check as passed or failed", () => {
  assert.equal(analyzeCommand("just lint").simple, true);
  assert.equal(analyzeCommand("cd app && just lint").simple, true);
  assert.equal(analyzeCommand('just typecheck; echo "exit=$?"; just lint').simple, false);
  assert.equal(analyzeCommand("just lint | tail -5").simple, false);
  const masked = hook({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "m1", tool_input: { command: 'just lint; echo "exit=$?"' }, tool_response: { stdout: "exit=1" } });
  assert.equal(masked.exit, undefined, "exit 0 of the echo is not the check's exit code");
  assert.equal(masked.complex, true);
  const failedPipe = hook({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_use_id: "m2", tool_input: { command: "just lint | tail" }, error: "Exit code 1\nx" });
  assert.equal(failedPipe.exit, undefined);
  const s = buildSession([masked]);
  assert.match(s.transcript.at(-1).parsed.summary, /unknown result/);
});

test("finding counts and git context are numbers and flags, never text", () => {
  assert.equal(countFindings("a\n✖ 5 problems (5 errors, 0 warnings)"), 5);
  assert.equal(countFindings("all good"), undefined);
  const git = (dir) => ({ rev: "abc123def456", dirty: dir.includes("worktrees"), repo: "r1" });
  const base = { hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_input: { command: "just lint" }, error: "Exit code 1\n✖ 5 problems" };
  const a = normalizeHook({ session_id: S, tool_use_id: "g1", cwd: "/w/proj", ...base }, { receivedAt: t(1), env: {}, git });
  const b = normalizeHook({ session_id: S, tool_use_id: "g2", cwd: "/w/proj/.claude/worktrees/agent-a", ...base }, { receivedAt: t(2), env: {}, git });
  assert.deepEqual([a.findings, a.rev, a.dirty, a.repo], [5, "abc123def456", false, "r1"]);
  assert.equal(b.dirty, true);
  assert.equal(b.worktree, "agent-a");
});

const feedback = (extra = "") => `TaskCompleted hook feedback:\n[bash /x/hooks/verify-guard.sh taskcompleted]: Verification failed before completion — fix these, then finish:\n--- just lint failed ---\nnode tools/lint.mjs\nlegacy/orders.ts:3  error  no-var\n\n✖ 5 problems (5 errors, 0 warnings)\n--- just test failed ---\n2 failures${extra}`;

test("the ADLC guard's message is read from the transcript as recipes and counts only", () => {
  const p = parseGuardFeedback(feedback());
  assert.deepEqual(p.recipes, ["lint", "test"]);
  assert.deepEqual(p.findings, { lint: 5, test: 2 });
  assert.equal(p.mode, "taskcompleted");
  const out = mkdtempSync(path.join(tmpdir(), "atlas-"));
  const file = path.join(out, "session.jsonl");
  const line = (o) => `${JSON.stringify(o)}\n`;
  writeFileSync(file, line({ type: "assistant", message: { content: [{ type: "text", text: `The guard said: ${feedback()}` }] } }) + line({ type: "user", timestamp: t(7), message: { content: [{ type: "tool_result", content: feedback() }] } }));
  const root = { rootRev: "abc", rootDirty: false, rootRepo: "r1" };
  assert.deepEqual(scanTranscripts(out, S, { event: "PostToolUse", paths: [file], root }), [], "nothing is looked for until a completion was requested");
  const found = scanTranscripts(out, S, { event: "TaskCompleted", paths: [file], root, now: Date.now() });
  assert.equal(found.length, 1, "the model quoting the message is not a second block");
  assert.deepEqual([found[0].kind, found[0].at, found[0].rootRev], ["guard_blocked", t(7), "abc"]);
  assert.ok(!JSON.stringify(found).includes("no-var"), "output text is not kept");
  assert.deepEqual(scanTranscripts(out, S, { event: "Stop", paths: [file], root }), [], "already seen");
  appendFileSync(file, line({ type: "user", timestamp: t(9), message: { content: [{ type: "tool_result", content: feedback() }] } }));
  assert.equal(scanTranscripts(out, S, { event: "Stop", paths: [file], root }).length, 1, "a second block is a second record");
  const s = buildSession([...found, hook({ hook_event_name: "SessionEnd" }, 20)]);
  assert.match(s.transcript[0].parsed.summary, /ADLC guard blocked completion: just lint, just test failed \(lint: 5, test: 2 findings\)/);
});

test("a published decision is recorded from the command line, redacted", () => {
  assert.deepEqual(parseCheckpoint(`node /x/atlas-checkpoint.mjs --phase execute --decision "Limit the guard to typecheck" --reason 'lint is baseline token=${SECRET}'`), { phase: "execute", decision: "Limit the guard to typecheck", reason: "lint is baseline token=[redacted]" });
  assert.equal(parseCheckpoint("node atlas-checkpoint.mjs --phase x"), undefined);
  const r = hook({ hook_event_name: "PostToolUse", tool_name: "Bash", tool_use_id: "c1", tool_input: { command: 'node a/atlas-checkpoint.mjs --decision "Use typecheck only" --reason "baseline"' }, tool_response: { stdout: "ok" } });
  assert.equal(r.kind, "checkpoint");
  const s = buildSession([r]);
  assert.match(s.transcript[0].parsed.summary, /Decision: Use typecheck only/);
  assert.equal(s.transcript[0].parsed.event, "checkpoint");
});
