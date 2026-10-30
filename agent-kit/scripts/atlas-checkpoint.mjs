#!/usr/bin/env node
// Publishes a decision to ADLC Agent Atlas. It has no side effects of its own:
// when the Atlas hook is on, it reads this command line and records the phase,
// decision and reason you chose to publish (redacted, 120 characters each).
//
//   node agent-kit/scripts/atlas-checkpoint.mjs --phase execute \
//     --decision "Limit the stop guard to typecheck" --reason "lint failures are baseline"
const args = process.argv.slice(2);
const get = (name) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const decision = get("decision");
if (!decision) {
  console.error("usage: atlas-checkpoint.mjs [--phase <phase>] --decision <text> [--reason <text>]");
  process.exit(2);
}
console.log(`checkpoint noted: ${get("phase") ? `(${get("phase")}) ` : ""}${decision}`);
