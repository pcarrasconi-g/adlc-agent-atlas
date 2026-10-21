import test from "node:test";
import assert from "node:assert/strict";
import { redact, redactDeep } from "../src/lib/redact.js";

test("removes common credential representations before persistence", () => {
  const result = redact("token=top-secret Bearer abc.def.ghi api_key: xyz sk-abcdefghijklmnopqrstuv");
  assert.doesNotMatch(result, /top-secret|abc\.def\.ghi|xyz|sk-abcdefghijkl/);
  assert.match(result, /REDACTED/);
});
test("redacts nested payload values", () => {
  const value=redactDeep({ parsed:{ credential:"password=hunter2" }, messages:["Bearer a.b.c"] });
  assert.doesNotMatch(JSON.stringify(value), /hunter2|a\.b\.c/);
});
test("never retains an OpenAI-style sk token", () => {
  const token="sk-abcdefghijklmnopqrstuv";
  const result=redact(`nested token ${token}`);
  assert.doesNotMatch(result, new RegExp(token));
  assert.equal(result, "nested token [REDACTED]");
});
