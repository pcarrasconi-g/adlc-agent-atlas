import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { agentTeamEvents } from "../src/detectors/agent-team.js";
import { projectSession } from "../src/lib/projection.js";

const file = new URL("../../../docs/samples/recorded-two-subagents.json", import.meta.url).pathname;

test("the committed recording imports as a real two-subagent run", async () => {
  const session = await agentTeamEvents(file);
  assert.equal(session.status, "done");
  assert.equal(session.events.length, 13);
  const agents = new Set(session.events.map((e) => e.agent?.key));
  assert.deepEqual([...agents].sort(), ["agent-1", "agent-2", "session-1"]);
});

test("delegation edges start as inferred and are later confirmed as observed", async () => {
  const session = await agentTeamEvents(file);
  const relations = session.events.flatMap((e) => (e.relations || []).map((r) => ({ at: e.sequence, ...r })));
  for (const child of ["agent-1", "agent-2"]) {
    const edges = relations.filter((r) => r.target === child);
    assert.deepEqual(edges.map((r) => r.provenance), ["inferred", "observed"]);
    assert.ok(edges[1].at > edges[0].at);
  }
});

test("projection at the end shows a finished run, not a green success claim", async () => {
  const session = await agentTeamEvents(file);
  const events = session.events.map((e) => ({
    id: e.externalKey, sequence: e.sequence, type: e.type, status: e.status ?? null,
    agentId: e.agent!.key, agentKey: e.agent!.key, agentName: e.agent!.name, agentRole: null,
    agentEvidenceLevel: e.agent!.evidenceLevel, agentIsPrincipal: Boolean(e.agent!.isPrincipal),
    timestamp: e.occurredAt ?? null, summary: e.summary ?? null,
  }));
  const view = projectSession({ sessionStatus: session.status, events, edges: [] });
  assert.equal(view.nodes.length, 3);
  assert.equal(view.result, "done");
});

test("the recording carries no machine paths, users or companies", () => {
  const text = readFileSync(file, "utf8");
  assert.doesNotMatch(text, /\/home\/|\/tmp\/|osbulb|sovos/i);
});
