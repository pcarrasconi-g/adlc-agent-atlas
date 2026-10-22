#!/usr/bin/env node
import { parseArgs, probeInstance, resolveBaseUrl } from "./odradek-instance.mjs";

export function projectsUrl(baseUrl) {
  return new URL("api/projects", `${baseUrl.replace(/\/$/, "")}/`).toString();
}

/**
 * service: healthy_own | healthy_foreign | healthy_unknown | unavailable.
 * Only healthy_own may proceed to `starting`; the others exit non-zero.
 */
export async function checkObservatory({
  baseUrl,
  urlSource = "caller",
  timeoutMs = Number(process.env.ODRADEK_CHECK_TIMEOUT_MS || 1500),
  fetchImpl = fetch,
  probe = {},
} = {}) {
  if (!baseUrl) ({ baseUrl, source: urlSource } = await resolveBaseUrl());
  const url = projectsUrl(baseUrl);
  const base = { url, urlSource };
  if (urlSource === "default") {
    return { service: "unavailable", ...base, reason: "setup_required", detail: "ODRADEK_PORT no definido en <ODRADEK_ROOT>/.env: ejecuta `npm --prefix agent-kit run observatory:setup`. No se asume 8090." };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { headers: { accept: "application/json" }, signal: controller.signal });
    if (!response.ok) return { service: "unavailable", ...base, reason: `HTTP ${response.status}` };
    if (!Array.isArray(await response.json())) return { service: "unavailable", ...base, reason: "unexpected response" };
  } catch (error) {
    return { service: "unavailable", ...base, reason: error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "connection failed" };
  } finally {
    clearTimeout(timer);
  }
  if (probe === false) return { service: "healthy_unknown", ...base, reason: "instance_unknown", detail: "probe desactivado" };
  const result = await probeInstance({ baseUrl, fetchImpl, ...probe });
  if (result.instance === "own") return { service: "healthy_own", ...base };
  return {
    service: result.instance === "foreign" ? "healthy_foreign" : "healthy_unknown",
    ...base, reason: result.reason, detail: result.detail,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const { baseUrl, source } = await resolveBaseUrl({ baseUrl: options.baseUrl });
  const result = await checkObservatory({ baseUrl, urlSource: source });
  console.log(JSON.stringify(result));
  process.exitCode = result.service === "healthy_own" ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
