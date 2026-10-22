import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runWriter } from "../scripts/odradek-event.mjs";

const quiet = { log() {} };

test("init persists the candidate session and real principal metadata", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "odradek-event-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "candidate.json");

  await runWriter(["init",
    "--session", "candidate-session",
    "--out", output,
    "--goal", "Validate checkout",
    "--mode", "multi",
    "--principal", "host-principal-123",
    "--provider", "codex",
    "--identity-source", "host-issued",
  ], quiet);

  const session = JSON.parse(await readFile(output, "utf8"));
  assert.equal(session.sessionId, "candidate-session");
  assert.equal(session.goal, "Validate checkout");
  assert.equal(session.mode, "multi");
  assert.deepEqual(session.principal, {
    agentId: "host-principal-123",
    provider: "codex",
    identitySource: "host-issued",
  });
  assert.deepEqual(session.transcript, []);
});

test("a second init fails without erasing an existing transcript", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "odradek-event-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "existing.json");
  const base = ["--session", "existing-session", "--out", output];

  await runWriter(["init", ...base, "--goal", "Original"], quiet);
  await runWriter(["turn", ...base,
    "--agent", "host-agent-1", "--summary", "Work preserved"], quiet);
  const before = await readFile(output, "utf8");

  await assert.rejects(
    runWriter(["init", ...base, "--goal", "Replacement"], quiet),
    /ya existe y no se reinicializó/,
  );
  assert.equal(await readFile(output, "utf8"), before);
});

test("init redacts secrets from all textual metadata", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "odradek-event-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "redacted.json");
  const secret = "super-sensitive-value";

  await runWriter(["init",
    "--session", `redacted-session token=${secret}`,
    "--out", output,
    "--goal", `goal token=${secret}`,
    "--mode", `multi token=${secret}`,
    "--principal", `principal token=${secret}`,
    "--provider", `codex token=${secret}`,
    "--identity-source", `host-issued token=${secret}`,
  ], quiet);

  const persisted = await readFile(output, "utf8");
  const session = JSON.parse(persisted);
  assert.equal(persisted.includes(secret), false);
  assert.equal(session.sessionId, "redacted-session token=[REDACTED]");
  assert.equal(session.goal, "goal token=[REDACTED]");
  assert.equal(session.mode, "multi token=[REDACTED]");
  assert.deepEqual(session.principal, {
    agentId: "principal token=[REDACTED]",
    provider: "codex token=[REDACTED]",
    identitySource: "host-issued token=[REDACTED]",
  });
});

test("turn and close redact secrets from all argument-controlled text", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "odradek-event-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const output = path.join(directory, "turn-redacted.json");
  const secret = "turn-secret-value";
  const tagged = (prefix) => `${prefix} token=${secret}`;
  const base = ["--session", "turn-redacted-session", "--out", output];

  await runWriter(["init", ...base], quiet);
  await runWriter(["turn", ...base,
    "--run-id", tagged("run"),
    "--agent", tagged("agent"),
    "--parent", tagged("parent"),
    "--status", tagged("continue"),
    "--summary", tagged("summary"),
    "--raw", tagged("raw"),
    "--from", tagged("from"),
    "--to", tagged("to"),
    "--relation", tagged("message"),
  ], quiet);
  await runWriter(["close", ...base, "--kind", tagged("done")], quiet);

  const persisted = await readFile(output, "utf8");
  const session = JSON.parse(persisted);
  const [event] = session.transcript;
  assert.equal(persisted.includes(secret), false);
  assert.equal(session.kind, "done token=[REDACTED]");
  assert.equal(event.runId, "run token=[REDACTED]");
  assert.equal(event.agentId, "agent token=[REDACTED]");
  assert.equal(event.parentAgentId, "parent token=[REDACTED]");
  assert.equal(event.parsed.status, "continue token=[REDACTED]");
  assert.equal(event.parsed.summary, "summary token=[REDACTED]");
  assert.equal(event.rawText, "raw token=[REDACTED]");
  assert.deepEqual(event.relations, [{
    from: "from token=[REDACTED]",
    to: "to token=[REDACTED]",
    kind: "message token=[REDACTED]",
    source: "explicit",
    confidence: 1,
  }]);
});
