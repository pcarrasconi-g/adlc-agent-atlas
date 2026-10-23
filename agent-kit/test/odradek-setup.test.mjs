import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, stat } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { PORT_MAX, PORT_MIN, deriveInstance, pickPort, setupEnv } from "../scripts/odradek-setup.mjs";

async function root(t, name = "My Odradek") {
  const parent = await mkdtemp(path.join(os.tmpdir(), "odradek-setup-"));
  t.after(() => rm(parent, { recursive: true, force: true }));
  const dir = path.join(parent, name);
  await (await import("node:fs/promises")).mkdir(dir);
  return dir;
}

test("instance derives from directory name plus short path hash", () => {
  const a = deriveInstance("/x/My Odradek");
  assert.match(a.instance, /^my-odradek-[0-9a-f]{6}$/);
  assert.notEqual(a.instance, deriveInstance("/y/My Odradek").instance);
  assert.equal(a.instance, deriveInstance("/x/My Odradek").instance);
});

test("port is deterministic, in range, and climbs past busy ports", async () => {
  const { hash } = deriveInstance("/x/odradek");
  const first = await pickPort(hash, { free: async () => true });
  assert.ok(first >= PORT_MIN && first <= PORT_MAX);
  assert.equal(await pickPort(hash, { free: async () => true }), first);
  const next = await pickPort(hash, { free: async (p) => p !== first });
  assert.equal(next, first === PORT_MAX ? PORT_MIN : first + 1);
});

test("a really occupied port is skipped", async (t) => {
  const { hash } = deriveInstance("/x/odradek");
  const wanted = await pickPort(hash, { free: async () => true });
  const server = net.createServer();
  await new Promise((r, j) => { server.once("error", j); server.listen(wanted, "127.0.0.1", r); }).catch(() => {});
  t.after(() => server.close());
  const { isFree } = await import("../scripts/odradek-setup.mjs");
  if (server.listening) assert.notEqual(await pickPort(hash), wanted);
  assert.equal((await isFree(wanted)).status, server.listening ? "taken" : "free");
});

test("permission failures abort port selection instead of masquerading as occupied", async () => {
  const { hash } = deriveInstance("/x/odradek");
  await assert.rejects(
    pickPort(hash, { free: async () => ({ status: "bind_not_permitted", code: "EACCES" }) }),
    (error) => error.code === "BIND_NOT_PERMITTED" && /permiso de bind denegado/.test(error.message),
  );
});

test("setup writes missing keys, is idempotent, and never overwrites", async (t) => {
  const dir = await root(t);
  const first = await setupEnv({ rootDir: dir, free: async () => true });
  assert.deepEqual(first.added, ["ODRADEK_INSTANCE", "ODRADEK_PORT", "POSTGRES_PASSWORD"]);
  assert.equal(JSON.stringify(first).includes("POSTGRES_PASSWORD="), false);
  const text = await readFile(path.join(dir, ".env"), "utf8");
  const password = text.match(/POSTGRES_PASSWORD=(\S+)/)[1];
  assert.ok(password.length >= 32);
  assert.equal(JSON.stringify(first).includes(password), false);
  assert.equal(((await stat(path.join(dir, ".env"))).mode & 0o777), 0o600);
  const second = await setupEnv({ rootDir: dir, free: async () => true });
  assert.equal(second.changed, false);
  assert.equal(await readFile(path.join(dir, ".env"), "utf8"), text);
  assert.equal(second.port, first.port);
});

test("existing values are preserved and only gaps are filled", async (t) => {
  const dir = await root(t);
  await writeFile(path.join(dir, ".env"), "POSTGRES_PASSWORD=keep-me\nODRADEK_PORT=8555");
  const r = await setupEnv({ rootDir: dir, free: async () => true });
  assert.deepEqual(r.added, ["ODRADEK_INSTANCE"]);
  assert.equal(r.port, 8555);
  const text = await readFile(path.join(dir, ".env"), "utf8");
  assert.match(text, /POSTGRES_PASSWORD=keep-me\nODRADEK_PORT=8555\nODRADEK_INSTANCE=/);
});
