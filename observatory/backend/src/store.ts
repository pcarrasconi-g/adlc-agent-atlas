import type { Pool } from "pg"; import type { EventV1, RelationV1 } from "./lib/events.js"; import { hash } from "./lib/events.js";
export class Store { constructor(private db:Pool, private publish:(x:unknown)=>void) {}
 async ingest(sourceId:string, session:{key:string;title:string;status:string;events:EventV1[]}) {
  const c=await this.db.connect(); try { await c.query("BEGIN");
   const p=await c.query("INSERT INTO projects(name,source_kind) VALUES($1,'agent-team') ON CONFLICT(name,source_kind) DO UPDATE SET name=EXCLUDED.name RETURNING id",["agent-team"]); const projectId=p.rows[0].id;
   const sr=await c.query(`INSERT INTO sessions(project_id,source_id,external_key,title,status,started_at,updated_at) VALUES($1,$2,$3,$4,$5,now(),now()) ON CONFLICT(source_id,external_key) DO UPDATE SET title=excluded.title,status=excluded.status,updated_at=now() RETURNING id`,[projectId,sourceId,session.key,session.title,session.status]); const sid=sr.rows[0].id;
   const agentIds = new Map<string,string>();
   const ensureAgent = async (key:string, name = key, role:string|null = null) => {
    const existing = agentIds.get(key); if (existing) return existing;
    const ar=await c.query(`INSERT INTO agents(session_id,external_key,name,role) VALUES($1,$2,$3,$4) ON CONFLICT(session_id,external_key) DO UPDATE SET name=COALESCE(NULLIF(excluded.name,''),agents.name),role=COALESCE(excluded.role,agents.role) RETURNING id`,[sid,key,name,role]);
    agentIds.set(key,ar.rows[0].id); return ar.rows[0].id;
   };
   const eventRows:{event:EventV1; id:string; agentId?:string}[]=[];
   for (const e of session.events) { let aid: string|undefined;
    if(e.agent) aid=await ensureAgent(e.agent.key,e.agent.name,e.agent.role||null);
    const er=await c.query(`INSERT INTO events(session_id,agent_id,external_key,schema_version,event_type,status,sequence,occurred_at,summary,content,payload,content_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(session_id,external_key) DO UPDATE SET agent_id=excluded.agent_id,status=excluded.status,sequence=excluded.sequence,occurred_at=excluded.occurred_at,summary=excluded.summary,content=excluded.content,payload=excluded.payload,content_hash=excluded.content_hash RETURNING id`,[sid,aid,e.externalKey,e.schemaVersion,e.type,e.status||null,e.sequence,e.occurredAt||null,e.summary||null,e.content||null,JSON.stringify({...e.payload||{},relations:e.relations||[]}),hash(JSON.stringify(e))]);
    eventRows.push({event:e,id:er.rows[0].id,agentId:aid});
   }
   // Edges are a projection of the current transcript. Rebuild them on each
   // import so a later transcript with explicit causal metadata cannot retain
   // stale chronological fallback edges from an earlier import.
   await c.query("DELETE FROM edges WHERE session_id=$1",[sid]);
   const explicitRelations = eventRows.some(({event}) => Boolean(event.relations?.length));
   if (explicitRelations) {
    for (const {event,id:eventId} of eventRows) for (const relation of event.relations || []) {
     const from = await ensureAgent(relation.source);
     const to = await ensureAgent(relation.target);
     await c.query(`INSERT INTO edges(session_id,from_agent_id,to_agent_id,event_id,relation,provenance,confidence,metadata,sequence_start,sequence_end) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(session_id,from_agent_id,to_agent_id,relation,event_id) DO UPDATE SET provenance=excluded.provenance,confidence=excluded.confidence,metadata=excluded.metadata,sequence_start=excluded.sequence_start,sequence_end=excluded.sequence_end`,[sid,from,to,eventId,relation.kind,relation.provenance,relation.confidence,JSON.stringify(relation.metadata||{}),relation.sequenceStart ?? event.sequence,relation.sequenceEnd ?? event.sequence]);
    }
   } else {
    // Legacy transcripts have no causal metadata. Preserve the old visual
    // behavior, but label the adjacency as inferred so consumers can tell it
    // apart from a runtime-reported delegation.
    let lastAgent: string|undefined;
    for (const {event,id:eventId,agentId} of eventRows) {
     if(lastAgent && agentId && lastAgent!==agentId) await c.query(`INSERT INTO edges(session_id,from_agent_id,to_agent_id,event_id,relation,provenance,confidence,metadata,sequence_start,sequence_end) VALUES($1,$2,$3,$4,'handoff','inferred',$5,$6,$7,$8) ON CONFLICT DO NOTHING`,[sid,lastAgent,agentId,eventId,0.25,JSON.stringify({strategy:"chronological-adjacency"}),event.sequence,event.sequence]);
     if(agentId)lastAgent=agentId;
    }
   }
   await c.query("UPDATE sources SET last_seen_at=now(),last_error=NULL WHERE id=$1",[sourceId]); await c.query("COMMIT"); this.publish({type:"session.updated",sessionId:sid}); return sid;
  } catch(e){await c.query("ROLLBACK"); await this.db.query("UPDATE sources SET last_error=$1 WHERE id=$2",[String(e),sourceId]);throw e;} finally{c.release();}
 }
}
