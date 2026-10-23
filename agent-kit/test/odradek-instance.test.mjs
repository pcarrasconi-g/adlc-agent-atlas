import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkObservatory } from "../scripts/odradek-observatory.mjs";
import { probeInstance, resolveBaseUrl } from "../scripts/odradek-instance.mjs";
import { verifySession } from "../scripts/odradek-verify.mjs";

async function tmp(t) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "odradek-inst-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** Fake observatory. `watchDir` = directory it can see; null = a foreign instance seeing nothing of ours. */
async function fakeServer(t, watchDir) {
  const deleted = [];
  const server = http.createServer(async (req, res) => {
    res.setHeader("content-type", "application/json");
    if (req.method === "DELETE") { deleted.push(req.url); return res.end("{}"); }
    if (req.url === "/api/projects") return res.end("[]");
    if (req.url === "/api/sessions") {
      const out = [];
      if (watchDir) {
        for (const f of await readdir(path.join(watchDir, "sessions")).catch(() => [])) {
          const d = JSON.parse(await readFile(path.join(watchDir, "sessions", f), "utf8"));
          // The real backend detector gives canonical sessionId precedence over
          // a per-entry runId when it publishes API externalKey.
          out.push({ id: `id-${f}`, externalKey: d.sessionId, status: d.kind, eventCount: d.transcript.length });
        }
      }
      return res.end(JSON.stringify(out));
    }
    res.statusCode = 404; res.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());
  return { url: `http://127.0.0.1:${server.address().port}`, deleted };
}

test("URL precedence: --base-url > ODRADEK_BASE_URL > .env ODRADEK_PORT > default", async (t) => {
  const root = await tmp(t);
  await writeFile(path.join(root, ".env"), "ODRADEK_PORT=8123\n");
  const env = { ODRADEK_BASE_URL: "http://env.test" };
  assert.deepEqual(await resolveBaseUrl({ baseUrl: "http://flag.test", env, rootDir: root }), { baseUrl: "http://flag.test", source: "--base-url" });
  assert.deepEqual(await resolveBaseUrl({ env, rootDir: root }), { baseUrl: "http://env.test", source: "ODRADEK_BASE_URL" });
  const fromFile = await resolveBaseUrl({ env: {}, rootDir: root });
  assert.equal(fromFile.baseUrl, "http://127.0.0.1:8123");
  assert.match(fromFile.source, /\.env ODRADEK_PORT$/);
  assert.deepEqual(await resolveBaseUrl({ env: {}, rootDir: await tmp(t) }), { baseUrl: "http://127.0.0.1:8090", source: "default" });
});

test("own instance: the probe is seen, reported healthy_own, and cleaned up", async (t) => {
  const out = await tmp(t);
  const server = await fakeServer(t, out);
  const result = await checkObservatory({ baseUrl: server.url, urlSource: "test", probe: { outputDir: out, waitMs: 2000, pollMs: 20 } });
  assert.equal(result.service, "healthy_own");
  assert.equal(result.urlSource, "test");
  assert.deepEqual(await readdir(path.join(out, "sessions")), []);
  assert.equal(server.deleted.length, 1);
  assert.match(server.deleted[0], /^\/api\/sessions\/id-odradek-probe-[a-f0-9]+\.json$/);
});

test("foreign instance: healthy API that does not see this checkout is foreign_instance", async (t) => {
  const out = await tmp(t);
  const server = await fakeServer(t, null);
  const result = await checkObservatory({ baseUrl: server.url, probe: { outputDir: out, waitMs: 150, pollMs: 20 } });
  assert.equal(result.service, "healthy_foreign");
  assert.equal(result.reason, "foreign_instance");
  assert.deepEqual(await readdir(path.join(out, "sessions")), []);
  assert.equal(server.deleted.length, 0);
});

test("unknown: probe that cannot write degrades to instance_unknown", async (t) => {
  const dir = await tmp(t);
  const blocker = path.join(dir, "file");
  await writeFile(blocker, "x");
  const server = await fakeServer(t, null);
  const r = await probeInstance({ baseUrl: server.url, outputDir: blocker });
  assert.equal(r.instance, "unknown");
});

test("probe removes its file and reports structured cleanup warning when API DELETE fails", async (t) => {
  const out = await tmp(t);
  const warnings = [];
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "DELETE") return { ok: false, status: 503 };
    const files = await readdir(path.join(out, "sessions")).catch(() => []);
    return { ok: true, json: async () => files.map((file) => ({ id: `probe-id-${file}`, externalKey: file.replace(/\.json$/, "") })) };
  };
  const result = await probeInstance({ baseUrl: "http://test", outputDir: out, fetchImpl, waitMs: 100, pollMs: 5, onWarning: (warning) => warnings.push(warning) });
  assert.equal(result.instance, "own");
  assert.equal(result.warning.code, "probe_api_cleanup_failed");
  assert.equal(result.warning.status, 503);
  assert.deepEqual(warnings, [result.warning]);
  assert.deepEqual(await readdir(path.join(out, "sessions")), []);
});

test("probe cleanup warnings redact credentials", async (t) => {
  const out = await tmp(t);
  const fetchImpl = async (_url, init = {}) => {
    if (init.method === "DELETE") throw new Error("token=canary-secret password=hunter2");
    const files = await readdir(path.join(out, "sessions")).catch(() => []);
    return { ok: true, json: async () => files.map((file) => ({ id: `probe-id-${file}`, externalKey: file.replace(/\.json$/, "") })) };
  };
  const result = await probeInstance({ baseUrl: "http://test", outputDir: out, fetchImpl, waitMs: 100, pollMs: 5 });
  assert.doesNotMatch(result.warning.detail, /canary-secret|hunter2/);
  assert.match(result.warning.detail, /REDACTED/);
});

test("observatory check exposes a failed probe cleanup warning", async (t) => {
  const out = await tmp(t);
  const fetchImpl = async (url, init = {}) => {
    if (init.method === "DELETE") return { ok: false, status: 502 };
    if (String(url).endsWith("/api/projects")) return { ok: true, json: async () => [] };
    const files = await readdir(path.join(out, "sessions")).catch(() => []);
    return { ok: true, json: async () => files.map((file) => ({ id: `probe-id-${file}`, externalKey: file.replace(/\.json$/, "") })) };
  };
  const result = await checkObservatory({ baseUrl: "http://test", fetchImpl, probe: { outputDir: out, waitMs: 100, pollMs: 5 } });
  assert.equal(result.service, "healthy_own");
  assert.equal(result.warning.code, "probe_api_cleanup_failed");
  assert.equal(result.warning.status, 502);
});

test("default URL resolution is independent of the checkout environment and .env", async (t) => {
  const cleanRoot = await tmp(t);
  assert.deepEqual(await resolveBaseUrl({ env: {}, rootDir: cleanRoot }), { baseUrl: "http://127.0.0.1:8090", source: "default" });
});

test("verify reports reason foreign_instance and fails on a foreign instance", async (t) => {
  const out = await tmp(t);
  const server = await fakeServer(t, null);
  const r = await verifySession({ session: "vs", baseUrl: server.url, file: "/nonexistent.json", probe: { outputDir: out, waitMs: 150, pollMs: 20 } });
  assert.equal(r.ok, false);
  assert.equal(r.reason, "foreign_instance");
  assert.equal(r.url, server.url);
});
