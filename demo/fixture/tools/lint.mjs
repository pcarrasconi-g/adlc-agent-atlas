// Tiny stand-in for a linter: flags `var` and `console.log` in src/**/*.ts.
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

const rules = [
  [/\bvar\s+\w+/, "no-var"],
  [/\bconsole\.log\(/, "no-console"],
];
let problems = 0;
for (const file of files.sort()) {
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    for (const [re, rule] of rules) {
      if (re.test(line)) {
        console.log(`${path.relative(root, file)}:${i + 1}  error  ${rule}`);
        problems++;
      }
    }
  });
}
if (problems) {
  console.log(`\n✖ ${problems} problems (${problems} errors, 0 warnings)`);
  process.exit(1);
}
console.log("lint ok");
