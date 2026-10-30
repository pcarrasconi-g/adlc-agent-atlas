// Four deterministic signals, each tied to evidence and to a node, with a
// confidence and a concrete next question. No model is involved and nothing is
// concluded that the evidence does not say: baseline is compared only against a
// comparable earlier measurement, never guessed from how many errors there are.
import type { Evidence, GateRun, GuardBlock } from "./evidence.ts";
import { ageLabel, type Provenance } from "./provenance.ts";

export type Confidence = "high" | "medium" | "low";
export type Side = { label: string; where: string; result: string };
export type SignalKind = "baseline" | "context" | "repeated" | "stale";
export type Signal = {
  id: string;
  kind: SignalKind;
  title: string;
  fact: string;
  confidence: Confidence;
  provenance: Provenance;
  impact: string;
  question: string;
  suggestion: string;
  evidence: { label: string; sequence: number | null }[];
  anchor: { agentId: string | null; sequence: number | null };
  rank: number;
  compare?: { baseline: Side; current: Side };
};
export type AgentView = {
  id: string;
  name: string;
  status: string;
  uncertain: boolean; // no recent signal
  lastSignalMs: number | null;
  lastSummary?: string | null;
  worktree?: string | null;
};
export type SignalInput = { evidence: Evidence; agents: AgentView[]; nowMs: number; live: boolean; limit?: number };

const nameOf = (agents: AgentView[], id: string | null) => agents.find((a) => a.id === id)?.name ?? "an agent";
const short = (rev?: string) => (rev ? rev.slice(0, 7) : "unknown revision");
const failed = (g: GateRun) => typeof g.exit === "number" && g.exit !== 0;
const where = (g: GateRun) => (g.worktree ? `worktree ${g.worktree}` : "project root");
const result = (g: GateRun) => (g.exit === 0 ? "passed" : g.exit === null ? "unknown result" : `exit ${g.exit}${g.findings !== undefined ? ` · ${g.findings} findings` : ""}`);
const SUGGEST = "In Claude Code, check whether this failure is baseline and whether the verification ran in the worktree you expect; do not disable a gate without deciding it.";

/** A comparable earlier measurement: same recipe and repository, clean tree, same revision. */
export function comparableBaseline(gates: GateRun[], run: { recipe: string; rev?: string; repo?: string; sequence: number }): GateRun | undefined {
  return gates.find((b) => b.recipe === run.recipe && b.sequence < run.sequence && b.dirty === false && !!b.rev && b.rev === run.rev && !!b.repo && b.repo === run.repo && b.exit !== null);
}

export function computeSignals({ evidence, agents, nowMs, live, limit = 3 }: SignalInput): Signal[] {
  const out: Signal[] = [];
  const { gates, guards } = evidence;

  // 1. Repeated failure of the same check, grouped by recipe, exit code and failure shape.
  const groups = new Map<string, { runs: GateRun[]; guards: GuardBlock[]; recipe: string }>();
  for (const g of gates.filter(failed)) {
    const key = `${g.recipe}|${g.exit}|${g.fingerprint ?? "-"}`;
    groups.set(key, groups.get(key) ?? { runs: [], guards: [], recipe: g.recipe });
    groups.get(key)!.runs.push(g);
  }
  for (const [key, grp] of groups) {
    const guardHits = guards.filter((b) => b.recipes.some((r) => `just ${r}` === grp.recipe));
    const total = grp.runs.length + guardHits.length;
    if (total < 2) continue;
    const last = [...grp.runs].sort((a, b) => b.sequence - a.sequence)[0];
    const shape = last.fingerprint ? "with the same failure" : "with the same exit code";
    const ctx = [...new Set([...grp.runs.map(where), ...guardHits.map(() => "project root (ADLC guard)")])].join(", ");
    out.push({
      id: `repeated:${key}`,
      kind: "repeated",
      title: `${grp.recipe} failed ${total} times ${shape}`,
      fact: `${grp.recipe} ended with exit ${last.exit} ${total} times, ${shape}${last.findings !== undefined ? ` (${last.findings} findings each time it was counted)` : ""}. Contexts: ${ctx}.`,
      confidence: last.fingerprint ? "medium" : "low",
      provenance: "inferred",
      impact: "Repeating the same check in the same state will keep failing; the repetition itself does not say why.",
      question: "Did anything change between the attempts, or is the check failing on something unrelated to this task?",
      suggestion: SUGGEST,
      evidence: [...grp.runs.map((g) => ({ label: `${g.recipe} exit ${g.exit} in ${where(g)}`, sequence: g.sequence })), ...guardHits.map((b) => ({ label: `ADLC guard blocked on ${b.recipes.join(", ")}`, sequence: b.sequence }))],
      anchor: { agentId: last.agentId, sequence: last.sequence },
      rank: 70,
    });
  }

  // 2. Verification in a context other than the one the agent works in.
  for (const g of gates) {
    const expected = g.agentId ? evidence.worktreeOf.get(g.agentId) : undefined;
    if (!expected || g.worktree === expected) continue;
    out.push({
      id: `context:gate:${g.sequence}`,
      kind: "context",
      title: `${g.recipe} ran outside ${nameOf(agents, g.agentId)}'s worktree`,
      fact: `${nameOf(agents, g.agentId)} works in worktree ${expected}, but ${g.recipe} ran in ${g.worktree ? `worktree ${g.worktree}` : "the project root"}. Its result describes that tree, not the agent's changes.`,
      confidence: "high",
      provenance: "observed",
      impact: "A pass or a failure here may not say anything about the agent's work.",
      question: "Was it intended to run this check outside the agent's worktree?",
      suggestion: SUGGEST,
      evidence: [{ label: `${g.recipe} in ${where(g)}`, sequence: g.sequence }],
      anchor: { agentId: g.agentId, sequence: g.sequence },
      rank: 80,
    });
  }
  for (const b of guards) {
    const working = agents.filter((a) => evidence.worktreeOf.has(a.id) && a.id !== b.agentId);
    const target = working.find((a) => evidence.treeOf.get(a.id)?.dirty === true) ?? working[0];
    if (!target || !b.rootRev) continue;
    const tree = evidence.treeOf.get(target.id);
    const lacks = tree?.dirty === true || (tree?.rev && tree.rev !== b.rootRev);
    out.push({
      id: `context:guard:${b.sequence}`,
      kind: "context",
      title: "The ADLC guard checked the project root, not the agent's worktree",
      fact: `The guard blocked completion on ${b.recipes.map((r) => `just ${r}`).join(", ")} after running in the project root (${b.rootDirty === false ? "clean" : b.rootDirty ? "with changes" : "state unknown"} at ${short(b.rootRev)}). ${target.name} works in worktree ${evidence.worktreeOf.get(target.id)}${lacks ? `, whose ${tree?.dirty ? "uncommitted changes are" : "revision is"} not in the tree the guard checked` : ""}. ADLC documents this limitation of the guard.`,
      confidence: "medium",
      provenance: "inferred",
      impact: "The guard's verdict may describe the base tree rather than the work it is blocking.",
      question: "Does this failure come from the agent's change, or was it already failing in the base tree?",
      suggestion: SUGGEST,
      evidence: [{ label: `ADLC guard blocked (${b.recipes.join(", ")})`, sequence: b.sequence }, ...(tree ? [{ label: `${target.name} last checked tree: ${short(tree.rev)}${tree.dirty ? " with changes" : ""}`, sequence: null }] : [])],
      anchor: { agentId: target.id, sequence: b.sequence },
      rank: 80,
    });
  }

  // 3. Baseline against regression, only with a comparable measurement.
  const lastFailByRecipe = new Map<string, GateRun>();
  for (const g of gates.filter((x) => failed(x) && x.worktree)) lastFailByRecipe.set(g.recipe, g); // prefer the agent's own run
  for (const g of gates.filter(failed)) if (!lastFailByRecipe.has(g.recipe)) lastFailByRecipe.set(g.recipe, g);
  for (const [recipe, cur] of lastFailByRecipe) {
    const base = comparableBaseline(gates, cur);
    const side = (g: GateRun): Side => ({ label: g.worktree ? "In the agent's worktree" : "Project root", where: `${where(g)} · ${g.dirty ? "with changes" : "clean"} @ ${short(g.rev)}`, result: result(g) });
    const who = nameOf(agents, cur.agentId);
    const common = { kind: "baseline" as const, provenance: "inferred" as Provenance, suggestion: SUGGEST, anchor: { agentId: cur.agentId, sequence: cur.sequence } };
    if (!base) {
      out.push({ ...common, id: `baseline:${recipe}`, title: `${recipe}: origin of the failure not determined`, fact: `${recipe} fails (exit ${cur.exit}) but there is no comparable earlier measurement: it needs the same recipe and repository, on a clean tree, at the same revision (${short(cur.rev)}).`, confidence: "low", impact: "Atlas cannot tell a failure that was already there from one this change caused.", question: `Does ${recipe} fail on a clean checkout of the base revision?`, evidence: [{ label: `${recipe} exit ${cur.exit} in ${where(cur)}`, sequence: cur.sequence }], rank: 60 });
      continue;
    }
    const compare = { baseline: side(base), current: side(cur) };
    const ev = [{ label: `baseline: ${recipe} ${result(base)} in ${where(base)}`, sequence: base.sequence }, { label: `${who}: ${recipe} ${result(cur)} in ${where(cur)}`, sequence: cur.sequence }];
    let title: string, fact: string, confidence: Confidence = "medium", rank = 60, question: string, impact: string;
    if (base.exit === 0) {
      title = `${recipe} passed at baseline and fails now`;
      fact = `${recipe} passed on the clean tree at ${short(base.rev)} and now fails (exit ${cur.exit}) with the changes.`;
      impact = "The change is a candidate cause; the check passed before it.";
      question = "Which part of the change affects what this check looks at?";
      rank = 90;
    } else if (base.findings !== undefined && cur.findings !== undefined && cur.findings > base.findings) {
      title = `${recipe}: more findings than at baseline (${base.findings} → ${cur.findings})`;
      fact = `${recipe} already failed at baseline with ${base.findings} findings and now reports ${cur.findings}.`;
      impact = "The change appears to add findings on top of the existing failure.";
      question = "Which of the new findings come from this change?";
      rank = 90;
    } else if (base.findings !== undefined && cur.findings !== undefined && cur.findings < base.findings) {
      title = `${recipe}: fewer findings than at baseline (${base.findings} → ${cur.findings})`;
      fact = `${recipe} failed at baseline with ${base.findings} findings and now reports ${cur.findings}; it still fails.`;
      impact = "Some of the existing failures were fixed, not all.";
      question = "Is the remaining failure in scope for this task?";
    } else if (base.fingerprint && cur.fingerprint && base.fingerprint === cur.fingerprint && base.findings === cur.findings) {
      title = `${recipe} fails the same way as at baseline`;
      fact = `${recipe} failed at baseline (${result(base)}) and fails the same way now (${result(cur)}), so the failure was already there before this change.`;
      impact = "The failure is probably not caused by this change; it still blocks anything that requires the check to pass.";
      question = "Should this task wait for the baseline to be fixed, or should the gate be scoped to what this task touched?";
    } else {
      title = `${recipe} failed at baseline and fails now, differently`;
      fact = `${recipe} failed at baseline (${result(base)}) and fails now (${result(cur)}), but not in a way Atlas can compare, so it does not say whether it got worse.`;
      confidence = "low";
      impact = "Unclear whether the change made things worse.";
      question = "Do the two failures list the same findings?";
    }
    out.push({ ...common, id: `baseline:${recipe}`, title, fact, confidence, impact, question, evidence: ev, rank, compare });
  }

  // 4. Long work without a fresh signal (low confidence by nature).
  if (live) {
    for (const a of agents) {
      if (!a.uncertain || ["done", "failed", "blocked", "completed", "cancelled"].includes(a.status)) continue;
      const age = a.lastSignalMs === null ? null : nowMs - a.lastSignalMs;
      out.push({
        id: `stale:${a.id}`,
        kind: "stale",
        title: `${a.name}: no recent signal${age === null ? "" : ` for ${ageLabel(age)}`}`,
        fact: `${a.name} has sent no signal${age === null ? "" : ` for ${ageLabel(age)}`}${a.lastSummary ? `; the last evidence was “${a.lastSummary}”` : ""}.`,
        confidence: "low",
        provenance: "inferred",
        impact: "It may be waiting, thinking for a long time, or stuck. Atlas cannot tell, and does not claim a loop or a block.",
        question: `Is ${a.name} still running in Claude Code?`,
        suggestion: `In Claude Code, check whether ${a.name} is still running and what it is waiting for.`,
        evidence: [{ label: a.lastSummary ?? "last signal", sequence: null }],
        anchor: { agentId: a.id, sequence: null },
        rank: 30,
      });
    }
    for (const o of evidence.open) {
      const age = o.at === null ? null : nowMs - o.at;
      if (age !== null && age > 120_000)
        out.push({ id: `stale:gate:${o.sequence}`, kind: "stale", title: `${o.recipe} started ${ageLabel(age)} ago with no result`, fact: `${nameOf(agents, o.agentId)} started ${o.recipe} ${ageLabel(age)} ago and no result has been recorded.`, confidence: "low", provenance: "inferred", impact: "The check may still be running.", question: "Is the check still running?", suggestion: "In Claude Code, check whether the command is still running.", evidence: [{ label: `${o.recipe} started`, sequence: o.sequence }], anchor: { agentId: o.agentId, sequence: o.sequence }, rank: 30 });
    }
  }

  // One card per kind and subject; strongest first; at most `limit`.
  const seen = new Set<string>();
  return out
    .sort((a, b) => b.rank - a.rank || (b.anchor.sequence ?? 0) - (a.anchor.sequence ?? 0))
    .filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)))
    .slice(0, limit);
}
