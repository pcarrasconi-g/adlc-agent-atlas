import test from "node:test";
import assert from "node:assert/strict";
import { buildStory, linkKey, type StoryEvent, type StoryLink, type StoryNode } from "./story.ts";

const nodes: StoryNode[] = [
  { id: "p", name: "Claude Code", isPrincipal: true },
  { id: "a1", name: "general-purpose" },
  { id: "a2", name: "general-purpose" },
];
// Mirrors the committed recording: two parallel subagents, edges first inferred then observed.
const events: StoryEvent[] = [
  { sequence: 0, agentId: "p", status: "registered", type: "session.principal" },
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
  { source: "p", target: "a1", relation: "delegation", provenance: "inferred", sequenceStart: 2 },
  { source: "p", target: "a2", relation: "delegation", provenance: "inferred", sequenceStart: 4 },
  { source: "p", target: "a2", relation: "delegation", provenance: "observed", sequenceStart: 8 },
  { source: "p", target: "a1", relation: "delegation", provenance: "observed", sequenceStart: 9 },
];

test("tells a short, ordered story from real evidence", () => {
  const steps = buildStory(events, nodes, links);
  assert.deepEqual(steps.map((s) => s.id), ["delegate", "parallel", "result", "confirm:p->a1", "verification"]);
  assert.ok(steps.length >= 4 && steps.length <= 6);
  assert.deepEqual(steps.map((s) => s.sequence), [...steps.map((s) => s.sequence)].sort((a, b) => a - b));
});

test("the first delegation step is as sure as its link, and names who delegated", () => {
  const [delegate] = buildStory(events, nodes, links);
  assert.equal(delegate.provenance, "inferred");
  assert.deepEqual(delegate.links, [linkKey("p", "a1")]);
  assert.match(delegate.body, /Claude Code delegated to general-purpose/);
});

test("parallel step appears at the first moment two agents are active", () => {
  const parallel = buildStory(events, nodes, links).find((s) => s.id === "parallel")!;
  assert.equal(parallel.sequence, 4);
  assert.deepEqual([...parallel.agents].sort(), ["a1", "a2"]);
});

test("a completed agent is not proof that anything passed", () => {
  const result = buildStory(events, nodes, links).find((s) => s.id === "result")!;
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
  const withGate: StoryEvent[] = [...events, { sequence: 10, agentId: "p", status: "failed", type: "gate.finished" }];
  const last = buildStory(withGate, nodes, links).at(-1)!;
  assert.equal(last.provenance, "verified");
  assert.match(last.title, /1 check observed/);
});

test("steps that lack evidence are omitted: a sequential run has no 'parallel' step", () => {
  const sequential = events.filter((e) => e.agentId !== "a2");
  const steps = buildStory(sequential, nodes.slice(0, 2), links.filter((l) => l.target === "a1"));
  assert.ok(!steps.some((s) => s.id === "parallel"));
});

test("no events, no story", () => {
  assert.deepEqual(buildStory([], nodes, links), []);
});
