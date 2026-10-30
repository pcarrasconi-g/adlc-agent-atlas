#!/usr/bin/env node
// Turns a session recorded by the Atlas adapter into a shareable one: readable
// aliases instead of real IDs, no path hashes, and a hard stop if anything that
// looks personal remains.
//
//   node agent-kit/scripts/atlas-freeze-demo.mjs <recorded-session.json> <out.json> [--title "..."]
import { readFileSync, writeFileSync } from "node:fs";

const [input, output] = process.argv.slice(2);
const title = process.argv.includes("--title") ? process.argv[process.argv.indexOf("--title") + 1] : "Recorded demo";
if (!input || !output) {
  console.error('usage: atlas-freeze-demo.mjs <recorded-session.json> <out.json> [--title "..."]');
  process.exit(2);
}
const session = JSON.parse(readFileSync(input, "utf8"));
let text = JSON.stringify(session, null, 2);

const principal = session.principal.agentId;
const agents = [...new Set(session.transcript.map((e) => e.agentId))].filter((id) => id !== principal);
const alias = new Map([[principal, "demo-session"], ...agents.map((id, i) => [id, `a${i + 1}`])]);
for (const [real, name] of alias) text = text.replaceAll(real, name);
text = text.replace(/#[0-9a-f]{6}\b/g, ""); // hashes of real paths
const out = JSON.parse(text);
out.sessionId = "atlas-demo";
out.goal = title;
out.principal.task = "Claude Code session (ADLC execution)";
delete out.recordedAt;
out.recordedAt = session.recordedAt;

const final = JSON.stringify(out, null, 2);
const leak = final.match(/\/home\/|\/tmp\/|\/Users\/|osbulb|sovos|@[a-z0-9-]+\.(com|net|org)|sk-[A-Za-z0-9]{8,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
if (leak) {
  console.error(`refusing to write: found "${leak[0]}" in the output`);
  process.exit(1);
}
writeFileSync(output, `${final}\n`);
console.log(`${out.transcript.length} entries, ${alias.size} ids aliased -> ${output}`);
