// Atlas-specific panels. Everything here renders facts the recording already
// has and says how sure we are about each one; nothing is invented.
import React, { useState } from "react";
import {
  ageLabel,
  provenanceLabel,
  type Provenance,
} from "./lib/provenance.ts";
import type { StoryStep } from "./lib/story.ts";
import type { Liveness } from "./lib/liveness.ts";

const clock = (ms: number | null) =>
  ms === null || !Number.isFinite(ms)
    ? "—"
    : new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(ms);

const ICONS: Record<string, string> = {
  working: "●",
  running: "●",
  done: "✓",
  completed: "✓",
  complete: "✓",
  failed: "✕",
  blocked: "■",
  waiting: "…",
  idle: "○",
  registered: "◇",
  cancelled: "⊘",
  canceled: "⊘",
};
export const statusIcon = (status: string) => ICONS[status] ?? "?";

const PROV_ICONS: Record<Provenance, string> = {
  verified: "✓✓",
  observed: "◉",
  declared: "✎",
  inferred: "≈",
  unknown: "?",
};
export function ProvChip({ p }: { p: Provenance }) {
  return (
    <span className={`prov ${p}`} title={provenanceLabel[p]}>
      <i aria-hidden="true">{PROV_ICONS[p]}</i>
      {provenanceLabel[p]}
    </span>
  );
}

export function LiveBar(p: {
  demo?: boolean;
  follow: boolean;
  recorded: boolean;
  connected: boolean;
  total: number;
  cursor: number;
  unseen: number;
  lastSignalMs: number | null;
  nowMs: number;
  staleAfter: number;
  onPresent: () => void;
}) {
  const mode = !p.follow ? "history" : p.recorded ? "recorded" : "live";
  const age = p.lastSignalMs === null ? null : p.nowMs - p.lastSignalMs;
  const stale = mode === "live" && (age === null || age > p.staleAfter);
  return (
    <div className={`livebar ${mode}`}>
      <span className={`chip ${mode}${stale ? " uncertain" : ""}`}>
        {mode === "live"
          ? stale
            ? "◌ LIVE · UNCERTAIN"
            : "● LIVE"
          : mode === "recorded"
            ? p.demo
              ? "◼ RECORDED DEMO"
              : "◼ RECORDED"
            : p.demo
              ? "❙❙ HISTORY · RECORDED DEMO"
              : "❙❙ HISTORY"}
      </span>
      <span role="status" aria-live="polite" className="livetext">
        {mode === "live" &&
          (age === null
            ? "Following the newest step · no signal yet"
            : stale
              ? `Following the newest step · no signal for ${ageLabel(age)}, so activity is uncertain`
              : `Following the newest step · last signal ${ageLabel(age)} ago`)}
        {mode === "recorded" &&
          (p.demo
            ? `${p.total} steps from a real Claude Code + ADLC run, anonymized · nothing here is running`
            : `${p.total} steps recorded · showing the final state`)}
        {mode === "history" &&
          `Viewing step ${p.total ? p.cursor + 1 : 0} of ${p.total}${p.unseen ? ` · ${p.unseen} new since` : ""}`}
      </span>
      {!p.connected && (
        <span className="chip offline">⚠ Disconnected · retrying</span>
      )}
      {!p.follow && (
        <button className="present" onClick={p.onPresent}>
          ↦ Back to present{p.unseen ? ` (${p.unseen} new)` : ""}
        </button>
      )}
    </div>
  );
}

export function Filters(p: {
  statuses: string[];
  active: string[];
  toggle: (status: string) => void;
  query: string;
  setQuery: (q: string) => void;
  phases: string[];
  phase: string;
  setPhase: (v: string) => void;
  shown: number;
  total: number;
}) {
  return (
    <div className="filters" role="group" aria-label="Filter agents">
      {p.statuses.map((s) => (
        <button
          key={s}
          aria-pressed={p.active.includes(s)}
          onClick={() => p.toggle(s)}
        >
          {statusIcon(s)} {s}
        </button>
      ))}
      <input
        aria-label="Filter agents by name or task"
        placeholder="⌕ Filter agents"
        value={p.query}
        onChange={(e) => p.setQuery(e.target.value)}
      />
      {p.phases.length > 0 && (
        <select
          aria-label="Filter by phase"
          value={p.phase}
          onChange={(e) => p.setPhase(e.target.value)}
        >
          <option value="">All phases</option>
          {p.phases.map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
      )}
      {p.shown !== p.total && <small>{p.total - p.shown} hidden</small>}
    </div>
  );
}

export function StoryPanel(p: {
  steps: StoryStep[];
  index: number;
  cursorSequence: number | null;
  onGo: (i: number) => void;
}) {
  const step = p.steps[Math.min(p.index, p.steps.length - 1)];
  if (!step)
    return (
      <section className="lens-panel story" aria-label="Guided story">
        <p className="muted">
          Not enough recorded evidence to tell a story yet.
        </p>
      </section>
    );
  const here = p.cursorSequence === step.sequence;
  return (
    <section className="lens-panel story" aria-label="Guided story">
      <div className="story-head">
        <b>
          Learn · step {p.index + 1} of {p.steps.length}
        </b>
        <ProvChip p={step.provenance} />
      </div>
      <h3>{step.title}</h3>
      <p>{step.body}</p>
      <div className="story-nav">
        <button disabled={p.index === 0} onClick={() => p.onGo(p.index - 1)}>
          ‹ Previous
        </button>
        <span className="dots" aria-hidden="true">
          {p.steps.map((s, i) => (
            <i key={s.id} className={i === p.index ? "on" : ""} />
          ))}
        </span>
        <button
          disabled={p.index >= p.steps.length - 1}
          onClick={() => p.onGo(p.index + 1)}
        >
          Next ›
        </button>
        {!here && (
          <button className="present" onClick={() => p.onGo(p.index)}>
            Show this moment
          </button>
        )}
      </div>
    </section>
  );
}

export type DiagnoseRow = {
  id: string;
  name: string;
  shortId: string;
  status: string;
  liveness: Liveness;
  identity: Provenance;
  parent: string;
  parentProv: Provenance | null;
  first: number | null;
  last: number | null;
  maxGap: number;
  signals: number;
  worktree: string | null;
};

export type CheckRow = {
  id: string;
  at: number | null;
  agent: string;
  recipe: string;
  exit: number | null;
  interrupted: boolean;
  where: string | null;
};

export function DiagnosePanel(p: {
  rows: DiagnoseRow[];
  checkRows: CheckRow[];
  nowMs: number;
  relationCounts: Partial<Record<Provenance, number>>;
}) {
  const checks = p.checkRows.length;
  return (
    <section className="lens-panel diagnose" aria-label="Diagnosis">
      <div className="story-head">
        <b>Diagnose · same map, with the evidence</b>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Agent</th>
              <th>Status</th>
              <th>Identity</th>
              <th>Launched by</th>
              <th>Worktree</th>
              <th>First signal</th>
              <th>Last signal</th>
              <th>Longest silence</th>
              <th>Signals</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <b>{r.name}</b>
                  <small>{r.shortId}</small>
                </td>
                <td>
                  {statusIcon(r.status)} {r.status}
                  {r.liveness === "uncertain" ? " · uncertain" : ""}
                </td>
                <td>
                  <ProvChip p={r.identity} />
                </td>
                <td>
                  {r.parent}
                  {r.parentProv && (
                    <>
                      {" "}
                      <ProvChip p={r.parentProv} />
                    </>
                  )}
                </td>
                <td>
                  {r.worktree ?? <span className="muted">not reported</span>}
                </td>
                <td>{clock(r.first)}</td>
                <td>
                  {clock(r.last)}
                  {r.last !== null &&
                  r.liveness !== "ended" &&
                  r.liveness !== "history"
                    ? ` (${ageLabel(p.nowMs - r.last)} ago)`
                    : ""}
                </td>
                <td>{r.signals > 1 ? ageLabel(r.maxGap) : "—"}</td>
                <td>{r.signals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {checks > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Agent</th>
                <th>Check</th>
                <th>Result</th>
                <th>Ran in</th>
              </tr>
            </thead>
            <tbody>
              {p.checkRows.map((c) => (
                <tr key={c.id}>
                  <td>{clock(c.at)}</td>
                  <td>{c.agent}</td>
                  <td>
                    <code>{c.recipe}</code>
                  </td>
                  <td>
                    {c.interrupted
                      ? "■ interrupted"
                      : c.exit === 0
                        ? "✓ passed (exit 0)"
                        : c.exit === null
                          ? "? result unknown"
                          : `✕ failed (exit ${c.exit})`}{" "}
                    <ProvChip p={c.exit === null ? "unknown" : "verified"} />
                  </td>
                  <td>
                    {c.where ?? <span className="muted">not reported</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="facts">
        <li>
          <b>Checks (lint, tests, typecheck):</b>{" "}
          {checks
            ? `${checks} observed with an exit code`
            : "none observed, so nothing here is verified"}{" "}
          <ProvChip p={checks ? "verified" : "unknown"} />
        </li>
        <li>
          <b>Worktree:</b> shown when Claude Code reports one for the agent
          (subagents launched with worktree isolation). The branch is never
          reported, so Atlas does not guess it. <ProvChip p="unknown" />
        </li>
        <li>
          <b>Delegation links:</b>{" "}
          {(Object.entries(p.relationCounts) as [Provenance, number][])
            .map(([k, n]) => `${n} ${provenanceLabel[k].toLowerCase()}`)
            .join(" · ") || "none"}
        </li>
      </ul>
    </section>
  );
}

export function AgentBrief(p: {
  name: string;
  task: string | null;
  status: string;
  liveness: Liveness;
  lastSignalMs: number | null;
  nowMs: number;
  staleAfter: number;
  taskProv: Provenance;
  statusProv: Provenance;
  checks: number;
}) {
  const [copied, setCopied] = useState(false);
  const ended = p.liveness === "ended";
  const age = p.lastSignalMs === null ? null : p.nowMs - p.lastSignalMs;
  const result = ended
    ? `Stopped with “${p.status}”${p.lastSignalMs ? ` at ${clock(p.lastSignalMs)}` : ""}. ${p.checks ? `${p.checks} check(s) were observed in this run.` : "No check was observed, so the outcome is not verified."}`
    : p.liveness === "history"
      ? `Last known status “${p.status}”. This is an older step; go back to the present to see how it ended.`
      : `Working${age !== null ? `, last signal ${ageLabel(age)} ago` : ""}.${p.liveness === "uncertain" ? " No recent signal, so we cannot say it is still running." : ""}`;
  let look: string;
  if (p.status === "failed" || p.status === "blocked")
    look = `${p.name} reported “${p.status}”. In Claude Code, open its transcript and read why before retrying; do not disable a gate to get past it.`;
  else if (p.liveness === "uncertain")
    look = `In Claude Code, check whether ${p.name} is still running: no signal for ${age === null ? "a while" : ageLabel(age)}.`;
  else if (ended)
    look = p.checks
      ? `In Claude Code, compare the observed check results with what ${p.name} reported.`
      : `${p.name} stopped, but nothing was verified. In Claude Code, ask what was checked before relying on its result.`;
  else if (p.liveness === "active")
    look = `Nothing to do yet: ${p.name} is sending signals.`;
  else look = `No evidence about the final outcome of ${p.name} at this step.`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(look);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };
  return (
    <div className="brief">
      <section>
        <h4>ASSIGNMENT</h4>
        <p>{p.task || "Not recorded"}</p>
        <ProvChip p={p.task ? p.taskProv : "unknown"} />
      </section>
      <section>
        <h4>OBSERVED RESULT</h4>
        <p>{result}</p>
        <ProvChip p={p.statusProv} />
      </section>
      <section>
        <h4>WHAT TO LOOK AT NOW</h4>
        <p>{look}</p>
        <button className="copy" onClick={copy}>
          {copied ? "Copied" : "Copy for Claude Code"}
        </button>
      </section>
    </div>
  );
}

// ---- Signals and decisions (Increment 3)
import type { Signal } from "./lib/signals.ts";
import type { DecisionView } from "./lib/decisions.ts";

const CONF_LABEL = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
} as const;

export function SignalsPanel(p: {
  signals: Signal[];
  decisions: DecisionView[];
  onShow: (s: Signal) => void;
  onStep: (sequence: number) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);
  if (!p.signals.length && !p.decisions.length) return null;
  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied(null), 1500);
    } catch {}
  };
  return (
    <details className="signals" open>
      <summary>
        Signals ({p.signals.length})
        {p.decisions.length
          ? ` · ${p.decisions.length} decision${p.decisions.length > 1 ? "s" : ""}`
          : ""}
      </summary>
      <div className="signal-list">
        {p.signals.map((s, i) => (
          <article key={s.id} className={`signal ${s.kind} ${s.confidence}`}>
            <details open={i === 0}>
              <summary className="signal-head">
                <span className="mark" aria-hidden="true">
                  {s.kind === "stale" ? "◌" : "⚠"}
                </span>
                <b>{s.title}</b>
                <span className={`conf ${s.confidence}`}>
                  {CONF_LABEL[s.confidence]}
                </span>
                <ProvChip p={s.provenance} />
              </summary>
              <p>{s.fact}</p>
              {s.compare && (
                <div className="compare" aria-label="Before and after">
                  {(
                    [
                      ["Baseline", s.compare.baseline],
                      ["Now", s.compare.current],
                    ] as const
                  ).map(([k, side]) => (
                    <div key={k}>
                      <small>
                        {k} · {side.label}
                      </small>
                      <b>{side.result}</b>
                      <span>{side.where}</span>
                    </div>
                  ))}
                </div>
              )}
              <p className="impact">
                <b>Why it matters:</b> {s.impact}
              </p>
              <p className="ask">
                <b>Next question:</b> {s.question}
              </p>
              <div className="signal-actions">
                <button onClick={() => p.onShow(s)}>Show on the map</button>
                <button onClick={() => copy(s.id, s.suggestion)}>
                  {copied === s.id ? "Copied" : "Copy for Claude Code"}
                </button>
              </div>
              <details className="ev">
                <summary>Evidence ({s.evidence.length})</summary>
                <ul>
                  {s.evidence.map((e, k) => (
                    <li key={k}>
                      {e.label}
                      {e.sequence !== null && (
                        <button
                          className="link"
                          onClick={() => p.onStep(e.sequence!)}
                        >
                          {" "}
                          show step
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </details>
          </article>
        ))}
        {p.decisions.map((d) => (
          <article key={d.decision.sequence} className="signal decision">
            <details open>
              <summary className="signal-head">
                <span className="mark" aria-hidden="true">
                  ◆
                </span>
                <b>Decision: {d.decision.decision}</b>
                <ProvChip p="declared" />
              </summary>
              {d.decision.reason && <p>Reason given: {d.decision.reason}</p>}
              <div
                className="compare"
                aria-label="Before and after the decision"
              >
                <div>
                  <small>Before</small>
                  {d.before.map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </div>
                <div>
                  <small>After</small>
                  {d.after.map((x) => (
                    <span key={x}>{x}</span>
                  ))}
                </div>
              </div>
              <div className="signal-actions">
                <button onClick={() => p.onStep(d.decision.sequence)}>
                  Show this moment
                </button>
              </div>
            </details>
          </article>
        ))}
      </div>
    </details>
  );
}
