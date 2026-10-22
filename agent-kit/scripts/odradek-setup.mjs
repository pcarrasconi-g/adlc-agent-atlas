#!/usr/bin/env node
import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import { odradekRoot } from "./odradek-instance.mjs";

export const PORT_MIN = 8100;
export const PORT_MAX = 8899;

export function deriveInstance(rootDir) {
  const name = path.basename(rootDir).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "odradek";
  const hash = createHash("sha256").update(path.resolve(rootDir)).digest("hex");
  return { instance: `${name}-${hash.slice(0, 6)}`.slice(0, 40), hash };
}

export function isFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/** Deterministic start from the path hash; climbs (wrapping) until a free port is found. */
export async function pickPort(hash, { free = isFree, taken = new Set() } = {}) {
  const span = PORT_MAX - PORT_MIN + 1;
  const start = parseInt(hash.slice(0, 8), 16) % span;
  for (let i = 0; i < span; i += 1) {
    const port = PORT_MIN + ((start + i) % span);
    if (!taken.has(port) && await free(port)) return port;
  }
  throw new Error(`Sin puertos libres en ${PORT_MIN}-${PORT_MAX}`);
}

const has = (text, key) => new RegExp(`^\\s*${key}\\s*=\\s*\\S`, "m").test(text);

/** Adds only missing keys to <root>/.env. Never overwrites; never returns the password. */
export async function setupEnv({ rootDir = odradekRoot, free = isFree } = {}) {
  const file = path.join(rootDir, ".env");
  let text = "";
  try { text = await readFile(file, "utf8"); } catch { /* new file */ }
  const { instance, hash } = deriveInstance(rootDir);
  const added = [];
  const lines = [];
  if (!has(text, "ODRADEK_INSTANCE")) { lines.push(`ODRADEK_INSTANCE=${instance}`); added.push("ODRADEK_INSTANCE"); }
  let port = text.match(/^\s*ODRADEK_PORT\s*=\s*["']?(\d+)/m)?.[1];
  if (!port) {
    port = String(await pickPort(hash, { free }));
    lines.push(`ODRADEK_PORT=${port}`); added.push("ODRADEK_PORT");
  }
  if (!has(text, "POSTGRES_PASSWORD")) { lines.push(`POSTGRES_PASSWORD=${randomBytes(24).toString("hex")}`); added.push("POSTGRES_PASSWORD"); }
  if (lines.length) {
    const prefix = text && !text.endsWith("\n") ? "\n" : "";
    await writeFile(file, `${text}${prefix}${lines.join("\n")}\n`, { mode: 0o600 });
  }
  const final = await readFile(file, "utf8").catch(() => "");
  return {
    file, added, changed: added.length > 0,
    instance: final.match(/^\s*ODRADEK_INSTANCE\s*=\s*(\S+)/m)?.[1] ?? instance,
    port: Number(port),
    url: `http://127.0.0.1:${port}`,
  };
}

async function main() {
  const result = await setupEnv();
  console.log(JSON.stringify(result));
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => { console.error(e.message); process.exit(1); });
