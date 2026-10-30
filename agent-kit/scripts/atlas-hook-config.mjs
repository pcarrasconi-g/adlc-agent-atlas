#!/usr/bin/env node
// Prints (or writes) a Claude Code settings file that turns the Atlas hook on.
// Opt in per session without touching a repository or the ADLC plugin:
//
//   node agent-kit/scripts/atlas-hook-config.mjs --write /tmp/atlas-settings.json
//   claude --settings /tmp/atlas-settings.json
//
// Hooks from --settings are added to the ones the project and plugins define;
// they do not replace ADLC's guards. Stop using it by launching without the flag.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const quote = (s) => `'${s.replaceAll("'", `'\\''`)}'`;
export const HOOK_FILE = "atlas-hook.mjs";

/** Settings that turn the Atlas hook on. Options end up as environment variables of the hook command. */
export function buildSettings({ outDir = path.join(here, "..", "output"), retentionDays, gates } = {}) {
  const env = [`ATLAS_OUT_DIR=${quote(path.resolve(outDir))}`];
  if (retentionDays) env.push(`ATLAS_RETENTION_DAYS=${quote(String(retentionDays))}`);
  if (gates?.length) env.push(`ATLAS_GATE_PATTERNS=${quote(JSON.stringify(gates))}`);
  const hook = { type: "command", command: `${env.join(" ")} node ${quote(path.join(here, HOOK_FILE))}`, timeout: 5 };
  return {
    hooks: {
      SessionStart: [{ hooks: [hook] }],
      SessionEnd: [{ hooks: [hook] }],
      SubagentStart: [{ hooks: [hook] }],
      SubagentStop: [{ hooks: [hook] }],
      Stop: [{ hooks: [hook] }],
      TaskCreated: [{ hooks: [hook] }],
      TaskCompleted: [{ hooks: [hook] }],
      TeammateIdle: [{ hooks: [hook] }],
      PreToolUse: [{ matcher: "Agent|Bash", hooks: [hook] }],
      PostToolUse: [{ hooks: [hook] }],
      PostToolUseFailure: [{ hooks: [hook] }],
    },
  };
}
export const settings = buildSettings({ outDir: path.resolve(arg("--out-dir") || path.join(here, "..", "output")) });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const json = `${JSON.stringify(settings, null, 2)}\n`;
  const outDir = path.resolve(arg("--out-dir") || path.join(here, "..", "output"));
  const file = arg("--write");
  if (file) {
    writeFileSync(file, json);
    console.error(`wrote ${file}\nobservatory sessions will appear under ${path.join(outDir, "sessions")}`);
  } else process.stdout.write(json);
}
