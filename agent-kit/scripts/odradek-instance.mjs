import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const agentKitRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const odradekRoot = path.resolve(agentKitRoot, "..");
export const DEFAULT_BASE_URL = "http://127.0.0.1:8090";

/** URL precedence: --base-url > ODRADEK_BASE_URL > ODRADEK_PORT in <ODRADEK_ROOT>/.env; otherwise setup_required. */
export async function resolveBaseUrl({ baseUrl, env = process.env, rootDir = odradekRoot } = {}) {
  if (typeof baseUrl === "string" && baseUrl) return { baseUrl, source: "--base-url" };
  if (env.ODRADEK_BASE_URL) return { baseUrl: env.ODRADEK_BASE_URL, source: "ODRADEK_BASE_URL" };
  try {
    const text = await readFile(path.join(rootDir, ".env"), "utf8");
    const match = text.match(/^\s*ODRADEK_PORT\s*=\s*["']?(\d{1,5})["']?\s*(?:#.*)?$/m);
    if (match) return { baseUrl: `http://127.0.0.1:${match[1]}`, source: `${path.join(rootDir, ".env")} ODRADEK_PORT` };
  } catch { /* no .env: fall through */ }
  return { baseUrl: DEFAULT_BASE_URL, source: "default" };
}

export function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    out[key] = argv[i + 1] === undefined || argv[i + 1].startsWith("--") ? true : argv[++i];
  }
  return out;
}

async function json(fetchImpl, url, timeoutMs, init = {}) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), ...init });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

/**
 * Instance-ownership probe that needs no new API endpoint: write a short-lived
 * valid transcript into <ODRADEK_ROOT>/agent-kit/output/sessions and see whether
 * the API imports it. Only an instance that mounts this checkout's output
 * directory can see it. The file and the imported probe session are always
 * removed. Returns "own", "foreign", or "unknown" (probe could not be performed).
 */
export async function probeInstance({
  baseUrl,
  outputDir = path.join(agentKitRoot, "output"),
  fetchImpl = fetch,
  timeoutMs = 3000,
  waitMs = 5000,
  pollMs = 250,
} = {}) {
  const nonce = randomBytes(6).toString("hex");
  const name = `odradek-probe-${nonce}`;
  const runId = `probe-${nonce}`;
  const file = path.join(outputDir, "sessions", `${name}.json`);
  const base = `${baseUrl.replace(/\/$/, "")}/`;
  try {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, `${JSON.stringify({
      kind: "done", goal: "Odradek instance probe (auto-deleted)", sessionId: name,
      transcript: [{ runId, round: 1, agentId: "odradek-probe", at: new Date().toISOString(), rawText: "probe", parsed: { status: "done", summary: "probe" } }],
    })}\n`, { mode: 0o644 });
  } catch (error) {
    return { instance: "unknown", reason: "instance_unknown", detail: `no se pudo escribir el probe: ${error?.code ?? error?.message}` };
  }
  let found = null;
  try {
    const deadline = Date.now() + waitMs;
    while (Date.now() < deadline && !found) {
      const sessions = await json(fetchImpl, new URL("api/sessions", base).toString(), timeoutMs);
      // The backend uses the transcript's canonical sessionId as externalKey.
      // runId belongs to an individual transcript entry and is not the API key.
      found = Array.isArray(sessions) ? sessions.find((s) => s.externalKey === name) ?? null : null;
      if (!found) await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } catch (error) {
    await rm(file, { force: true });
    return { instance: "unknown", reason: "instance_unknown", detail: String(error?.message ?? error) };
  }
  await rm(file, { force: true });
  if (found) {
    try { await fetchImpl(new URL(`api/sessions/${found.id}`, base).toString(), { method: "DELETE", signal: AbortSignal.timeout(timeoutMs) }); } catch { /* best effort */ }
    return { instance: "own" };
  }
  return { instance: "foreign", reason: "foreign_instance", detail: "el servicio no importó el probe escrito en este checkout (otro checkout/instancia, o mount obsoleto)" };
}
