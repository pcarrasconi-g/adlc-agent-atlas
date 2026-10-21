import type { TranscriptEntry } from "../types.js";

const AGENT_COLORS: Record<string, string> = {
  "product-analyst": "#3b82f6",
  architect: "#8b5cf6",
  devops: "#f59e0b",
  engineer: "#22c55e",
  reviewer: "#ef4444",
  supervisor: "#64748b",
};

const AGENT_LABELS: Record<string, string> = {
  "product-analyst": "Product Analyst",
  architect: "Architect",
  devops: "DevOps",
  engineer: "Engineer",
  reviewer: "Reviewer",
  supervisor: "Supervisor",
};

const STATUS_ICON: Record<string, string> = {
  continue: "→",
  blocked: "⏸",
  done: "✓",
  escalate_human: "⚠",
};

export class FlowReporter {
  private readonly goal: string;
  private readonly jiraKey?: string;

  constructor(goal: string, options?: { jiraKey?: string }) {
    this.goal = goal;
    this.jiraKey = options?.jiraKey;
  }

  onTurnStart(round: number, agentId: string): void {
    const label = AGENT_LABELS[agentId] ?? agentId;
    console.log(`\n┌─ Ronda ${round} · ${label} ${"─".repeat(Math.max(0, 40 - label.length))}`);
  }

  onTurnEnd(entry: TranscriptEntry): void {
    const status = entry.parsed?.status ?? "unknown";
    const icon = STATUS_ICON[status] ?? "?";
    const summary = entry.parsed?.summary ?? "(sin JSON parseado)";
    const next =
      entry.parsed && "nextSpeaker" in entry.parsed && entry.parsed.nextSpeaker
        ? ` → ${AGENT_LABELS[entry.parsed.nextSpeaker] ?? entry.parsed.nextSpeaker}`
        : entry.parsed && "suggestedNextSpeaker" in entry.parsed && entry.parsed.suggestedNextSpeaker
          ? ` ~ ${AGENT_LABELS[entry.parsed.suggestedNextSpeaker] ?? entry.parsed.suggestedNextSpeaker}`
          : "";
    console.log(`│ ${icon} [${status}] ${summary.slice(0, 120)}${summary.length > 120 ? "…" : ""}${next}`);
    console.log(`└${"─".repeat(50)}`);
  }

  generateHtml(transcript: TranscriptEntry[], outcome: { kind: string; reason?: string }): string {
    const data = {
      goal: this.goal,
      jiraKey: this.jiraKey,
      outcome,
      transcript,
      agents: AGENT_LABELS,
      colors: AGENT_COLORS,
    };

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>agent-team — flujo</title>
  <style>
    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --border: #2a2f3d;
      --text: #e8eaed;
      --muted: #9aa0a6;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 24px;
      max-width: 1100px;
      margin: 0 auto;
    }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 4px; }
    .meta { color: var(--muted); font-size: 0.875rem; margin-bottom: 24px; }
    .outcome {
      display: inline-block;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      margin-bottom: 24px;
      text-transform: uppercase;
    }
    .outcome.done { background: #14532d; color: #86efac; }
    .outcome.escalate { background: #713f12; color: #fcd34d; }
    .outcome.error { background: #7f1d1d; color: #fca5a5; }
    .flow {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      margin-bottom: 32px;
      padding: 16px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow-x: auto;
    }
    .flow-node {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }
    .flow-chip {
      padding: 6px 12px;
      border-radius: 20px;
      font-size: 0.8rem;
      font-weight: 500;
      color: #fff;
      white-space: nowrap;
    }
    .flow-arrow { color: var(--muted); font-size: 1.1rem; }
    .timeline { display: flex; flex-direction: column; gap: 12px; }
    .turn {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 10px;
      overflow: hidden;
    }
    .turn-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
      user-select: none;
    }
    .turn-header:hover { background: #22262f; }
    .turn-badge {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    .turn-agent { font-weight: 600; font-size: 0.9rem; }
    .turn-round { color: var(--muted); font-size: 0.8rem; }
    .turn-status {
      margin-left: auto;
      font-size: 0.75rem;
      padding: 2px 8px;
      border-radius: 4px;
      background: #2a2f3d;
      text-transform: uppercase;
    }
    .turn-status.continue { color: #93c5fd; }
    .turn-status.blocked { color: #fcd34d; }
    .turn-status.done { color: #86efac; }
    .turn-status.escalate_human { color: #fca5a5; }
    .turn-body {
      padding: 16px;
      font-size: 0.875rem;
      color: var(--muted);
      display: none;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 400px;
      overflow-y: auto;
    }
    .turn.open .turn-body { display: block; }
    .turn-summary {
      padding: 0 16px 12px;
      font-size: 0.875rem;
      color: var(--text);
    }
    .turn.open .turn-summary { display: none; }
  </style>
</head>
<body>
  <h1>Flujo multi-agente</h1>
  <p class="meta" id="meta"></p>
  <div class="outcome" id="outcome"></div>
  <div class="flow" id="flow"></div>
  <div class="timeline" id="timeline"></div>
  <script>
    const DATA = ${JSON.stringify(data)};

    document.getElementById("meta").textContent =
      DATA.goal + (DATA.jiraKey ? " · " + DATA.jiraKey : "");

    const outcomeEl = document.getElementById("outcome");
    outcomeEl.textContent = DATA.outcome.kind + (DATA.outcome.reason ? ": " + DATA.outcome.reason : "");
    outcomeEl.className = "outcome " + DATA.outcome.kind;

    const flowEl = document.getElementById("flow");
    DATA.transcript.forEach((entry, i) => {
      const node = document.createElement("div");
      node.className = "flow-node";
      const chip = document.createElement("span");
      chip.className = "flow-chip";
      chip.style.background = DATA.colors[entry.agentId] || "#64748b";
      chip.textContent = (DATA.agents[entry.agentId] || entry.agentId) + " (R" + entry.round + ")";
      node.appendChild(chip);
      flowEl.appendChild(node);
      if (i < DATA.transcript.length - 1) {
        const arrow = document.createElement("span");
        arrow.className = "flow-arrow";
        arrow.textContent = "→";
        flowEl.appendChild(arrow);
      }
    });

    const timelineEl = document.getElementById("timeline");
    DATA.transcript.forEach((entry) => {
      const turn = document.createElement("div");
      turn.className = "turn";

      const header = document.createElement("div");
      header.className = "turn-header";
      const badge = document.createElement("span");
      badge.className = "turn-badge";
      badge.style.background = DATA.colors[entry.agentId] || "#64748b";
      const agent = document.createElement("span");
      agent.className = "turn-agent";
      agent.textContent = DATA.agents[entry.agentId] || entry.agentId;
      const round = document.createElement("span");
      round.className = "turn-round";
      round.textContent = "Ronda " + entry.round;
      const status = document.createElement("span");
      status.className = "turn-status " + (entry.parsed?.status || "unknown");
      status.textContent = entry.parsed?.status || "sin parse";
      header.append(badge, agent, round, status);
      header.onclick = () => turn.classList.toggle("open");

      const summary = document.createElement("div");
      summary.className = "turn-summary";
      summary.textContent = entry.parsed?.summary || entry.rawText.slice(0, 200) + "…";

      const body = document.createElement("div");
      body.className = "turn-body";
      body.textContent = entry.rawText;

      turn.append(header, summary, body);
      timelineEl.appendChild(turn);
    });
  </script>
</body>
</html>`;
  }
}
