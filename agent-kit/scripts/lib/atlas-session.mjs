// Builds the session file the observatory imports from the append-only list of
// normalized records. Pure and deterministic: the same records always give the
// same file, so re-importing is idempotent and a duplicate record changes nothing.

const PROVIDER = "claude-code";

export function buildSession(records, { title } = {}) {
  const seen = new Set();
  const ordered = [];
  records.forEach((r, i) => {
    if (!r || !r.key || seen.has(r.key)) return;
    seen.add(r.key);
    ordered.push({ r, i });
  });
  // Hooks run as separate processes, so receipt order can differ by a few ms.
  ordered.sort((a, b) => (a.r.at < b.r.at ? -1 : a.r.at > b.r.at ? 1 : a.i - b.i));
  const recs = ordered.map((x) => x.r);
  const session = recs[0]?.session;
  const transcript = [];
  const pending = []; // launches not yet matched to a SubagentStart
  const parents = new Map(); // child agent -> { parent, task } learned from a launch result
  const registered = new Map(); // agent -> metadata
  let ended = false;

  const add = (agentId, at, parsed, relations) => transcript.push({ round: transcript.length, agentId, at, parsed, ...(relations?.length ? { relations } : {}) });
  const meta = (agent) => registered.get(agent) || {};
  const identity = (agent, extra) => ({ event: "agent_registered", profile: agent.type, displayName: agent.type, provider: PROVIDER, evidenceLevel: "host-recorded", ...extra });
  const where = (r) => ({ worktree: r.worktree, cwd: r.cwd, projectDir: r.projectDir });
  const tree = (r) => ({ rev: r.rev, dirty: r.dirty, repo: r.repo });
  const root = (r) => ({ rootRev: r.rootRev, rootDirty: r.rootDirty, rootRepo: r.rootRepo, rootCwd: r.rootCwd });

  for (const r of recs) {
    const actor = r.agent || session;
    switch (r.kind) {
      case "agent_launch":
        pending.push({ toolUseId: r.toolUseId, parent: actor, task: r.task, type: r.agentType });
        add(actor, r.at, { status: "working", summary: `Delegating: ${r.task ?? "a task"}`, tool: "Agent" });
        break;
      case "subagent_start": {
        const known = parents.get(r.agent);
        let task = known?.task;
        const rel = [];
        if (known) rel.push({ source: known.parent, target: r.agent, kind: "delegation", provenance: "observed", confidence: 1, metadata: { rule: "agent-tool-response" } });
        else if (pending.length === 1) {
          // The one launch call still waiting for its agent is the only candidate; an inference, not a fact.
          const p = pending.shift();
          task = p.task;
          rel.push({ source: p.parent, target: r.agent, kind: "delegation", provenance: "inferred", confidence: 0.6, metadata: { rule: "adjacent-to-agent-launch" } });
          registered.set(r.agent, { launch: p.toolUseId });
        }
        // Several pending launches: ambiguous, so no edge and no task label until confirmed.
        const type = r.agentType || "agent";
        registered.set(r.agent, { ...meta(r.agent), type, task });
        add(r.agent, r.at, identity({ type }, { status: "working", summary: "Started", task, ...where(r) }), rel);
        break;
      }
      case "agent_launch_result": {
        if (!r.child) break;
        const launch = pending.findIndex((p) => p.toolUseId === r.toolUseId);
        const info = launch >= 0 ? pending.splice(launch, 1)[0] : undefined;
        const task = info?.task ?? r.task;
        const parent = actor;
        const rel = [{ source: parent, target: r.child, kind: "delegation", provenance: "observed", confidence: 1, metadata: { rule: "agent-tool-response" } }];
        if (!registered.has(r.child)) parents.set(r.child, { parent, task });
        add(parent, r.at, { status: "working", summary: `Launch of ${r.agentType ?? "agent"} confirmed: ${r.status ?? "unknown"}`, tool: "Agent" }, rel);
        const m = meta(r.child);
        if (registered.has(r.child) && !m.task && task) {
          registered.set(r.child, { ...m, task });
          add(r.child, r.at, identity({ type: m.type || r.agentType || "agent" }, { event: "agent_task", status: "working", summary: "Assignment confirmed", task }));
        }
        break;
      }
      case "tool":
        add(actor, r.at, { status: "working", summary: r.failed ? `Tool ${r.tool} failed` : `Tool ${r.tool} finished`, tool: r.tool, durationMs: r.durationMs });
        break;
      case "gate_started":
        add(actor, r.at, { event: "gate.started", status: "working", summary: `Check ${r.recipe} started`, recipe: r.recipe, ...where(r) });
        break;
      case "gate_finished": {
        // The agent is not marked failed because a check failed: that is a fact about the check.
        const result = r.interrupted ? "was interrupted" : r.exit === undefined ? "ended with an unknown result (a chained command hides the exit code)" : r.exit === 0 ? "passed" : `failed (exit ${r.exit}${r.findings !== undefined ? `, ${r.findings} findings` : ""})`;
        add(actor, r.at, { event: "gate.finished", status: "working", summary: `Check ${r.recipe} ${result}`, recipe: r.recipe, exit: r.exit, complex: r.complex, interrupted: r.interrupted, fingerprint: r.fingerprint, findings: r.findings, durationMs: r.durationMs, ...where(r), ...tree(r) });
        break;
      }
      case "guard_blocked": {
        const n = Object.entries(r.findings ?? {}).map(([k, v]) => `${k}: ${v}`).join(", ");
        add(actor, r.at, { event: "guard.blocked", status: "working", summary: `ADLC guard blocked completion: ${(r.recipes ?? []).map((x) => `just ${x}`).join(", ") || "verification"} failed${n ? ` (${n} findings)` : ""}`, recipes: r.recipes, findings: r.findings, mode: r.mode, ...root(r) });
        break;
      }
      case "checkpoint": {
        add(actor, r.at, { event: "checkpoint", status: "working", summary: `Decision${r.phase ? ` (${r.phase})` : ""}: ${r.decision}`, phase: r.phase, decision: r.decision, reason: r.reason });
        break;
      }
      case "subagent_stop":
        add(r.agent, r.at, { status: "done", summary: "Stopped (result text not stored)", ...where(r), ...root(r) });
        break;
      case "task_created":
      case "task_completed":
        add(session, r.at, { event: r.kind === "task_created" ? "task.created" : "task.completed", status: "working", summary: `${r.kind === "task_created" ? "Task created" : "Task completion requested"}: ${r.task ?? r.taskId ?? ""}`, taskId: r.taskId, ...root(r) });
        break;
      case "stop":
        if (!r.agent) add(session, r.at, { status: "done", summary: "Principal finished its turn" });
        break;
      case "teammate_idle":
        if (r.agent) add(r.agent, r.at, { status: "waiting", summary: "Teammate idle" });
        break;
      case "session_end":
        ended = true;
        break;
      default:
        break;
    }
  }

  return {
    sessionId: session,
    goal: title || `Claude Code session ${String(session).slice(0, 8)}`,
    kind: ended ? "done" : "running",
    source: "atlas-adapter",
    principal: { agentId: session, displayName: "Claude Code (principal)", profile: "principal", provider: PROVIDER, task: "Claude Code session", identitySource: "host-issued" },
    recordedAt: recs[0]?.at,
    transcript,
  };
}
