import test from "node:test";
import assert from "node:assert/strict";
import { importFailureMessage, transcriptWatchOptions } from "../src/lib/watch.js";

test("uses polling for transcript directories mounted from the host", () => {
  const options = transcriptWatchOptions({});
  assert.equal(options.usePolling, true);
  assert.equal(options.interval, 1_000);
  assert.equal(options.awaitWriteFinish.stabilityThreshold, 500);
});

test("parses and bounds watcher polling configuration", () => {
  assert.equal(transcriptWatchOptions({ ODRADEK_WATCH_POLL_MS: "20" }).interval, 100);
  assert.equal(transcriptWatchOptions({ ODRADEK_WATCH_POLL_MS: "99999" }).interval, 10_000);
  assert.equal(transcriptWatchOptions({ ODRADEK_WATCH_POLL_MS: "bad" }).interval, 1_000);
  assert.equal(transcriptWatchOptions({ ODRADEK_WATCH_USE_POLLING: "false" }).usePolling, false);
});

test("redacts and bounds watcher import errors before logging", () => {
  const message = importFailureMessage(new Error("token=canary-secret password=hunter2"));
  assert.doesNotMatch(message, /canary-secret|hunter2/);
  assert.match(message, /REDACTED/);
  assert.ok(importFailureMessage("x".repeat(1_500)).length <= 1_000);
});
