import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cleanEvent, cleanRelation, type EventV1, type RelationV1 } from "../lib/events.js";

export type AgentTeamSession = { key:string; title:string; status:string; events:EventV1[]; relations:RelationV1[] };
type RawEntry = { agentId?: unknown; parsed?: Record<string, unknown>; relations?: unknown; parentAgentId?: unknown; parent?: unknown };
const text = (value: unknown): string | undefined => typeof value === "string" && value.trim() ? value.trim() : undefined;

/**
 * Accept common relation spellings used by local runtimes while exposing one
 * stable contract to the store. Bad optional annotations are ignored so old
 * or partially-written transcripts remain importable.
 */
function relationFrom(raw: unknown, currentAgent: string, sequence: number, metadata: Record<string, unknown>): RelationV1 | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const value = raw as Record<string, unknown>;
  const sourceHint = text(value.source);
  const source = text(value.from) || text(value.fromAgent) || text(value.fromAgentId) || text(value.parent) || text(value.parentAgentId) || text(value.sourceAgent) || (sourceHint && !["explicit", "inferred"].includes(sourceHint) ? sourceHint : undefined) || currentAgent;
  const target = text(value.target) || text(value.to) || text(value.toAgent) || text(value.toAgentId) || text(value.child) || text(value.childAgentId);
  if (!source || !target || source === target) return undefined;
  const kind = text(value.kind) || text(value.relation) || text(value.type) || "handoff";
  const provenance = text(value.provenance) || (["explicit", "inferred"].includes(sourceHint || "") ? sourceHint : undefined) || "explicit";
  const confidenceValue = typeof value.confidence === "number" ? value.confidence : 1;
  const sequenceStart = typeof value.sequenceStart === "number" ? value.sequenceStart : sequence;
  const sequenceEnd = typeof value.sequenceEnd === "number" ? value.sequenceEnd : sequenceStart;
  try { return cleanRelation({source,target,kind,provenance,confidence:confidenceValue,metadata,sequenceStart,sequenceEnd}); } catch { return undefined; }
}

function collectRelations(entry: RawEntry, sequence: number): RelationV1[] {
  const currentAgent = text(entry.agentId) || "unknown";
  const relations: RelationV1[] = [];
  (Array.isArray(entry.relations) ? entry.relations : []).forEach((relation, index) => {
    const parsed = relationFrom(relation, currentAgent, sequence, {signal:"entry.relations", index});
    if (parsed) relations.push(parsed);
  });
  const parent = text(entry.parentAgentId) || text(entry.parent);
  if (parent) {
    const parsed = relationFrom({source:parent,target:currentAgent,kind:"delegation"},currentAgent,sequence,{signal:"parentAgentId"});
    if (parsed) relations.push(parsed);
  }
  const parsedTurn = entry.parsed || {};
  for (const [field, kind] of [["nextSpeaker","delegation"],["suggestedNextSpeaker","handoff"]] as const) {
    const target = text(parsedTurn[field]);
    if (!target) continue;
    const parsed = relationFrom({source:currentAgent,target,kind},currentAgent,sequence,{signal:`parsed.${field}`});
    if (parsed) relations.push(parsed);
  }
  (Array.isArray(parsedTurn.questionsFor) ? parsedTurn.questionsFor : []).forEach((question, index) => {
    if (!question || typeof question !== "object") return;
    const value = question as Record<string, unknown>; const target = text(value.to);
    if (!target) return;
    const parsed = relationFrom({source:currentAgent,target,kind:"message"},currentAgent,sequence,{signal:"parsed.questionsFor.to",index,text:text(value.text)});
    if (parsed) relations.push(parsed);
  });
  const deduped = new Map<string, RelationV1>();
  for (const relation of relations) {
    const key = `${relation.source}\u0000${relation.target}\u0000${relation.kind}\u0000${relation.sequenceStart ?? sequence}`;
    if (!deduped.has(key)) deduped.set(key, relation);
  }
  return [...deduped.values()];
}

/** Adapter for agent-team's documented explicit local session outputs. */
export async function agentTeamEvents(file: string): Promise<AgentTeamSession> {
  if (path.extname(file) !== ".json") throw new Error("Only JSON transcript files are accepted by the local detector");
  const info=await stat(file); if (info.size > 5_000_000) throw new Error("Transcript exceeds 5 MB limit");
  const data=JSON.parse(await readFile(file,"utf8"));
  const transcript=Array.isArray(data.transcript)?data.transcript:[];
  const key=String(transcript[0]?.runId || `${info.mtimeMs}:${info.size}`);
  const events=transcript.map((entry: RawEntry,index:number)=>{
    const relations = collectRelations(entry,index);
    return cleanEvent({externalKey:`${key}:${index}`,sequence:index,type:"agent.turn",agent:{key:String(entry.agentId||"unknown"),name:String(entry.agentId||"Unknown")},status:entry.parsed?.status || "unknown",occurredAt:(entry as any).at,summary:entry.parsed?.summary,content:(entry as any).rawText,payload:{round:(entry as any).round,parsed:entry.parsed},relations});
  });
  return {key,title:String(data.goal || "agent-team session"),status:String(data.kind || "unknown"),events,relations:events.flatMap((event: EventV1) => event.relations || [])};
}
