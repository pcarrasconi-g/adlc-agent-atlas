import assert from "node:assert/strict";
import test from "node:test";
import { checkObservatory, projectsUrl } from "../scripts/odradek-observatory.mjs";

test("builds the public projects endpoint", () => {
  assert.equal(projectsUrl("http://127.0.0.1:8090/"), "http://127.0.0.1:8090/api/projects");
});

test("reports healthy, not active, for a successful projects response", async () => {
  const result = await checkObservatory({
    baseUrl: "http://example.test",
    fetchImpl: async () => ({ ok: true, json: async () => [] }),
  });
  assert.deepEqual(result, { service: "healthy", url: "http://example.test/api/projects" });
});

test("reports unavailable for failed and malformed responses", async () => {
  const failed = await checkObservatory({
    fetchImpl: async () => ({ ok: false, status: 503 }),
  });
  assert.equal(failed.service, "unavailable");
  assert.equal(failed.reason, "HTTP 503");

  const malformed = await checkObservatory({
    fetchImpl: async () => ({ ok: true, json: async () => ({ status: "ok" }) }),
  });
  assert.equal(malformed.service, "unavailable");
  assert.equal(malformed.reason, "unexpected response");
});

test("does not attempt to start the observatory when connection fails", async () => {
  const result = await checkObservatory({
    fetchImpl: async () => { throw new Error("offline"); },
  });
  assert.equal(result.service, "unavailable");
  assert.equal(result.reason, "connection failed");
});

test("reports a deterministic timeout", async () => {
  const result = await checkObservatory({
    timeoutMs: 1,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("aborted");
        error.name = "AbortError";
        reject(error);
      }, { once: true });
    }),
  });
  assert.equal(result.service, "unavailable");
  assert.equal(result.reason, "timeout");
});
