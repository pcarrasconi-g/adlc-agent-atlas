// A published decision, and what the recording shows before and after it.
import type { Decision, Evidence } from "./evidence.ts";

export type DecisionView = { decision: Decision; before: string[]; after: string[] };

export function describeDecisions(evidence: Evidence): DecisionView[] {
  return evidence.decisions.map((d) => {
    const side = (inRange: (s: number) => boolean) => {
      const out: string[] = [];
      const blocks = evidence.guards.filter((b) => inRange(b.sequence));
      out.push(blocks.length ? `${blocks.length} completion${blocks.length > 1 ? "s" : ""} blocked by the ADLC guard (${[...new Set(blocks.flatMap((b) => b.recipes.map((r) => `just ${r}`)))].join(", ")})` : "no completion blocked by the guard");
      const runs = evidence.gates.filter((g) => inRange(g.sequence) && g.exit !== null);
      const bad = runs.filter((g) => g.exit !== 0).length;
      out.push(runs.length ? `${runs.length} check${runs.length > 1 ? "s" : ""} observed, ${bad} failed` : "no checks observed");
      return out;
    };
    const completions = (inRange: (s: number) => boolean) => evidence.completions.filter((c) => inRange(c.sequence)).length;
    const before = side((s) => s < d.sequence);
    const after = side((s) => s > d.sequence);
    const asked = completions((s) => s > d.sequence);
    if (asked) after.push(`${asked} completion request${asked > 1 ? "s" : ""} since; the absence of a block is not proof that it was accepted`);
    return { decision: d, before, after };
  });
}
