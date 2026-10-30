import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { demoRoute, isDemoId, type Demo } from "./demo.ts";
import { extractEvidence } from "./evidence.ts";
import { computeSignals } from "./signals.ts";
import { describeDecisions } from "./decisions.ts";

const demo: Demo = JSON.parse(
  readFileSync(new URL("../../public/demo/demo.json", import.meta.url), "utf8"),
);
const id = encodeURIComponent(demo.session.id);

test("the frozen demo answers the API routes the page uses, without a server", () => {
  assert.equal(isDemoId(demo.session.id), true);
  assert.equal((demoRoute(demo, `/api/sessions/${id}`) as any).isDemo, true);
  const page1 = demoRoute(demo, `/api/sessions/${id}/events?limit=10`) as any[];
  assert.equal(page1.length, 10);
  const rest = demoRoute(
    demo,
    `/api/sessions/${id}/events?limit=500&afterSequence=${page1.at(-1).sequence}`,
  ) as any[];
  assert.equal(page1.length + rest.length, demo.events.length);
  assert.equal(
    demoRoute(demo, "/api/sessions/some-real-session/events"),
    undefined,
    "real sessions are left to the API",
  );
  assert.equal(demoRoute(demo, "/api/projects"), undefined);
});

test("the projection at any step is built from the same code as the server", () => {
  const end = demoRoute(demo, `/api/sessions/${id}/projection`) as any;
  assert.equal(end.result, "done");
  assert.equal(end.nodes.length, 2);
  const early = demoRoute(
    demo,
    `/api/sessions/${id}/projection?atSequence=3`,
  ) as any;
  assert.equal(early.nodes.length, 1, "the map grows as the run goes");
  const graph = demoRoute(demo, `/api/sessions/${id}/graph`) as any;
  assert.deepEqual(
    graph.links.map((l: any) => l.provenance).sort(),
    ["inferred", "observed"],
    "a guess first, then confirmed",
  );
});

test("the demo tells the story the plan asks for, and nothing more than the evidence", () => {
  const events = demo.events;
  const at = (type: string) => events.findIndex((e) => e.type === type);
  const evidence = extractEvidence(events);
  const agents = (
    demoRoute(demo, `/api/sessions/${id}/graph`) as any
  ).nodes.map((n: any) => ({
    id: String(n.id),
    name: n.displayName ?? n.name,
    status: "done",
    uncertain: false,
    lastSignalMs: null,
  }));
  const signals = computeSignals({
    evidence,
    agents,
    nowMs: Date.now(),
    live: false,
  });
  assert.deepEqual(signals.map((s) => s.kind).sort(), [
    "baseline",
    "context",
    "repeated",
  ]);
  const baseline = signals.find((s) => s.kind === "baseline")!;
  assert.match(baseline.title, /fails the same way as at baseline/);
  assert.equal(baseline.confidence, "medium");
  for (const s of signals)
    assert.ok(
      !/\bbug\b|caused by (adlc|the agent)/i.test(s.title + s.fact),
      s.id,
    );
  // before the decision the guard blocks; after it, no block is observed
  const [d] = describeDecisions(evidence);
  assert.match(
    d.before.join(" "),
    /1 completion blocked by the ADLC guard \(just lint\)/,
  );
  assert.match(d.after.join(" "), /no completion blocked by the guard/);
  assert.ok(
    at("guard.blocked") < at("checkpoint"),
    "the decision comes after the block",
  );
  assert.ok(
    events
      .filter((e) => e.type === "gate.finished")
      .every((e) => e.status === "working"),
    "no check marks an agent as failed",
  );
});

test("nothing personal is in the frozen demo", () => {
  const text = readFileSync(
    new URL("../../public/demo/demo.json", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    text,
    /\/home\/|\/tmp\/|osbulb|sovos|@[a-z0-9-]+\.(com|net)|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i,
  );
});
