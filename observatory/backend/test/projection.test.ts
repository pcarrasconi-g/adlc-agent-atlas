import test from "node:test";
import assert from "node:assert/strict";
import { parseAtSequence, projectSession } from "../src/lib/projection.js";

const events:any[]=[
 {id:"e0",sequence:0,type:"start",status:"running",agentId:"a",agentKey:"architect",agentName:"Architect",agentRole:null,timestamp:null,summary:null},
 {id:"e1",sequence:1,type:"handoff",status:"waiting",agentId:"a",agentKey:"architect",agentName:"Architect",agentRole:null,timestamp:null,summary:null},
 {id:"e2",sequence:2,type:"start",status:"running",agentId:"b",agentKey:"builder",agentName:"Builder",agentRole:null,timestamp:null,summary:null},
];
const edges:any[]=[{id:"l1",source:"a",target:"b",relation:"handoff",eventId:"e2",sequence:2}];
test("projection only reveals agents and edges reached by the cursor",()=>{const p=projectSession({sessionStatus:"done",events,edges,atSequence:1});assert.equal(p.nodes.length,1);assert.equal(p.links.length,0);assert.equal(p.displayStatus,"working");assert.equal(p.nodes[0].status,"waiting");});
test("terminal final snapshot is idle while retaining recorded result",()=>{const p=projectSession({sessionStatus:"done",events,edges});assert.equal(p.displayStatus,"idle");assert.equal(p.recordedStatus,"done");assert.equal(p.result,"done");assert.equal(p.links.length,1);assert.deepEqual(p.nodes.map((node)=>node.status),["idle","idle"]);assert.deepEqual(p.nodes.map((node)=>node.displayStatus),["idle","idle"]);assert.deepEqual(p.nodes.map((node)=>node.recordedStatus),["waiting","running"]);assert.deepEqual(p.nodes.map((node)=>node.lastStatus),["waiting","running"]);assert.deepEqual(p.waitingOn,[]);});
test("failed agent remains failed in a terminal session",()=>{const failedEvents=[...events,{id:"e3",sequence:3,type:"error",status:"failed",agentId:"c",agentKey:"checker",agentName:"Checker",agentRole:null,timestamp:null,summary:null}];const p=projectSession({sessionStatus:"done",events:failedEvents,edges:[]});const failed=p.nodes.find((node)=>node.id==="c");assert.equal(failed?.displayStatus,"failed");assert.equal(failed?.recordedStatus,"failed");assert.deepEqual(p.waitingOn,[]);});
test("intermediate snapshots preserve operational agent statuses",()=>{const timeline=[...events,{id:"e3",sequence:3,type:"turn",status:"done",agentId:"b",agentKey:"builder",agentName:"Builder",agentRole:null,timestamp:null,summary:null}];const p=projectSession({sessionStatus:"done",events:timeline,edges,atSequence:2});assert.deepEqual(p.nodes.map((node)=>node.status),["waiting","running"]);assert.deepEqual(p.nodes.map((node)=>node.displayStatus),["waiting","running"]);assert.deepEqual(p.waitingOn.map((node)=>node.id),["a"]);});
test("failed sessions retain failure result",()=>{const p=projectSession({sessionStatus:"failed",events:[],edges:[]});assert.equal(p.displayStatus,"idle");assert.equal(p.result,"failed");});
test("blocked is a terminal outcome distinct from idle operation",()=>{const p=projectSession({sessionStatus:"blocked",events,edges:[]});assert.equal(p.displayStatus,"idle");assert.equal(p.result,"blocked");});
test("cursor validation rejects fractional and negative timeline positions",()=>{assert.equal(parseAtSequence("3"),3);assert.equal(parseAtSequence(undefined),undefined);assert.throws(()=>parseAtSequence("1.5"));assert.throws(()=>parseAtSequence("-1"));});
test("projection preserves relationship provenance and sequence bounds",()=>{
 const relation={id:"l2",source:"a",target:"b",relation:"delegation",eventId:"e2",sequence:2,provenance:"explicit",confidence:1,metadata:{signal:"parsed.nextSpeaker"},sequenceStart:2,sequenceEnd:4};
 const atTwo=projectSession({sessionStatus:"running",events,edges:[relation],atSequence:2});
 assert.equal(atTwo.links[0].provenance,"explicit"); assert.equal(atTwo.links[0].confidence,1); assert.deepEqual(atTwo.links[0].metadata,{signal:"parsed.nextSpeaker"});
 assert.equal(atTwo.links[0].sequenceStart,2); assert.equal(atTwo.links[0].sequenceEnd,4);
});
test("projection exposes human identity metadata and separates operation from outcome",()=>{
 const enriched={...events[0],agentProfile:"architect",agentDisplayName:"Solution Architect",agentProvider:"cursor",agentTask:"Plan visibility",agentConfiguredModel:"host-selected",agentDeclaredSkills:["orchestration-and-real-identity"],agentEvidenceLevel:"declared",agentIsPrincipal:true,status:"done"};
 const p=projectSession({sessionStatus:"done",events:[enriched],edges:[]}); const node=p.nodes[0];
 assert.equal(node.name,"Solution Architect"); assert.equal(node.operationalStatus,"idle"); assert.equal(node.terminalResult,"done");
 assert.equal(node.task,"Plan visibility"); assert.deepEqual(node.declaredSkills,["orchestration-and-real-identity"]); assert.equal(node.evidenceLevel,"declared"); assert.equal(node.isPrincipal,true);
});
