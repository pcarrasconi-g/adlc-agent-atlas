import test from "node:test";
import assert from "node:assert/strict";
import { followReducer, initialFollow, atPresent, type FollowState } from "./follow.ts";

const open = (total: number): FollowState => followReducer(initialFollow, { type: "open", total });

test("opening a session shows its latest state and follows", () => {
  const s = open(5);
  assert.deepEqual(s, { cursor: 4, total: 5, follow: true, playing: false, unseen: 0 });
});

test("an empty session stays at 0", () => {
  assert.equal(open(0).cursor, 0);
});

test("new events move the cursor while following", () => {
  const s = followReducer(open(3), { type: "events", total: 6 });
  assert.equal(s.cursor, 5);
  assert.equal(s.unseen, 0);
  assert.ok(s.follow);
});

test("rewinding stops following and new events never move the cursor", () => {
  let s = followReducer(open(6), { type: "seek", index: 1 });
  assert.equal(s.follow, false);
  s = followReducer(s, { type: "events", total: 8 });
  assert.equal(s.cursor, 1);
  assert.equal(s.unseen, 2);
  s = followReducer(s, { type: "events", total: 9 });
  assert.equal(s.cursor, 1);
  assert.equal(s.unseen, 3);
});

test("back to present follows again and clears the unseen counter", () => {
  let s = followReducer(open(6), { type: "step", delta: -3 });
  s = followReducer(s, { type: "events", total: 8 });
  s = followReducer(s, { type: "present" });
  assert.deepEqual(s, { cursor: 7, total: 8, follow: true, playing: false, unseen: 0 });
  s = followReducer(s, { type: "events", total: 9 });
  assert.equal(s.cursor, 8);
});

test("stepping or seeking is clamped and detaches from live", () => {
  let s = followReducer(open(4), { type: "step", delta: -99 });
  assert.equal(s.cursor, 0);
  assert.equal(s.follow, false);
  s = followReducer(s, { type: "seek", index: 99 });
  assert.equal(s.cursor, 3);
  assert.ok(atPresent(s));
  assert.equal(s.follow, false, "reaching the end by hand is not the same as live");
});

test("replay from the end restarts, advances on tick and stops at the end", () => {
  let s = followReducer(open(3), { type: "togglePlay" });
  assert.deepEqual([s.playing, s.cursor, s.follow], [true, 0, false]);
  s = followReducer(s, { type: "tick" });
  s = followReducer(s, { type: "tick" });
  assert.equal(s.cursor, 2);
  s = followReducer(s, { type: "tick" });
  assert.equal(s.playing, false);
  assert.equal(s.cursor, 2);
  assert.equal(s.follow, false, "replay never silently re-attaches to live");
});

test("events arriving during replay are counted, not followed", () => {
  let s = followReducer(open(5), { type: "seek", index: 0 });
  s = followReducer(s, { type: "togglePlay" });
  s = followReducer(s, { type: "tick" });
  s = followReducer(s, { type: "events", total: 7 });
  assert.equal(s.cursor, 1);
  assert.equal(s.unseen, 2);
  assert.ok(s.playing);
});

test("a shorter history resyncs instead of pointing past the end", () => {
  let s = followReducer(open(6), { type: "seek", index: 5 });
  s = followReducer(s, { type: "events", total: 3 });
  assert.equal(s.cursor, 2);
  assert.equal(s.unseen, 0);
});

test("pause is a no-op when not playing", () => {
  const s = open(3);
  assert.equal(followReducer(s, { type: "pause" }), s);
});
