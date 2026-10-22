import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runWriter } from "../scripts/odradek-event.mjs";
import { verifySession } from "../scripts/odradek-verify.mjs";

const quiet = { log() {} };
const api = (sessions, events) => async (url) => ({
  ok: true,
  json: async () => (String(url).includes("/events") ? events : sessions),
});

async function fixture(t, { close = true } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "odradek-verify-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const out = path.join(dir, "s.json");
  const base = ["--session", "vs", "--out", out];
  await runWriter(["init", ...base, "--principal", "6eb10d1e-0000-4000-8000-000000000001", "--provider", "cursor", "--identity-source", "host-issued"], quiet);
  await runWriter(["turn", ...base, "--agent", "a1b2c3d4-0000-4000-8000-000000000002", "--run-id", "run-1", "--summary", "ok"], quiet);
  if (close) await runWriter(["close", ...base, "--kind", "done"], quiet);
  return out;
}

test("passes when the API shows the closed session with all events", async (t) => {
  const file = await fixture(t);
  const r = await verifySession({ session: "vs", file, probe: false, fetchImpl: api([{ id: "u1", externalKey: "run-1", status: "done", eventCount: 1 }], [{}]) });
  assert.equal(r.ok, true);
});

test("fails when the session is not visible in the API", async (t) => {
  const file = await fixture(t);
  const r = await verifySession({ session: "vs", file, probe: false, fetchImpl: api([], []) });
  assert.equal(r.ok, false);
  assert.equal(r.checks.find((c) => c.name === "visible_in_api").ok, false);
  assert.match(r.hint, /bind mount/);
});

test("no hint when the API is unreachable", async (t) => {
  const file = await fixture(t);
  const r = await verifySession({ session: "vs", file, probe: false, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(r.hint, undefined);
});

test("fails when closure is missing, and when the API is unreachable", async (t) => {
  const file = await fixture(t, { close: false });
  const open = await verifySession({ session: "vs", file, probe: false, fetchImpl: api([{ id: "u1", externalKey: "run-1", status: "working" }], [{}]) });
  assert.equal(open.ok, false);
  assert.equal(open.checks.find((c) => c.name === "closed").ok, false);
  const down = await verifySession({ session: "vs", file, probe: false, fetchImpl: async () => { throw new Error("offline"); } });
  assert.equal(down.ok, false);
});

test("fails when the local session file does not exist", async () => {
  const r = await verifySession({ session: "nope", file: "/nonexistent/x.json", probe: false, fetchImpl: api([], []) });
  assert.equal(r.ok, false);
});

test("agent_registered requires real IDs, known profile and metadata", async (t) => {
  const file = await fixture(t);
  const base = ["--session", "vs", "--out", file];
  const ok = ["--agent", "c3d4e5f6-0000-4000-8000-000000000003", "--provider", "cursor", "--profile", "engineer", "--task", "impl"];
  await runWriter(["agent_registered", ...base, ...ok], quiet);
  const explicitParent = "d4e5f6a7-0000-4000-8000-000000000004";
  await runWriter(["agent_registered", ...base, ...ok.map((v, i) => (i === 1 ? "e5f6a7b8-0000-4000-8000-000000000005" : v)), "--parent", explicitParent], quiet);
  for (const bad of ["engineer", "HOST_ENGINEER_ID", "vs", "<id>"]) {
    await assert.rejects(runWriter(["agent_registered", ...base, ...ok.map((v, i) => (i === 1 ? bad : v))], quiet), /perfil|placeholder|sesión/);
  }
  await assert.rejects(runWriter(["agent_registered", ...base, "--agent", "c3d4e5f6-1", "--provider", "cursor", "--profile", "engineer"], quiet), /--task/);
  await assert.rejects(runWriter(["agent_registered", ...base, ...ok.map((v) => (v === "engineer" ? "generalPurpose" : v))], quiet), /agents\.yaml/);
  await assert.rejects(runWriter(["agent_registered", ...base, ...ok.map((v) => (v === "engineer" ? "qa" : v))], quiet), /agents\.yaml/);
  for (const badParent of ["architect", "HOST_PARENT_ID", "vs", "<id>"]) {
    await assert.rejects(runWriter(["agent_registered", ...base, ...ok, "--parent", badParent], quiet), /perfil|placeholder|sesión/);
  }
});

test("agent registration records one parent signal, not duplicate registration and delegation relations", async (t) => {
  const file = await fixture(t);
  const parent = "6eb10d1e-0000-4000-8000-000000000001";
  await runWriter(["agent_registered", "--session", "vs", "--out", file,
    "--agent", "c3d4e5f6-0000-4000-8000-000000000003", "--parent", parent,
    "--provider", "cursor", "--profile", "engineer", "--task", "impl"], quiet);
  const data = JSON.parse(await (await import("node:fs/promises")).readFile(file, "utf8"));
  const registration = data.transcript.at(-1);
  assert.equal(registration.parentAgentId, parent);
  assert.equal(registration.relations, undefined);
});

test("verification paginates sessions with more than 500 events", async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "odradek-verify-pages-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "many.json");
  const entries = Array.from({ length: 501 }, (_, sequence) => ({
    runId: `run-${sequence}`, round: sequence + 1, agentId: "agent-real-1",
    parsed: { status: "done", summary: `event ${sequence}` },
  }));
  await writeFile(file, JSON.stringify({
    kind: "done", sessionId: "many", principal: { agentId: "principal-real-1", identitySource: "host-issued" }, transcript: entries,
  }));
  const requests = [];
  const fetchImpl = async (url) => {
    const parsed = new URL(String(url));
    requests.push(parsed);
    if (parsed.pathname === "/api/sessions") {
      return { ok: true, json: async () => [{ id: "u-many", externalKey: "run-0", status: "done" }] };
    }
    const after = parsed.searchParams.get("afterSequence");
    const start = after === null ? 0 : Number(after) + 1;
    return { ok: true, json: async () => entries.slice(start, start + 500).map((_, sequence) => ({ sequence: start + sequence })) };
  };
  const result = await verifySession({ session: "many", file, probe: false, fetchImpl });
  assert.equal(result.ok, true);
  const eventRequests = requests.filter((request) => request.pathname.endsWith("/events"));
  assert.equal(eventRequests.length, 2);
  assert.equal(eventRequests[1].searchParams.get("afterSequence"), "499");
});
