import { createHash } from "node:crypto";
import { z } from "zod";
import { bounded, redactDeep } from "./redact.js";

/**
 * A relationship is expressed in terms of agent external keys.  Keeping the
 * contract independent from database UUIDs lets detectors preserve the
 * relationship even when the target agent is announced before its first
 * event.  `kind` is intentionally open ended: runtimes can add a relation
 * type without forcing a database migration, while the detector still
 * validates its shape and bounds.
 */
export const RelationV1 = z.object({
  source: z.string().min(1).max(160),
  target: z.string().min(1).max(160),
  kind: z.string().min(1).max(80).default("handoff"),
  provenance: z.string().min(1).max(40).default("explicit"),
  confidence: z.number().min(0).max(1).default(1),
  metadata: z.record(z.unknown()).optional(),
  sequenceStart: z.number().int().nonnegative().optional(),
  sequenceEnd: z.number().int().nonnegative().optional(),
}).refine((relation) => relation.sequenceEnd === undefined || relation.sequenceStart === undefined || relation.sequenceEnd >= relation.sequenceStart, {
  message: "sequenceEnd must be greater than or equal to sequenceStart",
});
export type RelationV1 = z.infer<typeof RelationV1>;

export const AgentV1 = z.object({
  key:z.string().max(160), name:z.string().max(200), role:z.string().max(200).optional(),
  profile:z.string().max(120).optional(), displayName:z.string().max(200).optional(),
  provider:z.string().max(120).optional(), task:z.string().max(10000).optional(),
  configuredModel:z.string().max(200).optional(), declaredSkills:z.array(z.string().max(200)).max(100).optional(),
  evidenceLevel:z.enum(["declared","host-recorded","behavior-evidenced","unverifiable"]).optional(),
  isPrincipal:z.boolean().optional(),
});
export type AgentV1 = z.infer<typeof AgentV1>;
export const EventV1 = z.object({schemaVersion:z.literal("aw.event.v1").default("aw.event.v1"), externalKey:z.string().max(200), sequence:z.number().int().nonnegative(), type:z.string().max(80), agent:AgentV1.optional(), status:z.string().max(80).optional(), occurredAt:z.string().datetime().optional(), summary:z.string().max(10000).optional(), content:z.string().max(200000).optional(), payload:z.record(z.unknown()).optional(), relations:z.array(RelationV1).max(100).optional()});
export type EventV1 = z.infer<typeof EventV1>;
export const hash = (v:string) => createHash("sha256").update(v).digest("hex");
export function cleanRelation(input: unknown): RelationV1 {
  const relation = RelationV1.parse(input);
  return {
    ...relation,
    metadata: redactDeep(relation.metadata || {}) as Record<string, unknown>,
  };
}
export function cleanEvent(input: unknown): EventV1 {
  const event=EventV1.parse(input);
  return {
    ...event,
    agent:event.agent ? redactDeep(event.agent) as AgentV1 : undefined,
    summary:event.summary&&bounded(event.summary,10000),
    content:event.content&&bounded(event.content),
    payload:redactDeep(event.payload||{}) as Record<string, unknown>,
    relations:event.relations?.map(cleanRelation),
  };
}
