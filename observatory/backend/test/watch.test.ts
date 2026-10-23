import test from "node:test";
import assert from "node:assert/strict";
import { importFailureMessage, transcriptWatchOptions } from "../src/lib/watch.js";

test("uses polling for transcript directories mounted from the host", () => {
  assert.equal(transcriptWatchOptions.usePolling, true);
  assert.equal(transcriptWatchOptions.interval, 250);
  assert.equal(transcriptWatchOptions.awaitWriteFinish.stabilityThreshold, 500);
});

test("redacts and bounds watcher import errors before logging", () => {
  const message = importFailureMessage(new Error("token=canary-secret password=hunter2"));
  assert.doesNotMatch(message, /canary-secret|hunter2/);
  assert.match(message, /REDACTED/);
  assert.ok(importFailureMessage("x".repeat(1_500)).length <= 1_000);
});
