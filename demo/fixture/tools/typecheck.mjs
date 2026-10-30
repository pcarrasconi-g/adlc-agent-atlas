// Tiny stand-in for a type checker: every exported function needs typed
// parameters and an explicit return type.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = new URL("../src/", import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".ts")) files.push(p);
  }
})(root);

let errors = 0;
for (const file of files.sort()) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    const m = line.match(/^export function \w+\(([^)]*)\)\s*(:\s*\S+)?/);
    if (!m) return;
    const untyped = m[1].split(",").some((p) => p.trim() && !p.includes(":"));
    if (untyped || !m[2]) {
      console.log(`${path.relative(root, file)}:${i + 1}  TS7006  missing type annotation`);
      errors++;
    }
  });
}
if (errors) {
  console.log(`\nFound ${errors} errors.`);
  process.exit(1);
}
console.log("typecheck ok");
