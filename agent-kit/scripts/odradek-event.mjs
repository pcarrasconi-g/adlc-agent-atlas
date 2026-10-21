#!/usr/bin/env node
import { mkdir, open, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionsDir = path.join(root, "output", "sessions");
const redact = (value) => String(value ?? "")
  .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
  .replace(/(?:sk-[A-Za-z0-9_-]{16,})/g, "[REDACTED]")
  .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]");

function argsOf(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    out[key] = argv[i + 1]?.startsWith("--") ? true : (argv[++i] ?? true);
  }
  return out;
}

async function lockFile(file) {
  const lock = `${file}.lock`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await open(lock, "wx");
      return async () => { await handle.close(); await rm(lock, { force: true }); };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`No se pudo obtener el lock de ${file}`);
}

async function readTranscript(file) {
  try { return JSON.parse(await readFile(file, "utf8")); }
  catch { return { kind: "working", goal: "Sesión Odradek", transcript: [] }; }
}

async function writeTranscript(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
}

async function main() {
  const [command = "help", ...rest] = process.argv.slice(2);
  const options = argsOf(rest);
  const session = options.session && String(options.session);
  if (!options.out && (!session || !/^[A-Za-z0-9_-]{1,80}$/.test(session))) {
    throw new Error("Indica --session con letras, números, guiones o guiones bajos (máximo 80 caracteres)");
  }
  const file = path.resolve(String(options.out || process.env.ODRADEK_TRANSCRIPT_PATH || path.join(sessionsDir, `${session}.json`)));
  const release = await lockFile(file);
  try {
    const transcript = await readTranscript(file);
    if (!Array.isArray(transcript.transcript)) transcript.transcript = [];

    if (command === "init") {
      transcript.kind = "working";
      transcript.goal = redact(options.goal || transcript.goal || "Sesión Odradek");
      transcript.sessionId = session || transcript.sessionId;
      transcript.transcript = [];
    } else if (command === "close") {
      transcript.kind = String(options.kind || "done");
    } else if (command === "turn") {
      const agentId = String(options.agent || "unknown");
      const summary = redact(options.summary || options.raw || "Turno de agente");
      const status = String(options.status || "continue");
      const event = {
        runId: String(options.runId || `${agentId}-${Date.now()}`),
        round: transcript.transcript.length + 1,
        agentId,
        at: new Date().toISOString(),
        rawText: redact(options.raw || summary),
        parsed: { status, summary },
      };
      if (options.parent) event.parentAgentId = String(options.parent);
      if (options.from && options.to) {
        event.relations = [{
          from: String(options.from),
          to: String(options.to),
          kind: String(options.relation || "message"),
          source: "explicit",
          confidence: 1,
        }];
      }
      transcript.transcript.push(event);
    } else {
      console.log("Uso: odradek-event init|turn|close --session nombre [opciones]");
      return;
    }
    await writeTranscript(file, transcript);
    console.log(file);
  } finally {
    await release();
  }
}

main().catch((error) => { console.error(error.message); process.exit(1); });
