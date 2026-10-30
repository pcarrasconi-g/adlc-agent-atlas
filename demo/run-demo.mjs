#!/usr/bin/env node
// Runs the ADLC Agent Atlas demo for real, on this machine: Claude Code with
// the ADLC plugin works on a tiny local project whose lint has known legacy
// debt, while the Atlas hooks record the run.
//
//   node demo/run-demo.mjs --adlc /path/to/adlc-plugin [--out <dir>] [--model <id>] [--budget 1.5] --yes
//
// What it does (about two minutes, real model calls, a few cents to a dollar):
//   1. The principal measures the lint baseline in the project root.
//   2. A frontend-engineer subagent (worktree) adds a small module; its own
//      typecheck passes and its lint shows the same legacy failures.
//   3. ADLC's completion guard runs from the project root and blocks on lint.
//   4. A scripted "person" decides in Claude Code that lint is baseline, records
//      the decision, and limits the guard to typecheck. Completion then passes.
// No Jira, no PR, no remote. The project is copied to a temp folder.
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};
const adlc = arg("adlc", process.env.ADLC_PLUGIN_DIR);
const model = arg("model", "claude-sonnet-5-5");
const budget = arg("budget", "1.5");
const work = mkdtempSync(path.join(tmpdir(), "atlas-demo-"));
const out = path.resolve(arg("out", path.join(work, "out")));

if (!process.argv.includes("--yes") || !adlc || !existsSync(path.join(adlc, "hooks", "hooks.json"))) {
  console.error(`This runs Claude Code for real (${model}, budget cap $${budget} per phase) with the ADLC plugin.
Usage: node demo/run-demo.mjs --adlc <path to the ADLC plugin> [--out <dir>] [--model <id>] [--budget <usd>] --yes
(the plugin is read from disk and never modified; the demo project is copied to a temp folder)`);
  process.exit(2);
}

const repo = path.join(work, "repo");
cpSync(path.join(here, "fixture"), repo, { recursive: true });
const git = (...a) => execFileSync("git", a, { cwd: repo, stdio: "ignore" });
git("init", "-q");
git("config", "user.email", "demo@example.com");
git("config", "user.name", "demo");
git("add", "-A");
git("commit", "-qm", "demo project");

const settings = path.join(work, "atlas-settings.json");
execFileSync("node", [path.join(root, "agent-kit/scripts/atlas-hook-config.mjs"), "--out-dir", out, "--write", settings], { stdio: "ignore" });
const checkpoint = path.join(root, "agent-kit/scripts/atlas-checkpoint.mjs");

const tools = ["Agent", "TaskCreate", "TaskUpdate", "TaskList", "TaskGet", "Bash(just lint)", "Bash(just typecheck)", `Bash(node ${checkpoint}:*)`, "Write", "Edit", "Read", "Glob", "Grep", "ToolSearch"];
const base = ["-p", "--model", model, "--plugin-dir", adlc, "--setting-sources", "project", "--settings", settings, "--allowedTools", tools.join(" "), "--output-format", "json", "--max-budget-usd", budget];
const claude = (extra, prompt, env = {}) => {
  const r = spawnSync("claude", [...base, ...extra, prompt], { cwd: repo, encoding: "utf8", timeout: 600_000, input: "", env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`claude exited ${r.status}: ${r.stderr.slice(-300)}`);
  return JSON.parse(r.stdout);
};

console.log(`Phase 1: the principal measures the baseline, delegates, and asks for completion…`);
const one = claude([], `You are the principal of an ADLC execution run, in headless mode: everything happens in this one reply. Follow these steps in order and wait for each.
1. Measure the baseline: run 'just lint' on its own in the repository root with Bash. It fails because of known legacy debt; that is expected.
2. Create a task with TaskCreate, subject 'Add greeting module'.
3. Launch ONE subagent of type adlc:frontend-engineer with isolation worktree, in the foreground, and wait for it. Assignment: create src/feature/greeting.ts exporting greet(name: string): string that returns 'Hello, ' + name + '!' (no var, no console). Then verify in its worktree: run 'just typecheck', and as a separate Bash call 'just lint', each on its own with no extra shell syntax, and report both results. It must not edit src/legacy and must not commit.
4. Mark the task completed with TaskUpdate. If a hook blocks the completion, do not fix anything or work around it: say which recipe the hook reports as failed, and stop.`);
console.log(`  session ${one.session_id}, cost $${one.total_cost_usd?.toFixed(3)}`);

console.log(`Phase 2: the person decides in Claude Code (scripted), the guard is limited to typecheck…`);
const two = claude(["--resume", one.session_id], `The person in charge has decided: the lint failures come from the legacy baseline and were already there before this change, so the completion guard for the rest of this run should only check typecheck (that is already configured in this session's environment). First publish the decision by running exactly this command: node ${checkpoint} --phase execute --decision "Limit the completion guard to typecheck" --reason "lint failures are the legacy baseline, same as before the change". Then mark the task 'Add greeting module' completed again with TaskUpdate and say whether it was accepted.`, { ADLC_STOP_VERIFY: "typecheck" });
console.log(`  session ${two.session_id}, cost $${two.total_cost_usd?.toFixed(3)}`);

const sessions = path.join(out, "sessions");
const files = existsSync(sessions) ? readdirSync(sessions).filter((f) => f.endsWith(".json")) : [];
console.log(`\nRecorded ${files.length} Atlas session file(s) in ${sessions}`);
for (const f of files) {
  const s = JSON.parse(readFileSync(path.join(sessions, f), "utf8"));
  console.log(`  ${f}: ${s.transcript.length} entries`);
}
console.log(`Open the observatory on this folder (ODRADEK output) or freeze it with agent-kit/scripts/atlas-freeze-demo.mjs.`);
writeFileSync(path.join(work, "README.txt"), `phase1 session ${one.session_id}\nphase2 session ${two.session_id}\n`);
