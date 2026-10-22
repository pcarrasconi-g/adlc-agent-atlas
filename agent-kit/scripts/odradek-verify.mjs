#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs, probeInstance, resolveBaseUrl } from "./odradek-instance.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function getJson(fetchImpl, url, timeoutMs) {
  const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
  return response.json();
}

async function getAllEvents(fetchImpl, base, sessionId, timeoutMs) {
  const pageSize = 500;
  const maxPages = 100;
  const events = [];
  let afterSequence;
  for (let page = 0; page < maxPages; page += 1) {
    const url = new URL(`api/sessions/${sessionId}/events`, base);
    url.searchParams.set("limit", String(pageSize));
    if (afterSequence !== undefined) url.searchParams.set("afterSequence", String(afterSequence));
    const batch = await getJson(fetchImpl, url.toString(), timeoutMs);
    if (!Array.isArray(batch)) throw new Error("respuesta inesperada del endpoint de eventos");
    events.push(...batch);
    if (batch.length < pageSize) return events;
    const next = Number(batch.at(-1)?.sequence);
    if (!Number.isInteger(next) || next < 0 || next === afterSequence) {
      throw new Error("la paginación de eventos no avanzó");
    }
    afterSequence = next;
  }
  throw new Error(`la sesión supera el límite verificable de ${pageSize * maxPages} eventos`);
}

/**
 * Verifies against the real API (not the writer's printed path) that a session
 * is visible and that init, closure and events are present. Returns a report;
 * `ok` is true only when every required check passed.
 */
export async function verifySession({
  session,
  baseUrl,
  urlSource = "caller",
  probe = {},
  file,
  requireClose = true,
  minEvents = 1,
  requireRegistration = false,
  fetchImpl = fetch,
  timeoutMs = Number(process.env.ODRADEK_CHECK_TIMEOUT_MS || 3000),
} = {}) {
  if (!baseUrl) ({ baseUrl, source: urlSource } = await resolveBaseUrl());
  if (urlSource === "default") {
    return { session, ok: false, url: baseUrl, urlSource, reason: "setup_required", checks: [{ name: "url_configured", ok: false, detail: "ODRADEK_PORT no definido en .env: ejecuta observatory:setup" }] };
  }
  const base = `${baseUrl.replace(/\/$/, "")}/`;
  const checks = [];
  const check = (name, ok, detail) => checks.push({ name, ok: Boolean(ok), ...(detail === undefined ? {} : { detail }) });
  let hint;
  let reason;
  const report = () => ({ session, ok: checks.every((c) => c.ok), url: baseUrl, urlSource, ...(reason ? { reason } : {}), checks, ...(hint ? { hint } : {}) });
  if (!session || !/^[A-Za-z0-9_-]{1,80}$/.test(session)) {
    check("session_id_valid", false, "--session requerido");
    return report();
  }

  let local = null;
  const localPath = path.resolve(file || path.join(root, "output", "sessions", `${session}.json`));
  try { local = JSON.parse(await readFile(localPath, "utf8")); } catch { /* checked below */ }
  check("local_file_exists", local, localPath);
  const entries = Array.isArray(local?.transcript) ? local.transcript : [];
  if (local) {
    check("init_present", local.sessionId === session && Boolean(local.principal?.agentId), "sessionId y principal.agentId");
    check("principal_host_issued", local.principal?.identitySource === "host-issued", local.principal?.identitySource ?? null);
    if (requireClose) check("closed", local.kind && local.kind !== "working", local.kind ?? null);
    check("min_events", entries.length >= minEvents, { required: minEvents, local: entries.length });
    if (requireRegistration) {
      check("agent_registered_present", entries.some((e) => e?.parsed?.event === "agent_registered"));
    }
  }

  // The API keys a session by externalKey: first runId of the file, or the session name for legacy imports.
  const keys = new Set([session, entries[0]?.runId].filter(Boolean));
  let match = null;
  try {
    const sessions = await getJson(fetchImpl, new URL("api/sessions", base).toString(), timeoutMs);
    if (!Array.isArray(sessions)) throw new Error("respuesta inesperada de /api/sessions");
    match = sessions.find((s) => keys.has(s.externalKey) || s.id === session) ?? null;
    check("api_reachable", true);
  } catch (error) {
    check("api_reachable", false, error?.name === "TimeoutError" ? "timeout" : String(error?.message ?? error));
    return { ...report(), api: null };
  }
  if (probe !== false) {
    const own = await probeInstance({ baseUrl, fetchImpl, ...probe });
    check("own_instance", own.instance === "own", own.instance === "own" ? undefined : own.detail);
    if (own.instance !== "own") {
      reason = own.reason;
      hint = "El observatorio en esta URL no pertenece a este checkout (o no se pudo comprobar). No es evidencia de visibilidad. Apunta a otra URL (--base-url / ODRADEK_BASE_URL) o levanta esta copia en otro puerto con consentimiento del usuario.";
      return { ...report(), api: null };
    }
  }

  check("visible_in_api", match, match ? { id: match.id, externalKey: match.externalKey } : `sin sesión con externalKey en [${[...keys].join(", ")}]`);
  if (!match) {
    hint = "El servicio responde pero no muestra la sesión. Causa probable: el bind mount ./agent-kit/output:/watched:ro del contenedor apunta a un directorio viejo (output/ recreado) o el watcher no la importó. Reintenta una vez; si persiste, diagnostica sin reiniciar y pide decisión al usuario antes de recrear el contenedor. Resultado: FALLÓ, observabilidad no verificada.";
    return { ...report(), api: null };
  }

  if (requireClose) check("api_status_terminal", match.status && match.status !== "working", match.status);
  try {
    const events = await getAllEvents(fetchImpl, base, match.id, timeoutMs);
    check("api_events_min", events.length >= minEvents, { required: minEvents, api: events.length });
    if (local) check("api_events_match_local", events.length === entries.length, { api: events.length, local: entries.length });
    if (requireRegistration) check("api_agent_registered", events.some((e) => e.payload?.parsed?.event === "agent_registered"));
  } catch (error) {
    check("api_events_readable", false, String(error?.message ?? error));
  }
  return { ...report(), api: { id: match.id, status: match.status, eventCount: match.eventCount, agentCount: match.agentCount } };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { baseUrl, source } = await resolveBaseUrl({ baseUrl: options.baseUrl });
  const result = await verifySession({
    baseUrl,
    urlSource: source,
    session: typeof options.session === "string" ? options.session : undefined,
    file: typeof options.out === "string" ? options.out : undefined,
    requireClose: !options.noClose,
    minEvents: options.minEvents ? Number(options.minEvents) : 1,
    requireRegistration: Boolean(options.requireRegistration),
  });
  console.log(JSON.stringify(result, null, 2));
  process.exitCode = result.ok ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
