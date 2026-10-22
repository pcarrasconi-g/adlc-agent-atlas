import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { agentTeamEvents } from "../src/detectors/agent-team.js";

test("normalizes an agent-team transcript into versioned events", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"aw-")); const file=path.join(dir,"session.json");
  await writeFile(file,JSON.stringify({kind:"done",goal:"demo",transcript:[{runId:"r1",round:1,agentId:"architect",rawText:"token=secret",at:"2026-01-01T00:00:00.000Z",parsed:{status:"done",summary:"ready"}}]}));
  const got=await agentTeamEvents(file);
  assert.equal(got.key,"r1"); assert.equal(got.canonicalKey,false); assert.equal(got.events[0].schemaVersion,"aw.event.v1"); assert.doesNotMatch(got.events[0].content!,/secret/);
});

test("uses sessionId from init, materializes the principal, and preserves declared registration metadata", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"aw-")); const file=path.join(dir,"identity.json");
  await writeFile(file,JSON.stringify({sessionId:"stable-session",kind:"working",goal:"Improve identity",principal:{agentId:"principal-uuid",provider:"cursor",displayName:"Principal",identitySource:"host-issued"},transcript:[
    {runId:"changing-run-id",agentId:"worker-uuid",parentAgentId:"principal-uuid",parsed:{event:"agent_registered",status:"registered",profile:"engineer",displayName:"Software Engineer",provider:"cursor",task:"Implement metadata",configuredModel:"host-selected",declaredSkills:["safe-workspace-and-guardrails"],evidenceLevel:"unverifiable"}}
  ]}));
  const got=await agentTeamEvents(file);
  assert.equal(got.key,"stable-session"); assert.equal(got.canonicalKey,true);
  assert.equal(got.events[0].type,"session.principal"); assert.equal(got.events[0].agent?.isPrincipal,true);
  assert.equal(got.events[1].agent?.displayName,"Software Engineer");
  assert.deepEqual(got.events[1].agent?.declaredSkills,["safe-workspace-and-guardrails"]);
  assert.equal(got.events[1].agent?.evidenceLevel,"unverifiable");
  assert.equal(got.relations.length,1);
  assert.equal(got.relations[0].sequenceStart,1);
  assert.equal(got.events[1].sequence,1);
});

test("legacy registration without evidence does not claim host verification",async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),"aw-")); const file=path.join(dir,"legacy-evidence.json");
  await writeFile(file,JSON.stringify({goal:"legacy",transcript:[{runId:"legacy-run",agentId:"legacy-agent",parsed:{event:"agent_registered",profile:"reviewer",status:"registered"}}]}));
  const got=await agentTeamEvents(file); assert.equal(got.events[0].agent?.evidenceLevel,"unverifiable");
});

test("extracts explicit delegation and conversation signals without breaking old transcripts", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"aw-")); const file=path.join(dir,"session.json");
  await writeFile(file,JSON.stringify({kind:"done",goal:"relations",transcript:[
    {runId:"r2",round:1,agentId:"orchestrator",rawText:"delegates",at:"2026-01-01T00:00:00.000Z",relations:[{from:"orchestrator",to:"analyst",kind:"delegation",source:"explicit",metadata:{token:"secret"}}],parsed:{status:"continue",summary:"start",suggestedNextSpeaker:"builder"}},
    {runId:"r2",round:2,agentId:"analyst",rawText:"asks",at:"2026-01-01T00:00:01.000Z",parsed:{status:"blocked",summary:"wait",questionsFor:[{to:"orchestrator",text:"please clarify"}]}}
  ]}));
  const got=await agentTeamEvents(file);
  assert.equal(got.relations.length,3);
  assert.deepEqual(got.relations.map((relation) => `${relation.source}->${relation.target}:${relation.kind}`),[
    "orchestrator->analyst:delegation", "orchestrator->builder:handoff", "analyst->orchestrator:message"
  ].filter((value, index, all) => all.indexOf(value) === index));
  assert.doesNotMatch(JSON.stringify(got.relations),/secret/);
});

test("accepts an isolated explicit Odradek session file", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"aw-")); const file=path.join(dir,"release-review.json");
  await writeFile(file,JSON.stringify({kind:"working",goal:"release review",transcript:[
    {runId:"release-r1",round:1,agentId:"reviewer",rawText:"token=not-for-storage",at:"2026-01-01T00:00:00.000Z",relations:[{from:"orchestrator",to:"reviewer",kind:"delegation"}],parsed:{status:"working",summary:"started"}}
  ]}));
  const got=await agentTeamEvents(file);
  assert.equal(got.key,"release-r1");
  assert.equal(got.events[0].relations?.[0].kind,"delegation");
  assert.doesNotMatch(JSON.stringify(got.events),/not-for-storage/);
});

test("turns an agent_registered parent signal into one delegation edge", async () => {
  const dir=await mkdtemp(path.join(tmpdir(),"aw-")); const file=path.join(dir,"registration.json");
  await writeFile(file,JSON.stringify({kind:"working",goal:"registration",transcript:[
    {runId:"registration-r1",round:1,agentId:"host-agent-id",parentAgentId:"host-principal-id",parsed:{event:"agent_registered",status:"registered",profile:"engineer"}}
  ]}));
  const got=await agentTeamEvents(file);
  assert.deepEqual(got.relations.map((relation) => `${relation.source}->${relation.target}:${relation.kind}`),[
    "host-principal-id->host-agent-id:delegation"
  ]);
});
