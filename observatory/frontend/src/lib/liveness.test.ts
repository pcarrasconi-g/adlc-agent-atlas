import test from "node:test";
import assert from "node:assert/strict";
import { liveness, staleAfterMs, DEFAULT_STALE_AFTER_MS } from "./liveness.ts";
import { fromEvidence, fromRelation, stronger, ageLabel } from "./provenance.ts";

const base = { status: "working", lastSignalMs: 1_000_000, nowMs: 1_010_000, staleAfter: 120_000, atPresent: true, recorded: false };

test("a recent signal on a live session is active", () => {
  assert.equal(liveness(base), "active");
});

test("the pulse stops when the freshness window expires", () => {
  assert.equal(liveness({ ...base, nowMs: 1_000_000 + 120_001 }), "uncertain");
});

test("no signal at all is uncertain, never active", () => {
  assert.equal(liveness({ ...base, lastSignalMs: null }), "uncertain");
});

test("terminal agents are ended regardless of age", () => {
  assert.equal(liveness({ ...base, status: "done", nowMs: 9e9 }), "ended");
  assert.equal(liveness({ ...base, status: "failed" }), "ended");
});

test("a recorded session or an old step never pulses", () => {
  assert.equal(liveness({ ...base, recorded: true }), "history");
  assert.equal(liveness({ ...base, atPresent: false }), "history");
});

test("stale threshold is configurable with a safe default", () => {
  assert.equal(staleAfterMs("30"), 30_000);
  assert.equal(staleAfterMs("abc"), DEFAULT_STALE_AFTER_MS);
  assert.equal(staleAfterMs("1"), DEFAULT_STALE_AFTER_MS);
  assert.equal(staleAfterMs(undefined), DEFAULT_STALE_AFTER_MS);
});

test("evidence and relation provenance map to the contract vocabulary", () => {
  assert.equal(fromEvidence("host-recorded"), "observed");
  assert.equal(fromEvidence("behavior-evidenced"), "verified");
  assert.equal(fromEvidence("declared"), "declared");
  assert.equal(fromEvidence("unverifiable"), "unknown");
  assert.equal(fromEvidence(undefined), "unknown");
  assert.equal(fromRelation("explicit"), "declared");
  assert.equal(fromRelation("inferred"), "inferred");
  assert.equal(fromRelation("observed"), "observed");
  assert.equal(fromRelation(""), "inferred");
});

test("observed beats inferred when the same relation is seen twice", () => {
  assert.equal(stronger("inferred", "observed"), "observed");
  assert.equal(stronger("verified", "declared"), "verified");
});

test("age labels", () => {
  assert.equal(ageLabel(4_400), "4s");
  assert.equal(ageLabel(75_000), "1m 15s");
  assert.equal(ageLabel(3_900_000), "1h 5m");
});
