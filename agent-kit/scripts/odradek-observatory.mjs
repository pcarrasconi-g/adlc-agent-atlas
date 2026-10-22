#!/usr/bin/env node

const DEFAULT_BASE_URL = "http://127.0.0.1:8090";

export function projectsUrl(baseUrl = DEFAULT_BASE_URL) {
  return new URL("api/projects", `${baseUrl.replace(/\/$/, "")}/`).toString();
}

export async function checkObservatory({
  baseUrl = process.env.ODRADEK_URL || DEFAULT_BASE_URL,
  timeoutMs = Number(process.env.ODRADEK_CHECK_TIMEOUT_MS || 1500),
  fetchImpl = fetch,
} = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const url = projectsUrl(baseUrl);
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) {
      return { service: "unavailable", url, reason: `HTTP ${response.status}` };
    }
    const body = await response.json();
    if (!Array.isArray(body)) {
      return { service: "unavailable", url, reason: "unexpected response" };
    }
    return { service: "healthy", url };
  } catch (error) {
    const reason = error?.name === "AbortError" ? "timeout" : "connection failed";
    return { service: "unavailable", url, reason };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const result = await checkObservatory();
  console.log(JSON.stringify(result));
  process.exitCode = result.service === "healthy" ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
