export type ProjectionEvent = {
  id: string; sequence: number; type: string; status: string | null;
  agentId: string | null; agentKey: string | null; agentName: string | null; agentRole: string | null;
  agentProfile?: string | null; agentDisplayName?: string | null; agentProvider?: string | null;
  agentTask?: string | null; agentConfiguredModel?: string | null; agentDeclaredSkills?: string[] | null;
  agentEvidenceLevel?: string | null; agentIsPrincipal?: boolean | null;
  timestamp: string | null; summary: string | null;
};
export type ProjectionEdge = {
  id: string; source: string; target: string; relation: string; eventId: string | null; sequence: number | null;
  provenance?: string | null; confidence?: number | null; metadata?: Record<string, unknown> | null;
  sequenceStart?: number | null; sequenceEnd?: number | null;
};

const terminal = new Set(["done", "failed", "blocked", "cancelled", "canceled", "complete", "completed"]);
const normalStatus = (value: string | null | undefined) => value?.toLowerCase() || "unknown";

export function parseAtSequence(value: unknown): number | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new Error("atSequence must be a non-negative integer");
  return parsed;
}

/** A deterministic, content-free view of a session at an event sequence. */
export function projectSession(input: {
  sessionStatus: string; events: ProjectionEvent[]; edges: ProjectionEdge[]; atSequence?: number;
}) {
  const ordered = [...input.events].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const lastSequence = ordered.at(-1)?.sequence ?? -1;
  const atSequence = input.atSequence === undefined ? lastSequence : input.atSequence;
  const visibleEvents = ordered.filter((event) => event.sequence <= atSequence);
  const byAgent = new Map<string, ProjectionEvent>();
  for (const event of visibleEvents) if (event.agentId) byAgent.set(event.agentId, event);
  const visibleIds = new Set(byAgent.keys());
  const recordedStatus = normalStatus(input.sessionStatus);
  const atEnd = atSequence >= lastSequence;
  const terminalSnapshot = atEnd && terminal.has(recordedStatus);
  const displayAgentStatus = (status: string) => {
    // A terminal session no longer has work in flight. Keep failed/cancelled
    // visible as an outcome, while representing every other agent as idle.
    if (terminalSnapshot && !new Set(["failed", "cancelled", "canceled"]).has(status)) return "idle";
    return status;
  };
  const nodes = [...byAgent.entries()].map(([id, event]) => ({
    id, key: event.agentKey || id, name: event.agentDisplayName || event.agentRole || event.agentName || "Unknown", role: event.agentRole,
    profile:event.agentProfile, displayName:event.agentDisplayName, provider:event.agentProvider, task:event.agentTask,
    configuredModel:event.agentConfiguredModel, declaredSkills:event.agentDeclaredSkills||[], evidenceLevel:event.agentEvidenceLevel||"unverifiable", isPrincipal:Boolean(event.agentIsPrincipal),
    status: displayAgentStatus(normalStatus(event.status)), operationalStatus:displayAgentStatus(normalStatus(event.status)),
    displayStatus: displayAgentStatus(normalStatus(event.status)), terminalResult:terminal.has(normalStatus(event.status))?normalStatus(event.status):null,
    recordedStatus: normalStatus(event.status), lastStatus: normalStatus(event.status),
    lastSequence: event.sequence,
  }));
  const links = input.edges
    .filter((edge) => {
      const start = edge.sequenceStart ?? edge.sequence;
      return start !== null && start !== undefined && start <= atSequence && visibleIds.has(edge.source) && visibleIds.has(edge.target);
    })
    .map((edge) => ({
      ...edge,
      sequence: edge.sequenceStart ?? edge.sequence,
      provenance: edge.provenance ?? "inferred",
      confidence: edge.confidence ?? null,
      metadata: edge.metadata ?? {},
      sequenceStart: edge.sequenceStart ?? edge.sequence,
      sequenceEnd: edge.sequenceEnd ?? edge.sequence,
    }));
  const displayStatus = atEnd && terminal.has(recordedStatus) ? "idle" : "working";
  return {
    atSequence, lastSequence, eventCount: visibleEvents.length, totalEventCount: ordered.length,
    displayStatus, recordedStatus, result: terminal.has(recordedStatus) ? recordedStatus : null,
    currentEvent: visibleEvents.at(-1) || null,
    nodes, links,
    waitingOn: terminalSnapshot ? [] : nodes.filter((node) => node.recordedStatus === "waiting" || node.recordedStatus === "blocked"),
  };
}
