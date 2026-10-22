#!/usr/bin/env node
import { mkdir, open, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sessionsDir = path.join(root, "output", "sessions");
const redact = (value) => String(value ?? "")
  .replace(/((?:api[_-]?key|token|password|secret)\s*[:=]\s*)[^\s,;]+/gi, "$1[REDACTED]")
  .replace(/(?:sk-[A-Za-z0-9_-]{16,})/g, "[REDACTED]")
  .replace(/(Bearer\s+)[A-Za-z0-9._-]+/gi, "$1[REDACTED]");

const BUILTIN_PROFILES = ["product-analyst", "architect", "devops", "engineer", "reviewer", "supervisor", "principal", "qa", "ux"];
const PLACEHOLDER_ID = /^(placeholder|todo|tbd|unknown|none|null|undefined|example|test|xxx+|n\/a|agent|subagent)$|^<.*>$|^host[-_ ]?(principal|architect|agent|subagent)?[-_ ]?id$|^host_/i;

/** Profile keys under `agents:` in config/agents.yaml (the source of truth). */
export async function profilesFromYaml(file = path.join(root, "config", "agents.yaml")) {
  const names = new Set();
  let inAgents = false;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    if (/^agents:\s*$/.test(line)) { inAgents = true; continue; }
    if (inAgents && /^\S/.test(line) && !line.startsWith("#")) break;
    const match = inAgents && line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (match) names.add(match[1]);
  }
  if (!names.size) throw new Error(`No se encontraron perfiles en ${file}`);
  return names;
}

/** Small dependency-free reader for the identity fields published by agents.yaml. */
export async function profileDetailsFromYaml(file = path.join(root, "config", "agents.yaml")) {
  const result = new Map(); let current;
  for (const line of (await readFile(file, "utf8")).split(/\r?\n/)) {
    const profile = line.match(/^ {2}([A-Za-z0-9_-]+):\s*$/);
    if (profile) { current=profile[1]; result.set(current,{}); continue; }
    if (!current) continue;
    const display=line.match(/^ {4}displayName:\s*(.+)$/); if(display) result.get(current).displayName=display[1].trim();
    const model=line.match(/^ {4}model:\s*(.+)$/); if(model) result.get(current).configuredModel=model[1].trim();
    const skills=line.match(/^ {4}skills:\s*\[(.*)\]\s*$/); if(skills) result.get(current).declaredSkills=skills[1].split(",").map((x)=>x.trim()).filter(Boolean);
  }
  return result;
}

// Names that are never valid IDs: profiles from agents.yaml plus generic role words.
async function knownProfiles() {
  return new Set([...BUILTIN_PROFILES, ...(await profilesFromYaml())]);
}

/** Rejects IDs that are visibly not host-issued. It cannot prove an ID is real. */
export function assertRealAgentId(id, { profiles = new Set(BUILTIN_PROFILES), session, label = "ID" } = {}) {
  const value = String(id ?? "").trim();
  if (!value || value === "true") throw new Error(`${label} requerido: debe ser el ID emitido por el host`);
  if (PLACEHOLDER_ID.test(value)) throw new Error(`${label} "${value}" es un placeholder, no un ID emitido por el host`);
  if (profiles.has(value.toLowerCase())) throw new Error(`${label} "${value}" es un nombre de perfil, no un ID emitido por el host`);
  if (session && value === session) throw new Error(`${label} no puede derivarse del nombre de sesión`);
  return value;
}

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

async function assertNewSession(file) {
  try {
    await readFile(file, "utf8");
    throw new Error(`La sesión ya existe y no se reinicializó: ${file}`);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function writeTranscript(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temp, file);
}

export async function runWriter(argv, { log = console.log } = {}) {
  const [command = "help", ...rest] = argv;
  const options = argsOf(rest);
  const session = options.session && String(options.session);
  if (!options.out && (!session || !/^[A-Za-z0-9_-]{1,80}$/.test(session))) {
    throw new Error("Indica --session con letras, números, guiones o guiones bajos (máximo 80 caracteres)");
  }
  const file = path.resolve(String(options.out || process.env.ODRADEK_TRANSCRIPT_PATH || path.join(sessionsDir, `${session}.json`)));
  const release = await lockFile(file);
  try {
    if (command === "init") {
      await assertNewSession(file);
      for (const key of ["principal", "provider", "identitySource"]) {
        if (!options[key] || options[key] === true) throw new Error(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} es obligatorio para init`);
      }
      if (options.identitySource !== "host-issued") {
        throw new Error('--identity-source debe ser exactamente "host-issued"');
      }
      assertRealAgentId(options.principal, { profiles: await knownProfiles(), session, label: "--principal" });
      const transcript = {
        kind: "working",
        goal: redact(options.goal || "Sesión Odradek"),
        sessionId: redact(session),
        transcript: [],
      };
      if (options.mode) transcript.mode = redact(options.mode);
      transcript.principal = {
        agentId: redact(options.principal),
        provider: redact(options.provider),
        identitySource: "host-issued",
        profile: "principal",
        displayName: redact(options.displayName || "Principal"),
        task: redact(options.goal || "Sesión Odradek"),
        configuredModel: redact(options.model || "host-selected"),
        declaredSkills: [],
      };
      await writeTranscript(file, transcript);
      log(file);
      return;
    }

    const transcript = await readTranscript(file);
    if (!Array.isArray(transcript.transcript)) transcript.transcript = [];

    if (command === "close") {
      transcript.kind = redact(options.kind || "done");
    } else if (command === "agent_registered") {
      const profiles = await knownProfiles();
      const agentId = redact(assertRealAgentId(options.agent, { profiles, session, label: "--agent" }));
      for (const key of ["provider", "profile", "task"]) {
        if (!options[key] || options[key] === true) throw new Error(`--${key} es obligatorio para agent_registered`);
      }
      const yamlProfiles = await profilesFromYaml();
      if (!yamlProfiles.has(String(options.profile))) {
        throw new Error(`--profile "${options.profile}" no es un perfil conocido de agents.yaml (válidos: ${[...yamlProfiles].join(", ")})`);
      }
      const profileDetails = (await profileDetailsFromYaml()).get(String(options.profile)) || {};
      const summary = redact(`Registro de agente ${options.profile}: ${options.task}`);
      const event = {
        runId: redact(options.runId || `${agentId}-registered-${Date.now()}`),
        round: transcript.transcript.length + 1,
        agentId,
        at: new Date().toISOString(),
        rawText: summary,
        parsed: {
          status: "registered",
          summary,
          event: "agent_registered",
          provider: redact(options.provider),
          profile: redact(options.profile),
          displayName: redact(options.displayName || profileDetails.displayName || options.profile),
          task: redact(options.task),
          configuredModel: redact(options.model || profileDetails.configuredModel || "host-selected"),
          declaredSkills: (profileDetails.declaredSkills || []).map(redact),
          evidenceLevel: "declared",
        },
      };
      const parent = options.parent || transcript.principal?.agentId;
      if (parent && parent !== true) {
        event.parentAgentId = redact(assertRealAgentId(parent, { profiles, session, label: "--parent" }));
      }
      transcript.transcript.push(event);
    } else if (command === "turn") {
      const agentId = redact(options.agent || "unknown");
      const summary = redact(options.summary || options.raw || "Turno de agente");
      const status = redact(options.status || "continue");
      const event = {
        runId: redact(options.runId || `${agentId}-${Date.now()}`),
        round: transcript.transcript.length + 1,
        agentId,
        at: new Date().toISOString(),
        rawText: redact(options.raw || summary),
        parsed: { status, summary },
      };
      if (options.parent) event.parentAgentId = redact(options.parent);
      if (options.from && options.to) {
        event.relations = [{
          from: redact(options.from),
          to: redact(options.to),
          kind: redact(options.relation || "message"),
          source: "explicit",
          confidence: 1,
        }];
      }
      transcript.transcript.push(event);
    } else {
      log("Uso: odradek-event init|agent_registered|turn|close --session nombre [opciones]");
      return;
    }
    await writeTranscript(file, transcript);
    log(file);
  } finally {
    await release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runWriter(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
