import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStory,
  linkKey,
  type StoryEvent,
  type StoryLink,
  type StoryNode,
} from "./story.ts";

const nodes: StoryNode[] = [
  { id: "p", name: "Claude Code", isPrincipal: true },
  { id: "a1", name: "general-purpose" },
  { id: "a2", name: "general-purpose" },
];
// Mirrors the committed recording: two parallel subagents, edges first inferred then observed.
const events: StoryEvent[] = [
  {
    sequence: 0,
    agentId: "p",
    status: "registered",
    type: "session.principal",
  },
  { sequence: 1, agentId: "p", status: "working" },
  { sequence: 2, agentId: "a1", status: "working" },
  { sequence: 3, agentId: "p", status: "working" },
  { sequence: 4, agentId: "a2", status: "working" },
  { sequence: 5, agentId: "a1", status: "working" },
  { sequence: 6, agentId: "a2", status: "done" },
  { sequence: 7, agentId: "a1", status: "done" },
  { sequence: 8, agentId: "p", status: "working" },
  { sequence: 9, agentId: "p", status: "done" },
];
const links: StoryLink[] = [
  {
    source: "p",
    target: "a1",
    relation: "delegation",
    provenance: "inferred",
    sequenceStart: 2,
  },
  {
    source: "p",
    target: "a2",
    relation: "delegation",
    provenance: "inferred",
    sequenceStart: 4,
  },
  {
    source: "p",
    target: "a2",
    relation: "delegation",
    provenance: "observed",
    sequenceStart: 8,
  },
  {
    source: "p",
    target: "a1",
    relation: "delegation",
    provenance: "observed",
    sequenceStart: 9,
  },
];

test("tells a short, ordered story from real evidence", () => {
  const steps = buildStory(events, nodes, links);
  assert.deepEqual(
    steps.map((s) => s.id),
    ["delegate", "parallel", "result", "confirm:p->a1", "verification"],
  );
  assert.ok(steps.length >= 4 && steps.length <= 6);
  assert.deepEqual(
    steps.map((s) => s.sequence),
    [...steps.map((s) => s.sequence)].sort((a, b) => a - b),
  );
});

test("the first delegation step is as sure as its link, and names who delegated", () => {
  const [delegate] = buildStory(events, nodes, links);
  assert.equal(delegate.provenance, "inferred");
  assert.deepEqual(delegate.links, [linkKey("p", "a1")]);
  assert.match(delegate.body, /Claude Code delegated to general-purpose/);
});

test("parallel step appears at the first moment two agents are active", () => {
  const parallel = buildStory(events, nodes, links).find(
    (s) => s.id === "parallel",
  )!;
  assert.equal(parallel.sequence, 4);
  assert.deepEqual([...parallel.agents].sort(), ["a1", "a2"]);
});

test("a completed agent is not proof that anything passed", () => {
  const result = buildStory(events, nodes, links).find(
    (s) => s.id === "result",
  )!;
  assert.equal(result.agents[0], "a2");
  assert.match(result.body, /not that its work passed any check/);
});

test("without any recorded check the story ends with 'unknown', never success", () => {
  const last = buildStory(events, nodes, links).at(-1)!;
  assert.equal(last.id, "verification");
  assert.equal(last.provenance, "unknown");
  assert.match(last.title, /Nothing was verified/);
});

test("recorded checks turn the last step into verified evidence", () => {
  const withGate: StoryEvent[] = [
    ...events,
    {
      sequence: 10,
      agentId: "p",
      status: "working",
      type: "gate.finished",
      exit: 1,
    },
    { sequence: 11, agentId: "p", status: "working", type: "gate.started" },
  ];
  const last = buildStory(withGate, nodes, links).at(-1)!;
  assert.equal(last.provenance, "verified");
  assert.match(last.title, /1 check observed/, "only finished checks count");
  assert.match(last.body, /0 passed, 1 failed/);
  assert.match(last.body, /not why, and not whether it was already failing/);
});

test("steps that lack evidence are omitted: a sequential run has no 'parallel' step", () => {
  const sequential = events.filter((e) => e.agentId !== "a2");
  const steps = buildStory(
    sequential,
    nodes.slice(0, 2),
    links.filter((l) => l.target === "a1"),
  );
  assert.ok(!steps.some((s) => s.id === "parallel"));
});

test("the guard, the baseline and the decision become steps, and the story stays within six", () => {
  const withGuard: StoryEvent[] = [
    ...events,
    {
      sequence: 10,
      agentId: "p",
      status: "working",
      type: "guard.blocked",
      recipes: ["lint"],
    },
    {
      sequence: 11,
      agentId: "p",
      status: "working",
      type: "checkpoint",
      decision: "Limit the guard to typecheck",
    },
  ];
  const baselines = [
    {
      title: "just lint fails the same way as at baseline",
      fact: "just lint failed at baseline and fails the same way now.",
      sequence: 5,
      agentId: "a1",
    },
  ];
  const steps = buildStory(withGuard, nodes, links, baselines);
  assert.ok(steps.length <= 6, steps.map((s) => s.id).join());
  const ids = steps.map((s) => s.id);
  for (const id of ["baseline", "guard", "decision", "verification"])
    assert.ok(ids.includes(id), id);
  assert.deepEqual(ids.slice(-3), ["guard", "decision", "verification"]);
  const decision = steps.find((s) => s.id === "decision")!;
  assert.equal(decision.provenance, "declared");
  assert.match(decision.body, /Limit the guard to typecheck/);
  assert.match(decision.body, /absence of a new block is not proof/);
  assert.equal(steps.find((s) => s.id === "guard")!.provenance, "observed");
  assert.match(steps.find((s) => s.id === "guard")!.body, /just lint failed/);
});

test("no events, no story", () => {
  assert.deepEqual(buildStory([], nodes, links), []);
});
