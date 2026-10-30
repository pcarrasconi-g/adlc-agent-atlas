import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe as describeSettings, install, strip } from "../scripts/atlas-install.mjs";
import { analyzeCommand, extraGates } from "../scripts/lib/atlas-normalize.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const INSTALL = path.join(here, "..", "scripts", "atlas-install.mjs");
const HOOK = path.join(here, "..", "scripts", "atlas-hook.mjs");
const project = () => mkdtempSync(path.join(tmpdir(), "atlas-proj-"));
const cli = (...args) => spawnSync("node", [INSTALL, ...args], { encoding: "utf8" });
const settingsFile = (p) => path.join(p, ".claude", "settings.local.json");

test("install writes only Atlas hooks, uninstall leaves the project exactly as it was", () => {
  const p = project();
  const out = path.join(p, "atlas out");
  assert.equal(cli("install", "--project", p, "--out-dir", out).status, 0);
  const s = JSON.parse(readFileSync(settingsFile(p), "utf8"));
  assert.deepEqual(Object.keys(s), ["hooks"]);
  assert.ok(s.hooks.SubagentStop && s.hooks.PostToolUseFailure);
  assert.match(JSON.stringify(s), /atlas-hook\.mjs/);
  assert.equal(cli("uninstall", "--project", p).status, 0);
  assert.equal(existsSync(settingsFile(p)), false, "the file only held Atlas, so it is gone");
});

test("existing settings and hooks are preserved, byte for byte, across install and uninstall", () => {
  const p = project();
  mkdirSync(path.join(p, ".claude"));
  const original = { permissions: { allow: ["Bash(just lint)"] }, env: { A: "1" }, hooks: { SubagentStop: [{ matcher: "qa", hooks: [{ type: "command", command: "bash ~/guards/verify.sh" }] }], PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo hi" }] }] } };
  const text = `${JSON.stringify(original, null, 2)}\n`;
  writeFileSync(settingsFile(p), text);
  assert.equal(cli("install", "--project", p).status, 0);
  const during = JSON.parse(readFileSync(settingsFile(p), "utf8"));
  assert.equal(during.permissions.allow[0], "Bash(just lint)");
  assert.equal(during.hooks.SubagentStop[0].hooks[0].command, "bash ~/guards/verify.sh", "the user's guard keeps running, and first");
  assert.equal(during.hooks.SubagentStop.length, 2);
  assert.equal(cli("uninstall", "--project", p).status, 0);
  assert.equal(readFileSync(settingsFile(p), "utf8"), text);
});

test("the file's own formatting comes back exactly: no final newline, tabs, compact", () => {
  const original = { env: { A: "1" }, hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } };
  for (const [name, text] of [["no final newline", JSON.stringify(original, null, 2)], ["tabs", `${JSON.stringify(original, null, "\t")}\n`], ["four spaces", `${JSON.stringify(original, null, 4)}\n`], ["compact", JSON.stringify(original)]]) {
    const p = project();
    mkdirSync(path.join(p, ".claude"));
    writeFileSync(settingsFile(p), text);
    cli("install", "--project", p);
    cli("uninstall", "--project", p);
    assert.equal(readFileSync(settingsFile(p), "utf8"), text, name);
  }
});

test("installing twice does not duplicate, and refreshes the options", () => {
  const p = project();
  cli("install", "--project", p, "--retention-days", "3");
  cli("install", "--project", p, "--retention-days", "14", "--gate", "^ng (test|lint)\\b=ng $1");
  const s = JSON.parse(readFileSync(settingsFile(p), "utf8"));
  assert.equal(s.hooks.PostToolUse.length, 1);
  const d = describeSettings(s);
  assert.deepEqual([d.installed, d.retentionDays, d.customChecks], [true, "14", 1]);
  const status = cli("status", "--project", p);
  assert.match(status.stdout, /retention: 14 days/);
  cli("uninstall", "--project", p);
  assert.match(cli("status", "--project", p).stdout, /not installed/);
  assert.match(cli("uninstall", "--project", p).stdout, /nothing to remove/);
});

test("a settings file that is not valid JSON is never touched", () => {
  const p = project();
  mkdirSync(path.join(p, ".claude"));
  writeFileSync(settingsFile(p), "{ not json");
  const r = cli("install", "--project", p);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /not valid JSON.*nothing was changed/);
  assert.equal(readFileSync(settingsFile(p), "utf8"), "{ not json");
});

test("dry run writes nothing; bad options fail loudly", () => {
  const p = project();
  assert.match(cli("install", "--project", p, "--dry-run").stdout, /would write/);
  assert.equal(existsSync(settingsFile(p)), false);
  assert.equal(cli("install", "--project", p, "--retention-days", "0").status, 1);
  assert.equal(cli("install", "--project", p, "--gate", "noequals").status, 1);
  assert.equal(cli("install", "--project", "/no/such/dir").status, 2);
  assert.equal(cli("install").status, 2);
});

test("a hook that someone merged with Atlas in one group loses only the Atlas part", () => {
  const mixed = install({}, {});
  const group = mixed.hooks.Stop[0];
  group.hooks.unshift({ type: "command", command: "echo mine" });
  assert.ok(strip(mixed) > 0);
  assert.deepEqual(mixed, { hooks: { Stop: [{ hooks: [{ type: "command", command: "echo mine" }] }] } });
});

test("paths with spaces and quotes survive into the hook command", () => {
  const p = project();
  const weird = path.join(p, "it's out");
  cli("install", "--project", p, "--out-dir", weird);
  assert.equal(describeSettings(JSON.parse(readFileSync(settingsFile(p), "utf8"))).outDir, weird);
});

test("custom check recipes extend the defaults and bad ones are ignored", () => {
  const extra = extraGates(JSON.stringify([{ match: "^ng (test|lint)\\b", label: "ng $1" }, { match: "(", label: "bad" }, { match: "ok", label: 5 }]));
  assert.equal(extra.length, 1);
  assert.deepEqual(analyzeCommand("cd app && ng test --watch=false", extra).recipes, ["ng test"]);
  assert.deepEqual(analyzeCommand("ng test", []).recipes, [], "unknown without the pattern: nothing is invented");
  assert.deepEqual(extraGates("not json"), []);
});

test("the installed hook records a custom check from its own command line", () => {
  const out = mkdtempSync(path.join(tmpdir(), "atlas-"));
  const env = { ...process.env, ATLAS_OUT_DIR: out, ATLAS_GATE_PATTERNS: JSON.stringify([{ match: "^ng (test|lint)\\b", label: "ng $1" }]) };
  const S = "aaaaaaaa-1111-2222-3333-444444444444";
  const send = (e) => spawnSync("node", [HOOK], { input: JSON.stringify({ session_id: S, cwd: "/w", ...e }), env, encoding: "utf8" });
  send({ hook_event_name: "PostToolUseFailure", tool_name: "Bash", tool_use_id: "t1", tool_input: { command: "ng test" }, error: "Exit code 1\n2 failed" });
  const session = JSON.parse(readFileSync(path.join(out, "sessions", `${S}.json`), "utf8"));
  const gate = session.transcript.find((e) => e.parsed.event === "gate.finished");
  assert.deepEqual([gate.parsed.recipe, gate.parsed.exit, gate.parsed.findings], ["ng test", 1, 2]);
  assert.deepEqual(readdirSync(path.join(out, "sessions")), [`${S}.json`]);
});
