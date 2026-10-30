import test from "node:test";
import assert from "node:assert/strict";
import { extractEvidence, type RawEvent } from "./evidence.ts";
import { computeSignals, comparableBaseline, type AgentView } from "./signals.ts";
import { describeDecisions } from "./decisions.ts";

const T0 = Date.UTC(2026, 9, 30, 12, 0, 0);
const iso = (s: number) => new Date(T0 + s * 1000).toISOString();
const gate = (sequence: number, agentId: string, p: Record<string, unknown>): RawEvent => ({ sequence, agentId, type: "gate.finished", timestamp: iso(sequence), payload: { parsed: { recipe: "just lint", exit: 1, findings: 5, fingerprint: "ff01", rev: "5e1367e82938", repo: "r1", dirty: false, ...p } } });
const at = (sequence: number, agentId: string, type: string, parsed: Record<string, unknown>): RawEvent => ({ sequence, agentId, type, timestamp: iso(sequence), payload: { parsed } });

// The recorded story: baseline in the root, the agent's own run in its worktree, the ADLC guard, a decision.
const story: RawEvent[] = [
  gate(1, "p", {}),
  at(6, "a1", "agent.registered", { worktree: "agent-a1" }),
  gate(9, "a1", { recipe: "just typecheck", exit: 0, findings: undefined, fingerprint: undefined, dirty: true, worktree: "agent-a1" }),
  gate(11, "a1", { dirty: true, worktree: "agent-a1" }),
  at(16, "p", "guard.blocked", { recipes: ["lint"], findings: { lint: 5 }, mode: "taskcompleted", rootRev: "5e1367e82938", rootDirty: false, rootRepo: "r1" }),
  at(18, "p", "checkpoint", { phase: "execute", decision: "Limit the guard to typecheck", reason: "lint is baseline" }),
  at(19, "p", "task.completed", {}),
];
const agents: AgentView[] = [
  { id: "p", name: "Claude Code (principal)", status: "done", uncertain: false, lastSignalMs: null },
  { id: "a1", name: "frontend-engineer", status: "done", uncertain: false, lastSignalMs: null },
];
const run = (events: RawEvent[], extra: Partial<Parameters<typeof computeSignals>[0]> = {}) => computeSignals({ evidence: extractEvidence(events), agents, nowMs: T0 + 3600_000, live: false, ...extra });

test("the recorded story yields exactly the three signals a person needs, strongest first", () => {
  const s = run(story);
  assert.deepEqual(s.map((x) => x.kind), ["context", "repeated", "baseline"]);
  assert.equal(s.length, 3);
});

test("baseline: the same failure before and after is reported as pre-existing, with both sides shown", () => {
  const b = run(story).find((x) => x.kind === "baseline")!;
  assert.match(b.title, /fails the same way as at baseline/);
  assert.equal(b.confidence, "medium");
  assert.equal(b.provenance, "inferred");
  assert.match(b.compare!.baseline.where, /project root · clean @ 5e1367e/);
  assert.match(b.compare!.current.where, /worktree agent-a1 · with changes/);
  assert.equal(b.compare!.baseline.result, "exit 1 · 5 findings");
  assert.match(b.question, /baseline to be fixed|scoped/);
  assert.equal(b.anchor.agentId, "a1");
});

test("a check that passed at baseline and fails now is a regression candidate, ranked first", () => {
  const s = run([gate(1, "p", { exit: 0, findings: undefined, fingerprint: undefined }), ...story.slice(1)]);
  assert.equal(s[0].kind, "baseline");
  assert.match(s[0].title, /passed at baseline and fails now/);
});

test("more findings than the baseline is called out, with the numbers", () => {
  const s = run([story[0], story[1], story[2], gate(11, "a1", { dirty: true, worktree: "agent-a1", findings: 8 })]);
  assert.match(s.find((x) => x.kind === "baseline")!.title, /more findings than at baseline \(5 → 8\)/);
});

test("without a comparable baseline the origin is undetermined; nothing is called pre-existing", () => {
  for (const spoil of [{ dirty: true }, { rev: "other" }, { repo: "r2" }]) {
    const events = [gate(1, "p", spoil), story[1], gate(11, "a1", { dirty: true, worktree: "agent-a1" })];
    const b = run(events).find((x) => x.kind === "baseline")!;
    assert.match(b.title, /origin of the failure not determined/, JSON.stringify(spoil));
    assert.equal(b.confidence, "low");
    assert.equal(b.compare, undefined);
  }
  assert.equal(comparableBaseline([], { recipe: "x", sequence: 1 }), undefined);
});

test("two failures that cannot be compared never claim to be the same or worse", () => {
  const events = [gate(1, "p", { findings: undefined, fingerprint: "aaaa" }), story[1], gate(11, "a1", { dirty: true, worktree: "agent-a1", findings: undefined, fingerprint: "bbbb" })];
  const b = run(events).find((x) => x.kind === "baseline")!;
  assert.match(b.title, /fails now, differently/);
  assert.equal(b.confidence, "low");
});

test("a result Atlas cannot read (chained command, interruption) raises no failure signal", () => {
  const events = [gate(1, "p", { exit: null, complex: true }), gate(2, "p", { exit: null, interrupted: true })];
  assert.deepEqual(run(events), []);
});

test("the same failure repeated is grouped, counted and anchored to the latest run", () => {
  const events = [1, 2, 3].map((i) => gate(i, "a1", { dirty: true, worktree: "agent-a1" }));
  const r = run([at(0, "a1", "agent.registered", { worktree: "agent-a1" }), ...events]).find((x) => x.kind === "repeated")!;
  assert.match(r.title, /just lint failed 3 times with the same failure/);
  assert.equal(r.anchor.sequence, 3);
  assert.equal(r.evidence.length, 3);
  assert.equal(r.confidence, "medium");
  const noShape = run([1, 2].map((i) => gate(i, "p", { fingerprint: undefined }))).find((x) => x.kind === "repeated")!;
  assert.equal(noShape.confidence, "low", "same exit code alone is weaker evidence");
});

test("a check run outside the agent's own worktree is flagged as a fact", () => {
  const events = [at(6, "a1", "agent.registered", { worktree: "agent-a1" }), gate(7, "a1", { exit: 0, findings: undefined, worktree: "agent-other" })];
  const c = run(events).find((x) => x.kind === "context")!;
  assert.equal(c.confidence, "high");
  assert.equal(c.provenance, "observed");
  assert.match(c.fact, /works in worktree agent-a1.*worktree agent-other/);
});

test("the guard signal says what is known about the trees and does not call it a bug", () => {
  const c = run(story).find((x) => x.id.startsWith("context:guard"))!;
  assert.match(c.fact, /project root \(clean at 5e1367e\)/);
  assert.match(c.fact, /uncommitted changes are not in the tree the guard checked/);
  assert.match(c.fact, /ADLC documents this limitation/);
  assert.doesNotMatch(c.title + c.fact, /\bbug\b/i);
  assert.equal(c.confidence, "medium");
});

test("silence is a low-confidence signal, only while live, and never for finished agents", () => {
  const a: AgentView[] = [{ id: "a1", name: "qa-engineer", status: "working", uncertain: true, lastSignalMs: T0, lastSummary: "Tool Read finished" }, { id: "p", name: "p", status: "done", uncertain: true, lastSignalMs: T0 }];
  const ev = extractEvidence([]);
  assert.deepEqual(computeSignals({ evidence: ev, agents: a, nowMs: T0 + 300_000, live: false }), []);
  const s = computeSignals({ evidence: ev, agents: a, nowMs: T0 + 300_000, live: true });
  assert.equal(s.length, 1);
  assert.equal(s[0].confidence, "low");
  assert.match(s[0].fact, /5m 0s/);
  assert.match(s[0].impact, /does not claim a loop or a block/);
});

test("a check started long ago with no result is reported as such, once", () => {
  const ev = extractEvidence([at(1, "a1", "gate.started", { recipe: "just test" })]);
  const s = computeSignals({ evidence: ev, agents, nowMs: T0 + 400_000, live: true });
  assert.match(s[0].title, /just test started 6m 39s ago with no result/);
  const done = extractEvidence([at(1, "a1", "gate.started", { recipe: "just test" }), gate(2, "a1", { recipe: "just test", exit: 0 })]);
  assert.deepEqual(computeSignals({ evidence: done, agents, nowMs: T0 + 400_000, live: true }), []);
});

test("at most three signals, whatever the run produced", () => {
  const events = [at(0, "a1", "agent.registered", { worktree: "w" }), ...[1, 2, 3, 4].map((i) => gate(i, "a1", { recipe: `just r${i}`, worktree: "other", exit: 1 }))];
  assert.equal(run(events).length, 3);
});

test("a decision shows what the recording says before and after, without claiming acceptance", () => {
  const [d] = describeDecisions(extractEvidence(story));
  assert.equal(d.decision.decision, "Limit the guard to typecheck");
  assert.match(d.before.join(" | "), /1 completion blocked by the ADLC guard \(just lint\)/);
  assert.match(d.before.join(" | "), /3 checks observed, 2 failed/);
  assert.match(d.after.join(" | "), /no completion blocked by the guard/);
  assert.match(d.after.join(" | "), /1 completion request since; the absence of a block is not proof that it was accepted/);
});
