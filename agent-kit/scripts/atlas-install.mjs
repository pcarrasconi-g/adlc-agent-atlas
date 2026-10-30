#!/usr/bin/env node
// Turn the Atlas hook on or off for one project, without touching the project's
// committed settings, the ADLC plugin or anything else.
//
//   atlas-install.mjs install   --project <dir> [--out-dir <dir>] [--retention-days <n>] [--gate "<regex>=<label>"]... [--dry-run]
//   atlas-install.mjs uninstall --project <dir> [--dry-run]
//   atlas-install.mjs status    --project <dir>
//
// It edits one file, <project>/.claude/settings.local.json (Claude Code's
// per-user, per-project settings), and only the hook entries that run
// atlas-hook.mjs. Everything else in the file is left as it is, and uninstall
// removes exactly what install added.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildSettings, HOOK_FILE } from "./atlas-hook-config.mjs";

const isAtlas = (hook) => typeof hook?.command === "string" && hook.command.includes(HOOK_FILE);

/** Remove Atlas hooks from a settings object (mutates). Returns how many were removed. */
export function strip(settings) {
  let removed = 0;
  for (const [event, groups] of Object.entries(settings.hooks ?? {})) {
    if (!Array.isArray(groups)) continue;
    const kept = [];
    for (const g of groups) {
      const hooks = Array.isArray(g?.hooks) ? g.hooks : [];
      const rest = hooks.filter((h) => !isAtlas(h));
      removed += hooks.length - rest.length;
      if (rest.length === hooks.length) kept.push(g);
      else if (rest.length) kept.push({ ...g, hooks: rest });
    }
    if (kept.length) settings.hooks[event] = kept;
    else delete settings.hooks[event];
  }
  if (settings.hooks && !Object.keys(settings.hooks).length) delete settings.hooks;
  return removed;
}

/** Add (or refresh) the Atlas hooks. Returns the new settings object. */
export function install(existing, options) {
  const next = structuredClone(existing);
  strip(next);
  next.hooks ??= {};
  for (const [event, groups] of Object.entries(buildSettings(options).hooks)) next.hooks[event] = [...(next.hooks[event] ?? []), ...groups];
  return next;
}

export function describe(settings) {
  const cmd = Object.values(settings.hooks ?? {}).flat().flatMap((g) => g?.hooks ?? []).find(isAtlas)?.command;
  if (!cmd) return { installed: false };
  const env = (name) => cmd.match(new RegExp(`${name}='((?:[^']|'\\\\'')*)'`))?.[1]?.replaceAll(`'\\''`, "'");
  return {
    installed: true,
    events: Object.entries(settings.hooks).filter(([, g]) => g.some((x) => x.hooks?.some(isAtlas))).map(([e]) => e).sort(),
    outDir: env("ATLAS_OUT_DIR"),
    retentionDays: env("ATLAS_RETENTION_DAYS") ?? "7 (default)",
    customChecks: env("ATLAS_GATE_PATTERNS") ? JSON.parse(env("ATLAS_GATE_PATTERNS")).length : 0,
  };
}

// Keep the file's own formatting so removing Atlas gives back the same bytes.
const styleOf = (text) => ({
  indent: text.includes("\n") ? (text.match(/^[ \t]+(?=")/m)?.[0] ?? 2) : 0,
  eol: text.endsWith("\n") ? "\n" : "",
});
const DEFAULT_STYLE = { indent: 2, eol: "\n" };

const read = (file) => {
  if (!existsSync(file)) return { settings: {}, existed: false, style: DEFAULT_STYLE };
  try {
    const text = readFileSync(file, "utf8");
    const settings = JSON.parse(text);
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) throw new Error("not an object");
    return { settings, existed: true, style: styleOf(text) };
  } catch (e) {
    throw new Error(`${file} is not valid JSON settings (${e.message}); nothing was changed. Fix or remove it first.`);
  }
};

function write(file, settings, style = DEFAULT_STYLE) {
  const dir = path.dirname(file);
  if (!Object.keys(settings).length) {
    rmSync(file, { force: true }); // we created it, or emptied it: leave nothing behind
    return "removed";
  }
  mkdirSync(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(settings, null, style.indent)}${style.eol}`);
  renameSync(tmp, file);
  return "written";
}

function gitIgnored(project, rel) {
  try {
    execFileSync("git", ["-C", project, "check-ignore", "-q", rel], { stdio: "ignore" });
    return true;
  } catch (e) {
    return e.status === 1 ? false : null; // 1: not ignored; anything else: not a repository / no git
  }
}

export function run(argv, log = console.log) {
  const cmd = argv[0];
  const arg = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  const all = (name) => argv.flatMap((a, i) => (a === name ? [argv[i + 1]] : []));
  const project = arg("--project");
  if (!["install", "uninstall", "status"].includes(cmd) || !project) {
    log('usage: atlas-install.mjs <install|uninstall|status> --project <dir> [--out-dir <dir>] [--retention-days <n>] [--gate "<regex>=<label>"]... [--dry-run]');
    return 2;
  }
  const root = path.resolve(project);
  if (!existsSync(root)) {
    log(`no such directory: ${root}`);
    return 2;
  }
  const rel = path.join(".claude", "settings.local.json");
  const file = path.join(root, rel);
  const dry = argv.includes("--dry-run");
  const { settings, existed, style } = read(file);

  if (cmd === "status") {
    const d = describe(settings);
    log(d.installed ? `installed in ${file}\n  events: ${d.events.join(", ")}\n  sessions written to: ${d.outDir}/sessions\n  retention: ${d.retentionDays} days\n  custom check patterns: ${d.customChecks}` : `not installed (${file})`);
    return 0;
  }
  if (cmd === "install") {
    const gates = all("--gate").map((g) => {
      const i = g.lastIndexOf("=");
      if (i < 1) throw new Error(`--gate needs "<regex>=<label>", got "${g}"`);
      return { match: g.slice(0, i), label: g.slice(i + 1) };
    });
    const days = arg("--retention-days");
    if (days !== undefined && !(Number(days) >= 1)) throw new Error("--retention-days must be a number of days, 1 or more");
    const next = install(settings, { outDir: arg("--out-dir"), retentionDays: days, gates });
    if (dry) {
      log(`would write ${file}:\n${JSON.stringify(next, null, 2)}`);
      return 0;
    }
    write(file, next, style);
    const d = describe(next);
    log(`Atlas hooks ${existed && describe(settings).installed ? "refreshed" : "installed"} in ${file}\n  sessions will appear in ${d.outDir}/sessions\n  turn off with: node ${path.relative(process.cwd(), process.argv[1]) || process.argv[1]} uninstall --project ${project}`);
    if (gitIgnored(root, rel) === false) log(`  note: ${rel} is not ignored by git. Add it to .git/info/exclude (or your global ignore) so it is not committed.`);
    return 0;
  }
  const next = structuredClone(settings);
  const removed = strip(next);
  if (!removed) {
    log(`nothing to remove: no Atlas hooks in ${file}`);
    return 0;
  }
  if (dry) {
    log(`would remove ${removed} Atlas hook entries from ${file}`);
    return 0;
  }
  const result = write(file, next, style);
  log(`removed ${removed} Atlas hook entries from ${file}${result === "removed" ? " (the file is gone: it only held Atlas)" : ""}\n  recordings already written stay where they are; remove them with: node ${path.relative(process.cwd(), path.join(path.dirname(process.argv[1]), "atlas-hook.mjs")) || "atlas-hook.mjs"} purge --all`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    process.exitCode = run(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
