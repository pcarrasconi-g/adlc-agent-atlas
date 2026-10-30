// Turns a recorded session file into the static data the web app can open with
// no server: the same events, agents and edges the API would have served.
//   npx tsx src/freeze-demo.ts <session.json> <out/demo.json>
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { agentTeamEvents } from "./detectors/agent-team.js";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("usage: freeze-demo.ts <session.json> <out/demo.json>");
  process.exit(2);
}
const id = "demo:atlas";
const session = await agentTeamEvents(input);
const events = session.events.map((e) => ({
  id: `${id}:${e.externalKey}`, sessionId: id, agentId: e.agent?.key ?? null, agentName: e.agent?.name ?? null, agentKey: e.agent?.key ?? null,
  externalKey: e.externalKey, schemaVersion: e.schemaVersion, type: e.type, status: e.status ?? null, sequence: e.sequence,
  timestamp: e.occurredAt ?? null, summary: e.summary ?? null, content: e.content ?? null,
  payload: { ...(e.payload ?? {}), relations: e.relations ?? [] }, createdAt: e.occurredAt ?? null,
}));
const projectionEvents = session.events.map((e) => {
  const a = e.agent;
  return {
    id: `${id}:${e.externalKey}`, sequence: e.sequence, type: e.type, status: e.status ?? null, agentId: a?.key ?? null, agentKey: a?.key ?? null,
    agentName: a?.name ?? null, agentRole: a?.role ?? null, agentProfile: a?.profile ?? null, agentDisplayName: a?.displayName ?? null,
    agentProvider: a?.provider ?? null, agentTask: a?.task ?? null, agentConfiguredModel: a?.configuredModel ?? null,
    agentDeclaredSkills: a?.declaredSkills ?? [], agentEvidenceLevel: a?.evidenceLevel ?? "unverifiable", agentIsPrincipal: Boolean(a?.isPrincipal),
    timestamp: e.occurredAt ?? null, summary: e.summary ?? null,
  };
});
const edges = session.events.flatMap((e) =>
  (e.relations ?? []).map((r, i) => ({
    id: `${e.externalKey}:${i}`, source: r.source, target: r.target, relation: r.kind, eventId: `${id}:${e.externalKey}`, sequence: e.sequence,
    provenance: r.provenance, confidence: r.confidence, metadata: r.metadata ?? {}, sequenceStart: r.sequenceStart ?? e.sequence, sequenceEnd: r.sequenceEnd ?? e.sequence,
  })),
);
const times = events.map((e) => e.timestamp).filter(Boolean) as string[];
const demo = {
  schema: "atlas.demo.v1",
  label: "Recorded demo",
  session: {
    id, projectId: "demo", externalKey: session.key, title: session.title, status: session.status, startedAt: times[0], updatedAt: times.at(-1),
    projectName: "Recorded demo", agentCount: new Set(events.map((e) => e.agentId)).size, eventCount: events.length, isDemo: true,
  },
  events, projectionEvents, edges,
};
mkdirSync(path.dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(demo)}\n`);
console.log(`${events.length} events, ${edges.length} edges -> ${output}`);
