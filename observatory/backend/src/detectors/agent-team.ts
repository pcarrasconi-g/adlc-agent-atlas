import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { cleanEvent, cleanRelation, type AgentV1, type EventV1, type RelationV1 } from "../lib/events.js";

export type AgentTeamSession = { key:string; canonicalKey:boolean; title:string; status:string; events:EventV1[]; relations:RelationV1[] };
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

// Check (gate) and task events keep their own type so the UI can tell what was
// verified; every other entry stays a plain agent turn.
const eventType = (event: unknown) => {
  const value = text(event);
  if (value === "agent_registered") return "agent.registered";
  return value && /^(gate\.(started|finished)|task\.(created|completed)|guard\.blocked|checkpoint)$/.test(value) ? value : "agent.turn";
};

/** Adapter for agent-team's documented explicit local session outputs. */
export async function agentTeamEvents(file: string): Promise<AgentTeamSession> {
  if (path.extname(file) !== ".json") throw new Error("Only JSON transcript files are accepted by the local detector");
  const info=await stat(file); if (info.size > 5_000_000) throw new Error("Transcript exceeds 5 MB limit");
  const data=JSON.parse(await readFile(file,"utf8"));
  const transcript=Array.isArray(data.transcript)?data.transcript:[];
  const sessionId=text(data.sessionId);
  const key=String(sessionId || transcript[0]?.runId || `legacy:${path.basename(file)}`);
  const metadata = new Map<string,AgentV1>();
  const principalId=text(data.principal?.agentId);
  if (principalId) metadata.set(principalId,{key:principalId,name:text(data.principal?.displayName)||"Principal",displayName:text(data.principal?.displayName)||"Principal",role:"Principal",profile:text(data.principal?.profile)||"principal",provider:text(data.principal?.provider),task:text(data.principal?.task)||text(data.goal),configuredModel:text(data.principal?.configuredModel),declaredSkills:Array.isArray(data.principal?.declaredSkills)?data.principal.declaredSkills.filter((x:unknown)=>typeof x==="string"):[],evidenceLevel:data.principal?.identitySource==="host-issued"?"host-recorded":"unverifiable",isPrincipal:true});
  for (const entry of transcript) {
    const id=text(entry.agentId); const parsed=entry.parsed||{}; if (!id) continue;
    if (text(parsed.event)==="agent_registered" || text(parsed.profile)) { const level=text(parsed.evidenceLevel); metadata.set(id,{key:id,name:text(parsed.displayName)||text(parsed.profile)||id,displayName:text(parsed.displayName)||text(parsed.profile)||id,role:text(parsed.displayName)||text(parsed.profile),profile:text(parsed.profile),provider:text(parsed.provider),task:text(parsed.task),configuredModel:text(parsed.configuredModel),declaredSkills:Array.isArray(parsed.declaredSkills)?parsed.declaredSkills.filter((x:unknown)=>typeof x==="string"):[],evidenceLevel:level==="declared"||level==="host-recorded"||level==="behavior-evidenced"||level==="unverifiable"?level:"unverifiable"}); }
  }
  const offset=principalId?1:0;
  const events:EventV1[]=[];
  if (principalId) events.push(cleanEvent({externalKey:`${key}:principal`,sequence:0,type:"session.principal",agent:metadata.get(principalId),status:"registered",summary:"Principal de la sesión",payload:{identitySource:data.principal?.identitySource}}));
  events.push(...transcript.map((entry: RawEntry,index:number)=>{
    const relations = collectRelations(entry,index+offset);
    const id=String(entry.agentId||"unknown"); const agent=metadata.get(id)||{key:id,name:id,evidenceLevel:"unverifiable" as const};
    return cleanEvent({externalKey:`${key}:${index}`,sequence:index+offset,type:eventType(entry.parsed?.event),agent,status:entry.parsed?.status || "unknown",occurredAt:(entry as any).at,summary:entry.parsed?.summary,content:(entry as any).rawText,payload:{round:(entry as any).round,parsed:entry.parsed},relations});
  }));
  return {key,canonicalKey:Boolean(sessionId),title:String(data.goal || "agent-team session"),status:String(data.kind || "unknown"),events,relations:events.flatMap((event: EventV1) => event.relations || [])};
}
