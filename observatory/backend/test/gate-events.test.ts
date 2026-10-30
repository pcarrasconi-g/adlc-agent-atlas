import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { agentTeamEvents } from "../src/detectors/agent-team.js";

const entry = (agentId: string, parsed: Record<string, unknown>, at: string) => ({ agentId, at, parsed });
const session = {
  sessionId: "gate-sample", goal: "g", kind: "running", source: "atlas-adapter",
  principal: { agentId: "p", identitySource: "host-issued" },
  transcript: [
    entry("A", { event: "agent_registered", status: "working", profile: "qa-engineer", summary: "Started" }, "2026-10-30T12:00:00.000Z"),
    entry("A", { event: "gate.started", status: "working", recipe: "just lint", summary: "Check just lint started" }, "2026-10-30T12:00:01.000Z"),
    entry("A", { event: "gate.finished", status: "working", recipe: "just lint", exit: 1, summary: "Check just lint failed (exit 1)" }, "2026-10-30T12:00:02.000Z"),
    entry("p", { event: "task.completed", status: "working", summary: "Task completed" }, "2026-10-30T12:00:03.000Z"),
  ],
};

test("check and task events keep their own type; the agent is not marked failed", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "gate-"));
  const file = path.join(dir, "gate-sample.json");
  writeFileSync(file, JSON.stringify(session));
  const imported = await agentTeamEvents(file);
  const types = imported.events.map((e) => e.type);
  assert.deepEqual(types, ["session.principal", "agent.registered", "gate.started", "gate.finished", "task.completed"]);
  const finished = imported.events.find((e) => e.type === "gate.finished")!;
  assert.equal(finished.status, "working");
  assert.equal((finished.payload as any).parsed.exit, 1);
  assert.equal(imported.status, "running");
});
