// Facts the adapter recorded about checks (gates), the ADLC completion guard and
// published decisions, read back out of the session's events.

export type RawEvent = {
  id?: string;
  sequence: number;
  type?: string | null;
  agentId?: string | null;
  timestamp?: string | null;
  createdAt?: string | null;
  summary?: string | null;
  payload?: any;
};

export type GateRun = {
  sequence: number;
  at: number | null;
  agentId: string | null;
  recipe: string;
  exit: number | null; // null: unknown (chained command, interrupted)
  complex: boolean;
  interrupted: boolean;
  fingerprint?: string;
  findings?: number;
  rev?: string;
  dirty?: boolean;
  repo?: string;
  worktree?: string;
};
export type OpenGate = { sequence: number; at: number | null; agentId: string | null; recipe: string };
export type GuardBlock = {
  sequence: number;
  at: number | null;
  agentId: string | null;
  recipes: string[];
  findings: Record<string, number>;
  mode?: string;
  rootRev?: string;
  rootDirty?: boolean;
  rootRepo?: string;
};
export type Decision = { sequence: number; at: number | null; agentId: string | null; phase?: string; decision: string; reason?: string };
export type Evidence = {
  gates: GateRun[];
  open: OpenGate[]; // started and not finished yet
  guards: GuardBlock[];
  decisions: Decision[];
  worktreeOf: Map<string, string>;
  treeOf: Map<string, { rev?: string; dirty?: boolean; repo?: string }>; // latest checked tree per agent
  completions: { sequence: number; at: number | null }[]; // task completion requests
};

const time = (e: RawEvent) => {
  const t = Date.parse(e.timestamp || e.createdAt || "");
  return Number.isFinite(t) ? t : null;
};

export function extractEvidence(events: RawEvent[]): Evidence {
  const out: Evidence = { gates: [], open: [], guards: [], decisions: [], worktreeOf: new Map(), treeOf: new Map(), completions: [] };
  for (const e of [...events].sort((a, b) => a.sequence - b.sequence)) {
    const p = e.payload?.parsed ?? {};
    const agentId = e.agentId ?? null;
    // The agent's own worktree comes from where it started, never from where one of its checks ran.
    if (agentId && typeof p.worktree === "string" && !e.type?.startsWith("gate.") && !out.worktreeOf.has(agentId)) out.worktreeOf.set(agentId, p.worktree);
    switch (e.type) {
      case "gate.started":
        out.open.push({ sequence: e.sequence, at: time(e), agentId, recipe: String(p.recipe ?? "check") });
        break;
      case "gate.finished": {
        const recipe = String(p.recipe ?? "check");
        const i = out.open.findIndex((o) => o.agentId === agentId && o.recipe === recipe);
        if (i >= 0) out.open.splice(i, 1);
        const run: GateRun = {
          sequence: e.sequence,
          at: time(e),
          agentId,
          recipe,
          exit: typeof p.exit === "number" ? p.exit : null,
          complex: Boolean(p.complex),
          interrupted: Boolean(p.interrupted),
          fingerprint: p.fingerprint,
          findings: typeof p.findings === "number" ? p.findings : undefined,
          rev: p.rev,
          dirty: typeof p.dirty === "boolean" ? p.dirty : undefined,
          repo: p.repo,
          worktree: p.worktree,
        };
        out.gates.push(run);
        if (agentId && run.rev) out.treeOf.set(agentId, { rev: run.rev, dirty: run.dirty, repo: run.repo });
        break;
      }
      case "guard.blocked":
        out.guards.push({
          sequence: e.sequence,
          at: time(e),
          agentId,
          recipes: Array.isArray(p.recipes) ? p.recipes : [],
          findings: p.findings && typeof p.findings === "object" ? p.findings : {},
          mode: p.mode,
          rootRev: p.rootRev,
          rootDirty: typeof p.rootDirty === "boolean" ? p.rootDirty : undefined,
          rootRepo: p.rootRepo,
        });
        break;
      case "checkpoint":
        out.decisions.push({ sequence: e.sequence, at: time(e), agentId, phase: p.phase, decision: String(p.decision ?? e.summary ?? ""), reason: p.reason });
        break;
      case "task.completed":
        out.completions.push({ sequence: e.sequence, at: time(e) });
        break;
      default:
        break;
    }
  }
  return out;
}
