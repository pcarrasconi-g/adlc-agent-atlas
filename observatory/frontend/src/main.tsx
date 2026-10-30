import React, { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import "./branding.css";
import "./atlas.css";
import {
  AgentBrief,
  DiagnosePanel,
  Filters,
  LiveBar,
  SignalsPanel,
  StoryPanel,
  statusIcon,
  type DiagnoseRow,
} from "./atlas.tsx";
import { followReducer, initialFollow } from "./lib/follow.ts";
import { liveness, staleAfterMs, type Liveness } from "./lib/liveness.ts";
import {
  fromEvidence,
  fromRelation,
  isStronger,
  type Provenance,
} from "./lib/provenance.ts";
import { buildStory, linkKey } from "./lib/story.ts";
import { describeDecisions } from "./lib/decisions.ts";
import { demoRoute, isDemoId, loadDemo, type Demo } from "./lib/demo.ts";
import { extractEvidence } from "./lib/evidence.ts";
import { computeSignals, type AgentView } from "./lib/signals.ts";

type Any = Record<string, any>;
type Link = Any & {
  source: string;
  target: string;
  relation: string;
  provenance: string;
  confidence?: number;
};
// The recorded demo is served from static data; everything else from the API.
let DEMO: Demo | null = null;
const getJson = async (url: string, signal?: AbortSignal): Promise<any> => {
  const local = DEMO ? demoRoute(DEMO, url) : undefined;
  if (local !== undefined) return local;
  const r = await fetch(url, { signal });
  if (!r.ok) throw Error("api");
  return r.json();
};
const api = <T,>(p: string): Promise<T> => getJson(p);
const arr = (x: any): any[] =>
  Array.isArray(x)
    ? x
    : x?.data || x?.items || x?.events || x?.sessions || x?.projects || [];
const name = (x: any) =>
  x?.displayName ||
  x?.display_name ||
  x?.role ||
  x?.name ||
  x?.title ||
  x?.label ||
  x?.agentName ||
  x?.id ||
  "Unnamed";
const st = (x: any) =>
  x?.displayStatus || x?.display_status || x?.status || x?.state || "unknown";
const tm = (x?: string) =>
  x
    ? new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date(x))
    : "—";
const msg = (e: any) =>
  e?.summary || e?.content || e?.message || e?.type || "Event";
const cap = (n: number) => Math.max(0.4, Math.min(2.5, n));
const nodeStatus = (node: any) =>
  node?.terminalResult ||
  node?.terminal_result ||
  node?.displayStatus ||
  node?.display_status ||
  node?.status ||
  node?.recordedStatus ||
  node?.recorded_status ||
  "unknown";
const shortId = (x: any) => {
  const v = String(x?.key || x?.agentKey || x?.agentId || x?.id || "");
  return v.length > 16 ? `${v.slice(0, 8)}…${v.slice(-4)}` : v || "—";
};
const evidence = (x: any) =>
  x?.evidenceLevel || x?.evidence_level || "unverifiable";
const operating = (base: any, projection: any, end: boolean) => {
  if (!projection) return st(base);
  if (end && (projection.result || projection.terminalResult))
    return projection.result || projection.terminalResult;
  const projected =
    projection.displayStatus ||
    projection.display_status ||
    projection.status ||
    projection.recordedStatus ||
    projection.recorded_status;
  return projected || st(base);
};

async function loadAllEvents(sessionId: string, signal: AbortSignal) {
  const size = 500,
    maxPages = 100;
  let after: number | undefined,
    all: any[] = [];
  for (let page = 0; page < maxPages; page++) {
    const query = new URLSearchParams({ limit: String(size) });
    if (after !== undefined) query.set("afterSequence", String(after));
    const body = await getJson(
        `/api/sessions/${encodeURIComponent(sessionId)}/events?${query}`,
        signal,
      ),
      batch = arr(body);
    all.push(...batch);
    const last = batch.at(-1),
      next = body?.nextAfterSequence ?? body?.next_after_sequence;
    if (!batch.length || batch.length < size) break;
    const candidate = Number(next ?? last?.sequence);
    if (!Number.isFinite(candidate) || candidate === after) break;
    after = candidate;
  }
  return all
    .filter(
      (e, i, self) =>
        self.findIndex(
          (x) =>
            (x.id || x.externalKey || x.sequence) ===
            (e.id || e.externalKey || e.sequence),
        ) === i,
    )
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
}
function Pill({ v }: { v: string }) {
  return (
    <span className={"pill " + v}>
      <span aria-hidden="true">{statusIcon(v)}</span>{" "}
      {v === "idle" ? "IDLE" : v}
    </span>
  );
}

const relationName = (value: any) =>
  String(value || "")
    .toLowerCase()
    .replace(/[_\s-]+/g, "");
function relationKind(link: any) {
  const raw = relationName(
    link?.relation ||
      link?.relationship ||
      link?.type ||
      link?.kind ||
      link?.edgeType,
  );
  if (
    raw.includes("delegat") ||
    raw === "spawn" ||
    raw === "parentchild" ||
    raw === "child"
  )
    return "delegation";
  if (raw.includes("handoff") || raw.includes("transfer")) return "handoff";
  if (raw.includes("wait") || raw.includes("block")) return "waiting";
  if (
    raw.includes("message") ||
    raw.includes("communicat") ||
    raw.includes("reply")
  )
    return "message";
  return raw || "message";
}
function relationProvenance(link: any) {
  return String(
    link?.provenance ||
      link?.origin ||
      link?.sourceType ||
      link?.evidence ||
      "inferred",
  ).toLowerCase();
}
function resolveRef(ref: any, byRef: Map<string, string>) {
  if (ref === undefined || ref === null) return "";
  const value =
    typeof ref === "object"
      ? ref.id || ref.key || ref.agentId || ref.agentKey || ref.name
      : ref;
  return byRef.get(String(value)) || String(value);
}
function normalizeLinks(raw: any[], agents: any[]): Link[] {
  const byRef = new Map<string, string>();
  for (const a of agents) {
    const id = String(a.id || a.agentId || a.key || a.name);
    for (const ref of [a.id, a.agentId, a.key, a.agentKey, a.name, a.agentName])
      if (ref !== undefined && ref !== null) byRef.set(String(ref), id);
  }
  const out: Link[] = [];
  const push = (rawLink: any, source: any, target: any, extra: any = {}) => {
    const s = resolveRef(source, byRef),
      t = resolveRef(target, byRef);
    if (!s || !t || s === t) return;
    if (
      !agents.some((a) => String(a.id || a.agentId || a.key || a.name) === s) ||
      !agents.some((a) => String(a.id || a.agentId || a.key || a.name) === t)
    )
      return;
    const relation = relationKind({ ...rawLink, ...extra });
    const key = `${s}->${t}:${relation}`;
    const existing = out.findIndex((x) => x._key === key);
    if (existing >= 0) {
      // The same relation seen twice (e.g. first inferred, later observed):
      // keep the one with stronger evidence.
      if (
        !isStronger(
          fromRelation(relationProvenance(rawLink)),
          fromRelation(out[existing].provenance),
        )
      )
        return;
      out.splice(existing, 1);
    }
    const confidence = Number(
      rawLink?.confidence ?? rawLink?.score ?? extra.confidence,
    );
    out.push({
      ...rawLink,
      ...extra,
      source: s,
      target: t,
      relation,
      provenance: relationProvenance(rawLink),
      confidence: Number.isFinite(confidence) ? confidence : undefined,
      _key: key,
    });
  };
  for (const l of raw) {
    push(
      l,
      l?.source ??
        l?.from ??
        l?.fromAgentId ??
        l?.from_agent_id ??
        l?.parentId ??
        l?.parent_agent_id,
      l?.target ??
        l?.to ??
        l?.toAgentId ??
        l?.to_agent_id ??
        l?.childId ??
        l?.child_agent_id,
    );
  }
  for (const a of agents) {
    const childRefs = a.children || a.childAgents || a.child_agent_ids || [];
    for (const child of Array.isArray(childRefs) ? childRefs : []) {
      push(
        { relation: "delegation", provenance: "explicit" },
        a.id || a.key || a.name,
        child,
      );
    }
    const parent =
      a.parentAgentId ?? a.parent_agent_id ?? a.parentId ?? a.parent;
    const parentRef =
      typeof parent === "object"
        ? parent?.id || parent?.key || parent?.name
        : parent;
    if (parentRef)
      push(
        { relation: "delegation", provenance: "explicit" },
        parentRef,
        a.id || a.key || a.name,
      );
  }
  return out.map(({ _key, ...l }: any) => l);
}
function withTopology(agents: any[], links: Link[]) {
  const parents = new Map<string, Link[]>(),
    children = new Map<string, Link[]>(),
    structural = links.filter(
      (l) => l.relation === "delegation" || l.relation === "handoff",
    );
  for (const l of structural) {
    if (!parents.has(l.target)) parents.set(l.target, []);
    if (!children.has(l.source)) children.set(l.source, []);
    parents.get(l.target)!.push(l);
    children.get(l.source)!.push(l);
  }
  return agents.map((a) => {
    const id = String(a.id || a.agentId || a.key || a.name);
    return {
      ...a,
      parentLinks: parents.get(id) || [],
      childLinks: children.get(id) || [],
    };
  });
}

const safeLocal = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const STATUS_BUCKETS = ["working", "done", "failed", "waiting", "unknown"];
const bucket = (s: string) =>
  ["running", "working"].includes(s)
    ? "working"
    : ["done", "completed", "complete"].includes(s)
      ? "done"
      : ["failed", "blocked"].includes(s)
        ? "failed"
        : s === "waiting"
          ? "waiting"
          : "unknown";
const eventTime = (e: any) => {
  const t = Date.parse(e?.timestamp || e?.createdAt || "");
  return Number.isFinite(t) ? t : null;
};
const isCheck = (e: any) =>
  /^(gate|check|verification)\.finished$/i.test(String(e?.type || ""));

function App() {
  const [projects, setProjects] = useState<any[]>([]),
    [sessions, setSessions] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [events, setEvents] = useState<any[]>([]),
    [base, setBase] = useState<any>(null),
    [projection, setProjection] = useState<any>(null),
    [play, dispatch] = useReducer(followReducer, initialFollow),
    [speed, setSpeed] = useState(1),
    [zoom, setZoom] = useState(1),
    [mode, setMode] = useState("map"),
    [lens, setLens] = useState<"explore" | "learn" | "diagnose">("explore"),
    [storyIndex, setStoryIndex] = useState(0),
    [q, setQ] = useState(""),
    [agentQuery, setAgentQuery] = useState(""),
    [statusFilter, setStatusFilter] = useState<string[]>([]),
    [phase, setPhase] = useState(""),
    [right, setRight] = useState(true),
    [selectedAgentId, setSelectedAgentId] = useState<string | null>(null),
    [hoverAgentId, setHoverAgentId] = useState<string | null>(null),
    [connected, setConnected] = useState(true),
    [now, setNow] = useState(Date.now());
  const { cursor, playing, unseen, follow } = play;
  const selectedId: string | undefined = selected?.id;
  const selectedIdRef = useRef<string | undefined>();
  selectedIdRef.current = selectedId;
  const refreshing = useRef<AbortController>();
  const staleAfter = useMemo(
    () =>
      staleAfterMs(
        (import.meta as any).env?.VITE_ATLAS_STALE_AFTER_SEC ??
          safeLocal("atlas:staleAfterSec"),
      ),
    [],
  );
  const hadServer = useRef(false);
  const load = async () => {
    let ps: any[] = [],
      ss: any[] = [];
    try {
      const [p, s] = await Promise.all([
        api<any>("/api/projects"),
        api<any>("/api/sessions"),
      ]);
      ps = arr(p);
      ss = arr(s);
      hadServer.current = true;
    } catch {
      // A blip while a real session is open must not swap it for the demo.
      if (hadServer.current) return;
    }
    if (DEMO) {
      ss = [...ss, DEMO.session];
      ps = [
        ...ps,
        { id: "demo", name: DEMO.session.projectName, sourceKind: "demo" },
      ];
    }
    setProjects(ps);
    setSessions(ss);
    setSelected(
      (o: any) => (o && ss.find((x: any) => x.id === o.id)) || ss[0] || null,
    );
  };
  // Reload the selected session's events and graph. `reset` is true when the
  // session was just opened; otherwise this is a live update and the follow
  // state decides whether the cursor moves.
  const refresh = async (id: string, reset: boolean) => {
    refreshing.current?.abort();
    const controller = new AbortController();
    refreshing.current = controller;
    const [d, ev, g] = await Promise.allSettled([
      api(`/api/sessions/${id}`),
      loadAllEvents(id, controller.signal),
      api(`/api/sessions/${id}/graph`),
    ]);
    if (controller.signal.aborted || selectedIdRef.current !== id) return;
    if (ev.status !== "fulfilled") {
      // A failed live refresh must not wipe what is on screen.
      if (reset) dispatch({ type: "open", total: 0 });
      return;
    }
    if (d.status === "fulfilled") setDetail(d.value);
    setBase(g.status === "fulfilled" ? g.value : null);
    setEvents(ev.value);
    dispatch({ type: reset ? "open" : "events", total: ev.value.length });
  };
  // Coalesce bursts of events (a busy run sends many per second) into one
  // refresh, but never wait longer than 1.5s.
  const pending = useRef<{
    timer?: ReturnType<typeof setTimeout>;
    first?: number;
    id?: string;
  }>({});
  const scheduleRefresh = (id?: string) => {
    const p = pending.current,
      t = Date.now();
    if (id) p.id = id;
    p.first = p.first ?? t;
    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(
      () => {
        const target = p.id;
        p.timer = undefined;
        p.first = undefined;
        p.id = undefined;
        load();
        if (target && selectedIdRef.current === target) refresh(target, false);
      },
      Math.min(400, Math.max(0, 1500 - (t - p.first))),
    );
  };
  useEffect(() => {
    loadDemo().then((d) => {
      DEMO = d;
      load();
    });
    load();
    const e = new EventSource("/api/stream");
    e.onopen = () => setConnected(true);
    e.onerror = () => setConnected(false);
    e.onmessage = (m) => {
      setConnected(true);
      let d: any = {};
      try {
        d = JSON.parse(m.data);
      } catch {}
      const id = selectedIdRef.current;
      // "ready" is sent on every (re)connect: resync at once, since events may
      // have arrived while the stream was down.
      if (d.type === "ready") {
        load();
        if (id) refresh(id, false);
        return;
      }
      scheduleRefresh(
        d.type === "session.updated" && d.sessionId === id ? id : undefined,
      );
    };
    return () => e.close();
  }, []);
  useEffect(() => {
    dispatch({ type: "open", total: 0 });
    setEvents([]);
    setBase(null);
    setProjection(null);
    setSelectedAgentId(null);
    setHoverAgentId(null);
    setStoryIndex(0);
    setDetail(selected ?? null);
    if (!selectedId) return;
    refresh(selectedId, true);
    return () => refreshing.current?.abort();
  }, [selectedId]);
  useEffect(() => {
    if (!selectedId || !events.length) return;
    let dead = false;
    api<any>(
      `/api/sessions/${selectedId}/projection?atSequence=${events[cursor]?.sequence ?? cursor}`,
    )
      .then((x) => !dead && setProjection(x))
      .catch(() => !dead && setProjection(null));
    return () => {
      dead = true;
    };
  }, [selectedId, cursor, events]);
  useEffect(() => {
    if (!playing) return;
    const i = setInterval(() => dispatch({ type: "tick" }), speed * 1000);
    return () => clearInterval(i);
  }, [playing, speed]);
  useEffect(() => {
    const f = () => document.hidden && dispatch({ type: "pause" });
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, []);
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  const cur = events[cursor],
    projectionAvailable = projection !== null,
    agents0 = arr(
      projection?.agents ||
        projection?.nodes ||
        base?.nodes ||
        base?.agents ||
        detail?.agents,
    ),
    rawLinks = arr(
      projection?.edges || projection?.links || base?.links || base?.edges,
    ).filter(
      (l: any) =>
        projectionAvailable ||
        !l.sequence ||
        l.sequence <= (cur?.sequence ?? Infinity),
    );
  const links = useMemo(
    () => normalizeLinks(rawLinks, agents0),
    [rawLinks, agents0],
  );
  const agents = useMemo(
    () =>
      withTopology(
        agents0.map((a: any) => {
          if (projectionAvailable)
            // A finished agent shows its result ("done"), not the generic
            // "idle" that ends every non-failed agent of a closed session.
            return {
              ...a,
              status: nodeStatus(a),
              displayStatus: nodeStatus(a),
            };
          const e = events
            .slice(0, cursor + 1)
            .filter(
              (x: any) =>
                x.agentId === a.id ||
                x.agentKey === a.key ||
                x.agentName === name(a),
            )
            .at(-1);
          return { ...a, status: e?.status || a.status || "unknown" };
        }),
        links,
      ),
    [agents0, events, cursor, projectionAvailable, links],
  );
  const recorded = Boolean(projection?.result),
    atNewest = cursor >= events.length - 1,
    lastSignalMs =
      [...events]
        .reverse()
        .map(eventTime)
        .find((t) => t !== null) ?? null;
  // Per-agent signals up to the cursor: first, last, count and longest silence.
  const signals = useMemo(() => {
    const m = new Map<
      string,
      { first: number; last: number; count: number; maxGap: number }
    >();
    for (const e of events.slice(0, cursor + 1)) {
      const t = eventTime(e);
      if (!e.agentId || t === null) continue;
      const s = m.get(e.agentId);
      if (!s) m.set(e.agentId, { first: t, last: t, count: 1, maxGap: 0 });
      else {
        s.maxGap = Math.max(s.maxGap, t - s.last);
        s.last = t;
        s.count++;
      }
    }
    return m;
  }, [events, cursor]);
  const livenessById = useMemo(
    () =>
      Object.fromEntries(
        agents.map((a: any) => [
          String(a.id),
          liveness({
            status: st(a),
            lastSignalMs: signals.get(String(a.id))?.last ?? null,
            nowMs: now,
            staleAfter,
            atPresent: atNewest,
            recorded,
          }),
        ]),
      ) as Record<string, Liveness>,
    [agents, signals, now, staleAfter, atNewest, recorded],
  );
  const checkRows = useMemo(
    () =>
      events
        .slice(0, cursor + 1)
        .filter(isCheck)
        .map((e: any) => {
          const p = e?.payload?.parsed || {};
          return {
            id: String(e.id),
            at: eventTime(e),
            agent: name(
              agents0.find((a: any) => String(a.id) === e.agentId) || {
                id: e.agentId,
                name: e.agentName,
              },
            ),
            recipe: String(p.recipe || "check"),
            exit: typeof p.exit === "number" ? (p.exit as number) : null,
            interrupted: Boolean(p.interrupted),
            where: (p.worktree as string) || null,
          };
        }),
    [events, cursor, agents0],
  );
  const checks = checkRows.length;
  // Signals as of the step on screen, from what the recording says up to there.
  const facts = useMemo(
    () => extractEvidence(events.slice(0, cursor + 1)),
    [events, cursor],
  );
  const alerts = useMemo(() => {
    const lastSummary = new Map<string, string>();
    for (const e of events.slice(0, cursor + 1))
      if (e.agentId && e.summary) lastSummary.set(e.agentId, e.summary);
    const views: AgentView[] = agents.map((a: any) => ({
      id: String(a.id),
      name: name(a),
      status: st(a),
      uncertain: livenessById[String(a.id)] === "uncertain",
      lastSignalMs: signals.get(String(a.id))?.last ?? null,
      lastSummary: lastSummary.get(String(a.id)) ?? null,
    }));
    return computeSignals({
      evidence: facts,
      agents: views,
      nowMs: now,
      live: atNewest && !recorded,
    });
  }, [
    facts,
    agents,
    livenessById,
    signals,
    now,
    atNewest,
    recorded,
    events,
    cursor,
  ]);
  const decisions = useMemo(() => describeDecisions(facts), [facts]);
  const alertAgents = useMemo(
    () =>
      new Set(alerts.map((s) => s.anchor.agentId).filter(Boolean) as string[]),
    [alerts],
  );
  const goToSequence = (seq: number) => {
    const idx = events.findIndex((e: any) => e.sequence >= seq);
    dispatch({ type: "seek", index: idx >= 0 ? idx : events.length - 1 });
  };
  const agentWhere = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events.slice(0, cursor + 1)) {
      const w = e?.payload?.parsed?.worktree;
      if (w && e.agentId) m.set(e.agentId, w);
    }
    return m;
  }, [events, cursor]);
  const phases = useMemo(
    () =>
      [
        ...new Set(
          events
            .slice(0, cursor + 1)
            .map((e: any) => e?.payload?.parsed?.phase)
            .filter(Boolean),
        ),
      ] as string[],
    [events, cursor],
  );
  const agentPhase = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of events.slice(0, cursor + 1)) {
      const ph = e?.payload?.parsed?.phase;
      if (ph && e.agentId) m.set(e.agentId, ph);
    }
    return m;
  }, [events, cursor]);
  const visibleAgents = agents.filter((a: any) => {
    if (statusFilter.length && !statusFilter.includes(bucket(st(a))))
      return false;
    if (phase && agentPhase.get(String(a.id)) !== phase) return false;
    const needle = agentQuery.trim().toLowerCase();
    return (
      !needle || `${name(a)} ${a.task || ""}`.toLowerCase().includes(needle)
    );
  });
  // Learn mode: a short story from the same events and links the map draws.
  // The baseline comparison, computed over the whole recording for the story.
  const storyBaselines = useMemo(() => {
    const views: AgentView[] = arr(base?.nodes).map((n: any) => ({
      id: String(n.id),
      name: name(n),
      status: "done",
      uncertain: false,
      lastSignalMs: null,
    }));
    return computeSignals({
      evidence: extractEvidence(events),
      agents: views,
      nowMs: 0,
      live: false,
      limit: 10,
    })
      .filter((s) => s.kind === "baseline" && s.anchor.sequence !== null)
      .map((s) => ({
        title: s.title,
        fact: s.fact,
        sequence: s.anchor.sequence as number,
        agentId: s.anchor.agentId,
      }));
  }, [events, base]);
  const story = useMemo(
    () =>
      buildStory(
        events.map((e: any) => ({
          sequence: e.sequence,
          status: e.status,
          agentId: e.agentId,
          type: e.type,
          exit: e?.payload?.parsed?.exit,
          recipes: e?.payload?.parsed?.recipes,
          findings: e?.payload?.parsed?.findings,
          decision: e?.payload?.parsed?.decision,
        })),
        arr(base?.nodes).map((n: any) => ({
          id: String(n.id),
          name: name(n),
          isPrincipal: Boolean(n.isPrincipal),
        })),
        arr(base?.links).map((l: any) => ({
          source: String(l.source),
          target: String(l.target),
          relation: relationKind(l),
          provenance: l.provenance,
          sequenceStart: l.sequenceStart,
          sequence: l.sequence,
        })),
        storyBaselines,
      ),
    [events, base, storyBaselines],
  );
  const stepIndex = Math.min(storyIndex, Math.max(0, story.length - 1));
  const activeStep = lens === "learn" ? story[stepIndex] : undefined;
  const highlight = activeStep
    ? { agents: new Set(activeStep.agents), links: new Set(activeStep.links) }
    : null;
  const goToStep = (i: number) => {
    const step = story[i];
    if (!step) return;
    setStoryIndex(i);
    const idx = events.findIndex((e: any) => e.sequence >= step.sequence);
    dispatch({ type: "seek", index: idx >= 0 ? idx : events.length - 1 });
  };
  const chooseLens = (next: "explore" | "learn" | "diagnose") => {
    setLens(next);
    if (next === "learn" && story.length) goToStep(stepIndex);
  };
  const diagnoseRows: DiagnoseRow[] = agents.map((a: any) => {
    const id = String(a.id),
      s = signals.get(id),
      parent = (a.parentLinks || [])[0];
    return {
      id,
      name: name(a),
      shortId: shortId(a),
      status: st(a),
      liveness: livenessById[id],
      identity: fromEvidence(evidence(a)),
      parent: parent
        ? name(
            agents.find((x: any) => String(x.id) === parent.source) || {
              id: parent.source,
            },
          )
        : a.isPrincipal
          ? "Session principal"
          : "—",
      parentProv: parent ? fromRelation(parent.provenance) : null,
      first: s?.first ?? null,
      last: s?.last ?? null,
      maxGap: s?.maxGap ?? 0,
      signals: s?.count ?? 0,
      worktree: agentWhere.get(id) ?? null,
    };
  });
  const relationCounts: Partial<Record<Provenance, number>> = {};
  for (const l of links)
    if (l.relation === "delegation" || l.relation === "handoff") {
      const p = fromRelation(l.provenance);
      relationCounts[p] = (relationCounts[p] || 0) + 1;
    }
  const shown = sessions.filter((x) =>
      name(x).toLowerCase().includes(q.toLowerCase()),
    ),
    end = cursor >= events.length - 1,
    currentStatus = operating(selected, projection, end),
    waitingOn = arr(projection?.waitingOn || projection?.waiting_on),
    selectedAgent = agents.find((a: any) => String(a.id) === selectedAgentId),
    parentOfSelected = selectedAgent?.parentLinks?.[0],
    brief = selectedAgent && {
      name: name(selectedAgent),
      task: selectedAgent.task || null,
      status: st(selectedAgent),
      liveness: livenessById[String(selectedAgent.id)],
      lastSignalMs: signals.get(String(selectedAgent.id))?.last ?? null,
      nowMs: now,
      staleAfter,
      // The task label comes from the launch call; it is only as sure as the
      // link that tied that call to this agent.
      taskProv: parentOfSelected
        ? fromRelation(parentOfSelected.provenance)
        : fromEvidence(evidence(selectedAgent)),
      statusProv: fromEvidence(evidence(selectedAgent)),
      checks,
    };
  const selectAgent = (id: string) => {
    setSelectedAgentId(id);
    setRight(true);
  };
  return (
    <main>
      <header>
        <b aria-label="ADLC Agent Atlas">
          ◉ Agent <em>Watch</em>
        </b>
        <small>local observatory</small>
        <span>● Local updates</span>
      </header>
      <section className="layout">
        <aside className="left">
          <h4>
            SESSIONS <button onClick={load}>↻</button>
          </h4>
          <input
            aria-label="Search sessions"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="⌕ Search sessions"
          />
          {projects.map((p) => (
            <div className="project" key={p.id}>
              ⌄ {name(p)}
            </div>
          ))}
          {shown.map((s) => {
            const display = s.id === selected?.id ? currentStatus : st(s);
            return (
              <button
                className={
                  "session " + (selected?.id === s.id ? "selected" : "")
                }
                key={s.id}
                onClick={() => setSelected(s)}
              >
                <i className={"dot " + display} />
                <strong>{name(s)}</strong>
                <Pill v={display} />
                <small>
                  {s.agentCount || 0} agents · {tm(s.updatedAt || s.startedAt)}
                </small>
              </button>
            );
          })}
        </aside>
        <section className="work">
          <div className="top">
            <div>
              <h1>
                {selected ? name(selected) : "No session selected"}{" "}
                {selected && <Pill v={currentStatus} />}
              </h1>
              <small>
                {selected?.externalKey || selected?.id} · started{" "}
                {tm(selected?.startedAt)}
              </small>
              {cur && (
                <p>
                  As of {tm(cur.timestamp || cur.createdAt)} — step {cursor + 1}{" "}
                  of {events.length}
                </p>
              )}
            </div>
            <div>
              <span className="lens" role="group" aria-label="Reading mode">
                {(["explore", "learn", "diagnose"] as const).map((l) => (
                  <button
                    key={l}
                    aria-pressed={lens === l}
                    onClick={() => chooseLens(l)}
                  >
                    {l[0].toUpperCase() + l.slice(1)}
                  </button>
                ))}
              </span>
              <span className="view" role="group" aria-label="View">
                <button
                  aria-pressed={mode === "cards"}
                  onClick={() => setMode("cards")}
                >
                  Cards
                </button>
                <button
                  aria-pressed={mode === "map"}
                  onClick={() => setMode("map")}
                >
                  Map
                </button>
              </span>
            </div>
          </div>
          {selected && (
            <LiveBar
              follow={follow}
              recorded={recorded}
              connected={connected || isDemoId(selected?.id)}
              demo={isDemoId(selected?.id)}
              total={events.length}
              cursor={cursor}
              unseen={unseen}
              lastSignalMs={lastSignalMs}
              nowMs={now}
              staleAfter={staleAfter}
              onPresent={() => dispatch({ type: "present" })}
            />
          )}
          {selected && agents.length > 0 && (
            <Filters
              statuses={STATUS_BUCKETS}
              active={statusFilter}
              toggle={(s) =>
                setStatusFilter((x) =>
                  x.includes(s) ? x.filter((y) => y !== s) : [...x, s],
                )
              }
              query={agentQuery}
              setQuery={setAgentQuery}
              phases={phases}
              phase={phase}
              setPhase={setPhase}
              shown={visibleAgents.length}
              total={agents.length}
            />
          )}
          {selected && (
            <SignalsPanel
              signals={alerts}
              decisions={decisions}
              onStep={goToSequence}
              onShow={(s) => {
                if (s.anchor.sequence !== null) goToSequence(s.anchor.sequence);
                if (s.anchor.agentId) {
                  setSelectedAgentId(s.anchor.agentId);
                  setRight(true);
                }
              }}
            />
          )}
          {selected &&
            (mode === "map" ? (
              <Graph
                sessionId={selected.id}
                agents={visibleAgents}
                links={links}
                liveness={livenessById}
                alerts={alertAgents}
                highlight={highlight}
                zoom={zoom}
                setZoom={setZoom}
                current={cur}
                selectedAgentId={selectedAgentId}
                hoverAgentId={hoverAgentId}
                onSelect={selectAgent}
                onHover={setHoverAgentId}
              />
            ) : (
              <div className="cards">
                {agents.map((a) => (
                  <article
                    key={a.id}
                    className={
                      selectedAgentId === String(a.id) ? "agent-selected" : ""
                    }
                    tabIndex={0}
                    role="button"
                    aria-current={
                      selectedAgentId === String(a.id) ? "true" : undefined
                    }
                    onClick={() => selectAgent(String(a.id))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        selectAgent(String(a.id));
                      }
                    }}
                  >
                    <Pill v={st(a)} />
                    <h3>{name(a)}</h3>
                    <p title={a.task || ""}>{a.task || "Task not recorded"}</p>
                    <Topology agent={a} agents={agents} />
                  </article>
                ))}
              </div>
            ))}
          {lens === "learn" && (
            <StoryPanel
              steps={story}
              index={stepIndex}
              cursorSequence={cur?.sequence ?? null}
              onGo={goToStep}
            />
          )}
          {lens === "diagnose" && (
            <DiagnosePanel
              rows={diagnoseRows}
              checkRows={checkRows}
              nowMs={now}
              relationCounts={relationCounts}
            />
          )}
          <Controls
            {...{
              events,
              cursor,
              dispatch,
              playing,
              speed,
              setSpeed,
              unseen,
              follow,
            }}
          />
          <div className="zoom">
            <button
              aria-label="Zoom out map"
              onClick={() => setZoom((z: number) => cap(z - 0.15))}
            >
              −
            </button>
            {Math.round(zoom * 100)}%
            <button
              aria-label="Zoom in map"
              onClick={() => setZoom((z: number) => cap(z + 0.15))}
            >
              +
            </button>
            <button aria-label="Reset zoom" onClick={() => setZoom(1)}>
              Fit
            </button>
          </div>
        </section>
        {right ? (
          <Inspect
            {...{
              selected,
              selectedAgent,
              detail,
              agents,
              links,
              cur,
              events,
              end,
              currentStatus,
              waitingOn,
              projectionAvailable,
              historicalStatus:
                projection?.recordedStatus ||
                projection?.recorded_status ||
                st(selected),
              brief,
            }}
            close={() => setRight(false)}
            remove={async () => {
              if (selected && confirm("Delete local session?")) {
                await fetch("/api/sessions/" + selected.id, {
                  method: "DELETE",
                });
                load();
              }
            }}
          />
        ) : (
          <button className="open" onClick={() => setRight(true)}>
            ‹ Details
          </button>
        )}
      </section>
    </main>
  );
}
function Controls(p: any) {
  const e = p.events[p.cursor];
  const go = (index: number) => p.dispatch({ type: "seek", index });
  return (
    <section className="controls" aria-label="Session playback">
      <div>
        <button aria-label="Go to first event" onClick={() => go(0)}>
          |◀
        </button>
        <button
          aria-label="Previous event"
          onClick={() => p.dispatch({ type: "step", delta: -1 })}
        >
          ◀
        </button>
        <button
          aria-label={p.playing ? "Pause replay" : "Replay history"}
          aria-pressed={p.playing}
          className="play"
          onClick={() => p.dispatch({ type: "togglePlay" })}
        >
          {p.playing ? "Ⅱ" : "▶"}
        </button>
        <button
          aria-label="Next event"
          onClick={() => p.dispatch({ type: "step", delta: 1 })}
        >
          ▶
        </button>
        <select
          aria-label="Playback speed"
          value={p.speed}
          onChange={(e) => p.setSpeed(Number(e.target.value))}
        >
          {[0.5, 1, 2, 4].map((x) => (
            <option key={x} value={x}>
              {x}s
            </option>
          ))}
        </select>
      </div>
      <div className="range">
        <input
          type="range"
          aria-label="Session step"
          min="0"
          max={Math.max(0, p.events.length - 1)}
          value={p.cursor}
          onChange={(e) => go(+e.target.value)}
        />
        {p.events.map((x: any, i: number) => (
          <button
            type="button"
            aria-label={"Go to event " + (i + 1)}
            key={x.id || i}
            className={
              (i === p.cursor ? "now " : "") +
              (x.type === "checkpoint"
                ? "decision"
                : x.type === "guard.blocked"
                  ? "guard"
                  : "")
            }
            title={
              x.type === "checkpoint" || x.type === "guard.blocked"
                ? msg(x)
                : undefined
            }
            style={{
              left:
                (p.events.length > 1 ? (100 * i) / (p.events.length - 1) : 0) +
                "%",
            }}
            onClick={() => go(i)}
          />
        ))}
      </div>
      <button
        className="golive"
        disabled={p.follow}
        onClick={() => p.dispatch({ type: "present" })}
      >
        ↦ Back to present{p.unseen ? " (" + p.unseen + " new)" : ""}
      </button>
      <p aria-live="polite">
        <b>
          Step {p.events.length ? p.cursor + 1 : 0} of {p.events.length}
        </b>{" "}
        · {tm(e?.timestamp || e?.createdAt)} · {e ? msg(e) : "No events"}
      </p>
    </section>
  );
}
function Topology({ agent, agents }: any) {
  const label = (id: string) => {
    const related = agents.find((x: any) => String(x.id) === id);
    return related ? `${name(related)} · ${shortId(related)}` : shortId({ id });
  };
  return (
    <div className="topology">
      <small className="secondary-id">ID {shortId(agent)}</small>
      {agent.parentLinks?.length ? (
        <small>
          <b>Parent:</b>{" "}
          {agent.parentLinks.map((l: any) => (
            <span key={l.source}>
              {label(l.source)} · {l.relation}
            </span>
          ))}
        </small>
      ) : (
        <small>
          <b>{agent.isPrincipal ? "Principal" : "Root"}</b>
        </small>
      )}
      {agent.childLinks?.length ? (
        <small>
          <b>Children:</b>{" "}
          {agent.childLinks.map((l: any) => (
            <span key={l.target}>
              {label(l.target)} · {l.relation}
            </span>
          ))}
        </small>
      ) : null}
    </div>
  );
}
function Inspect({
  selected,
  selectedAgent,
  detail,
  agents,
  links,
  cur,
  events,
  currentStatus,
  waitingOn,
  projectionAvailable,
  historicalStatus,
  brief,
  close,
  remove,
}: any) {
  const wait = projectionAvailable
    ? waitingOn
    : agents.filter((a: any) => st(a) === "waiting");
  if (selectedAgent) {
    const id = String(
        selectedAgent.id || selectedAgent.agentId || selectedAgent.key,
      ),
      externalId = String(
        selectedAgent.key ||
          selectedAgent.agentKey ||
          selectedAgent.agentId ||
          selectedAgent.id ||
          "—",
      );
    const last = events
      .filter(
        (e: any) =>
          String(
            e.agentId ||
              e.agent_id ||
              e.agentKey ||
              e.agent_key ||
              e.agentName ||
              "",
          ) === id ||
          String(
            e.agentId ||
              e.agent_id ||
              e.agentKey ||
              e.agent_key ||
              e.agentName ||
              "",
          ) === String(selectedAgent.key || selectedAgent.name),
      )
      .at(-1);
    const parents = selectedAgent.parentLinks || [],
      children = selectedAgent.childLinks || [],
      skills = arr(
        selectedAgent.declaredSkills || selectedAgent.declared_skills,
      );
    return (
      <aside className="right agent-drawer">
        <button className="collapse" aria-label="Close details" onClick={close}>
          ›
        </button>
        <h3>
          {name(selectedAgent)} <Pill v={st(selectedAgent)} />
        </h3>
        <p className="agent-subtitle">
          {selectedAgent.task || "Task not recorded"}
        </p>
        <p className="status-detail">
          Operational status:{" "}
          <b>{selectedAgent.operationalStatus || st(selectedAgent)}</b> ·
          Result: <b>{selectedAgent.terminalResult || "—"}</b>
        </p>
        {brief && <AgentBrief {...brief} />}
        <details className="evidence-block">
          <summary>Evidence and relations</summary>
          <h4>IDENTITY AND EVIDENCE</h4>
          <dl>
            <dt>Short ID</dt>
            <dd>{shortId(selectedAgent)}</dd>
            <dt>Full ID</dt>
            <dd>{externalId}</dd>
            <dt>Profile</dt>
            <dd>
              {selectedAgent.profile || "—"}{" "}
              {selectedAgent.profile && (
                <Evidence value={evidence(selectedAgent)} />
              )}
            </dd>
            <dt>Provider</dt>
            <dd>
              {selectedAgent.provider || "—"}{" "}
              {selectedAgent.provider && (
                <Evidence value={evidence(selectedAgent)} />
              )}
            </dd>
            <dt>Configured model</dt>
            <dd>
              {selectedAgent.configuredModel ||
                selectedAgent.configured_model ||
                "—"}{" "}
              {(selectedAgent.configuredModel ||
                selectedAgent.configured_model) && (
                <Evidence value={evidence(selectedAgent)} />
              )}
            </dd>
            <dt>Declared skills</dt>
            <dd>
              {skills.length ? skills.join(", ") : "—"}{" "}
              {skills.length > 0 && <Evidence value={"declared"} />}
            </dd>
            <dt>Last event</dt>
            <dd>
              {tm(
                last?.timestamp || last?.createdAt || selectedAgent.updatedAt,
              )}
            </dd>
          </dl>
          <h4>TOPOLOGY</h4>
          <div className="agent-topology">
            <div>
              <b>Parents</b>
              {parents.length ? (
                parents.map((l: any) => (
                  <p key={l.source}>
                    <span className={"relation-tag " + l.relation}>
                      {l.relation}
                    </span>{" "}
                    {name(
                      agents.find((a: any) => String(a.id) === l.source) || {
                        id: l.source,
                      },
                    )}
                  </p>
                ))
              ) : (
                <p className="muted">
                  {selectedAgent.isPrincipal
                    ? "Session principal"
                    : "Recorded root"}
                </p>
              )}
            </div>
            <div>
              <b>Children</b>
              {children.length ? (
                children.map((l: any) => (
                  <p key={l.target}>
                    <span className={"relation-tag " + l.relation}>
                      {l.relation}
                    </span>{" "}
                    {name(
                      agents.find((a: any) => String(a.id) === l.target) || {
                        id: l.target,
                      },
                    )}
                  </p>
                ))
              ) : (
                <p className="muted">No children recorded</p>
              )}
            </div>
          </div>
          <h4>LAST EVENT</h4>
          {last ? (
            <article>
              <b>{last.type || "Event"}</b>
              <p>{msg(last)}</p>
              {last.content && (
                <details>
                  <summary>Recorded content</summary>
                  <pre>{last.content}</pre>
                </details>
              )}
            </article>
          ) : (
            <p className="muted">No events recorded for this agent.</p>
          )}
          <h4>RELATIONS ({parents.length + children.length})</h4>
          {[...parents, ...children].map((l: any, i: number) => (
            <div className="edge-detail" key={l.id || i}>
              <b>
                {name(
                  agents.find(
                    (a: any) =>
                      String(a.id) === (l.source === id ? l.target : l.source),
                  ) || { id: l.source === id ? l.target : l.source },
                )}
              </b>
              <small>
                <span className={"relation-tag " + l.relation}>
                  {l.relation}
                </span>{" "}
                · {l.provenance || "inferred"}
                {l.confidence !== undefined
                  ? " · " + Math.round(l.confidence * 100) + "%"
                  : ""}
              </small>
            </div>
          ))}
        </details>
      </aside>
    );
  }
  return (
    <aside className="right">
      <button className="collapse" aria-label="Close details" onClick={close}>
        ›
      </button>
      <h3>Session · {name(selected)}</h3>
      <Pill v={currentStatus} />
      {currentStatus === "idle" && (
        <p className="idle">IDLE · historical result: {historicalStatus}</p>
      )}
      <h4>DETAILS</h4>
      <dl>
        <dt>External ID</dt>
        <dd>{detail?.externalKey || selected?.id}</dd>
        <dt>Source</dt>
        <dd>{detail?.sourceKind || "Local detector"}</dd>
        <dt>Started / updated</dt>
        <dd>
          {tm(detail?.startedAt)} / {tm(detail?.updatedAt)}
        </dd>
      </dl>
      {!!wait.length && (
        <>
          <h4>WAITING ON</h4>
          {wait.map((a: any, i: number) => (
            <p className="waiting" key={a.id || a.agentId || i}>
              ● {name(a)}
            </p>
          ))}
        </>
      )}
      <h4>GRAPH STRUCTURE</h4>
      <div className="relations-summary">
        <p>
          <b>{agents.filter((a: any) => !a.parentLinks?.length).length}</b>{" "}
          root(s) · <b>{links.length}</b> relations
        </p>
        {agents.map((a: any) => (
          <div className="relation-row" key={a.id}>
            <b>{name(a)}</b>
            <span>
              {a.parentLinks?.length
                ? `← ${a.parentLinks.map((l: any) => name(agents.find((x: any) => String(x.id) === l.source) || { id: l.source })).join(", ")}`
                : "Root"}
              {a.childLinks?.length
                ? ` · → ${a.childLinks.map((l: any) => name(agents.find((x: any) => String(x.id) === l.target) || { id: l.target })).join(", ")}`
                : ""}
            </span>
          </div>
        ))}
      </div>
      <h4>AGENTS AND ACTIVITY</h4>
      {agents.map((a: any) => (
        <div className="agent" key={a.id}>
          <i className={st(a)} />
          <span>
            <b>{name(a)}</b>
            <small>
              {a.role || "Agent"} · {st(a)}
            </small>
          </span>
          <Pill v={st(a)} />
        </div>
      ))}
      <h4>RELATIONS</h4>
      {links.slice(0, 12).map((l: any, i: number) => (
        <div className="edge-detail" key={l.id || i}>
          <b>
            {name(
              agents.find((a: any) => String(a.id) === l.source) || {
                id: l.source,
              },
            )}{" "}
            →{" "}
            {name(
              agents.find((a: any) => String(a.id) === l.target) || {
                id: l.target,
              },
            )}
          </b>
          <small>
            <span className={"relation-tag " + l.relation}>{l.relation}</span> ·{" "}
            {l.provenance}
            {l.confidence !== undefined
              ? ` · ${Math.round(l.confidence * 100)}%`
              : ""}
          </small>
        </div>
      ))}
      <h4>CURRENT EVENT</h4>
      {cur ? (
        <article>
          <b>{cur.type}</b>
          <p>{msg(cur)}</p>
          {cur.content && (
            <details>
              <summary>Recorded content</summary>
              <pre>{cur.content}</pre>
            </details>
          )}
        </article>
      ) : null}
      {!isDemoId(selected?.id) && (
        <button className="danger" onClick={remove}>
          Delete local session
        </button>
      )}
    </aside>
  );
}

function Evidence({ value }: { value: string }) {
  const label =
    value === "declared"
      ? "declared"
      : value === "host-recorded"
        ? "host-recorded"
        : value === "behavior-evidenced"
          ? "behavior-evidenced"
          : "unverifiable";
  return <span className={"evidence " + value}>{label}</span>;
}
function Graph({
  sessionId,
  agents,
  links,
  zoom,
  setZoom,
  current,
  selectedAgentId,
  hoverAgentId,
  onSelect,
  onHover,
  liveness,
  highlight,
  alerts,
}: any) {
  const [pan, setPan] = useState({ x: 0, y: 0 }),
    [positions, setPositions] = useState<
      Record<string, { x: number; y: number }>
    >({}),
    svgRef = useRef<SVGSVGElement | null>(null),
    drag = useRef<any>();
  const layout = useMemo(() => layoutGraph(agents, links), [agents, links]);
  const storageKey = `agent-watch:positions:${sessionId}`;
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      setPositions(raw ? JSON.parse(raw) : {});
    } catch {
      setPositions({});
    }
    setPan({ x: 0, y: 0 });
  }, [storageKey]);
  const points = useMemo(() => {
    const out = new Map(layout.points);
    for (const [id, p] of Object.entries(positions)) {
      if (out.has(id)) out.set(id, p);
    }
    return out;
  }, [layout.points, positions]);
  const persist = (next: Record<string, { x: number; y: number }>) => {
    setPositions(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {}
  };
  const pointAt = (e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const r = svg.getBoundingClientRect();
    const sx = layout.width / r.width,
      sy = layout.height / r.height;
    return {
      x: ((e.clientX - r.left) * sx - pan.x) / zoom,
      y: ((e.clientY - r.top) * sy - pan.y) / zoom,
    };
  };
  const reset = () => {
    persist({});
    setPan({ x: 0, y: 0 });
    setZoom(1);
  };
  const onBackgroundDown = (e: React.PointerEvent) => {
    if (e.target !== e.currentTarget && !(e.target instanceof SVGElement))
      return;
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    drag.current = { kind: "pan", x: e.clientX, y: e.clientY, p: pan };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    if (drag.current.kind === "pan") {
      const svg = svgRef.current,
        r = svg?.getBoundingClientRect();
      if (!r) return;
      setPan({
        x:
          drag.current.p.x +
          ((e.clientX - drag.current.x) * (layout.width / r.width)) / zoom,
        y:
          drag.current.p.y +
          ((e.clientY - drag.current.y) * (layout.height / r.height)) / zoom,
      });
    } else {
      const now = pointAt(e),
        d = drag.current;
      const next = {
        ...positions,
        [d.id]: {
          x: d.start.x + now.x - d.at.x,
          y: d.start.y + now.y - d.at.y,
        },
      };
      persist(next);
    }
  };
  const nodeDown = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    (e.currentTarget as SVGGElement).setPointerCapture?.(e.pointerId);
    const at = pointAt(e),
      start = points.get(id) || layout.points.get(id);
    if (start) drag.current = { kind: "node", id, at, start };
  };
  const nodeUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    drag.current = null;
  };
  const keyNode = (e: React.KeyboardEvent, id: string) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(id);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onSelect(null);
      onHover(null);
      return;
    }
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const p = points.get(id) || layout.points.get(id);
      if (!p) return;
      const step = e.shiftKey ? 50 : 20;
      const dx =
          e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0,
        dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      persist({ ...positions, [id]: { x: p.x + dx, y: p.y + dy } });
    }
  };
  return (
    <div
      className="graph"
      tabIndex={0}
      onWheel={(e) => {
        e.preventDefault();
        setZoom((z: number) => cap(z + (e.deltaY < 0 ? 0.1 : -0.1)));
      }}
      onPointerDown={onBackgroundDown}
      onPointerMove={onMove}
      onPointerUp={() => {
        drag.current = null;
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        aria-label="Agent graph"
      >
        <defs>
          <marker
            id="arr"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto"
          >
            <path d="M0 0L10 5L0 10z" />
          </marker>
        </defs>
        <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
          {layout.links.map((l: any, i: number) => {
            const a = points.get(l.source),
              b = points.get(l.target);
            if (!a || !b) return null;
            const dx = b.x - a.x,
              dy = b.y - a.y;
            return (
              <path
                className={
                  "flow relation-" +
                  l.relation +
                  " provenance-" +
                  l.provenance +
                  (highlight
                    ? highlight.links.has(linkKey(l.source, l.target))
                      ? " story-hl"
                      : " dim"
                    : "")
                }
                key={l.id || i}
                d={`M ${a.x} ${a.y} C ${a.x + dx * 0.35} ${a.y + dy * 0.05}, ${b.x - dx * 0.35} ${b.y - dy * 0.05}, ${b.x} ${b.y}`}
                markerEnd="url(#arr)"
                opacity={
                  l.confidence === undefined
                    ? 1
                    : Math.max(0.35, Math.min(1, l.confidence))
                }
              >
                <title>
                  {l.relation} · {l.provenance}
                  {l.confidence !== undefined
                    ? ` · confidence ${Math.round(l.confidence * 100)}%`
                    : ""}
                </title>
              </path>
            );
          })}
          {agents.map((a: any) => {
            const id = String(a.id),
              p = points.get(id);
            if (!p) return null;
            const active = selectedAgentId === id,
              hovered = hoverAgentId === id;
            return (
              <g
                key={id}
                className={
                  (current &&
                  (current.agentId === a.id || current.agentKey === a.key)
                    ? "updated "
                    : "") +
                  (active ? "selected " : "") +
                  (hovered ? "hovered " : "") +
                  (alerts?.has(id) ? "has-signal " : "") +
                  "live-" +
                  (liveness?.[id] ?? "history") +
                  (highlight
                    ? highlight.agents.has(id)
                      ? " story-hl"
                      : " dim"
                    : "")
                }
                transform={`translate(${p.x},${p.y})`}
                tabIndex={0}
                role="button"
                aria-current={active ? "true" : undefined}
                aria-label={`Agent ${name(a)}, ${a.task || "task not recorded"}, ID ${shortId(a)}, ${st(a)}${active ? ", selected" : ""}`}
                onPointerDown={(e) => nodeDown(e, id)}
                onPointerMove={(e) => {
                  e.stopPropagation();
                  onHover(id);
                  onMove(e);
                }}
                onPointerUp={nodeUp}
                onMouseEnter={() => onHover(id)}
                onMouseLeave={() => onHover(null)}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(id);
                }}
                onKeyDown={(e) => keyNode(e, id)}
              >
                <circle className={st(a)} r="43" />
                <circle className="inner" r="33" />
                {alerts?.has(id) && (
                  <g
                    className="badge-wrap"
                    transform="translate(30,-30)"
                    aria-hidden="true"
                  >
                    <circle className="badge" r="11" />
                    <text className="badge-mark" y="4" textAnchor="middle">
                      !
                    </text>
                  </g>
                )}
                <text y="5" textAnchor="middle">
                  {name(a).slice(0, 2).toUpperCase()}
                </text>
                <foreignObject
                  x="-90"
                  y="54"
                  width="180"
                  height="60"
                  pointerEvents="none"
                >
                  <div className="label">
                    {name(a)}
                    <small className="agent-task" title={a.task || ""}>
                      {a.task || "Task not recorded"}
                    </small>
                    <small>
                      {shortId(a)} · {statusIcon(st(a))} {st(a)}
                      {liveness?.[id] === "uncertain"
                        ? " (uncertain)"
                        : ""} · {a.parentLinks?.length ? "child" : "root"}
                    </small>
                  </div>
                </foreignObject>
                {(hovered || active) && (
                  <foreignObject
                    className="node-popover-wrap"
                    x="52"
                    y="-58"
                    width="238"
                    height="116"
                    pointerEvents="none"
                  >
                    <div className="node-popover">
                      <b>{name(a)}</b>
                      <small title={a.task || ""}>
                        {a.task || "Task not recorded"}
                      </small>
                      <small>
                        ID {shortId(a)} · {st(a)}
                      </small>
                      <span>
                        {a.parentLinks?.length || 0} parent(s) ·{" "}
                        {a.childLinks?.length || 0} child(ren)
                      </span>
                      <em>
                        {active ? "Selected · details open" : "Click to select"}
                      </em>
                    </div>
                  </foreignObject>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <div className="graph-legend">
        <span className="legend delegation">Delegation</span>
        <span className="legend handoff">Handoff</span>
        <span className="legend message">Message</span>
        <span className="legend waiting">Waiting</span>
        <span className="legend inferred">inferred</span>
      </div>
      <button
        className="reset-layout"
        onClick={reset}
        aria-label="Reset layout"
      >
        ↺ Reset
      </button>
    </div>
  );
}
function layoutGraph(agents: any[], links: Link[]) {
  const ids = agents.map((a) => String(a.id || a.agentId || a.key || a.name)),
    valid = new Set(ids),
    structural = links.some(
      (l) => l.relation === "delegation" || l.relation === "handoff",
    )
      ? links.filter(
          (l) => l.relation === "delegation" || l.relation === "handoff",
        )
      : links,
    incoming = new Map<string, Link[]>();
  for (const id of ids) incoming.set(id, []);
  for (const l of structural)
    if (valid.has(l.source) && valid.has(l.target) && l.source !== l.target)
      incoming.get(l.target)!.push(l);
  const depth = new Map<string, number>(),
    visiting = new Set<string>();
  const getDepth = (id: string): number => {
    if (depth.has(id)) return depth.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const d = Math.max(
      0,
      ...(incoming.get(id) || []).map((l) => getDepth(l.source) + 1),
    );
    visiting.delete(id);
    depth.set(id, d);
    return d;
  };
  ids.forEach(getDepth);
  const levels = new Map<number, string[]>();
  for (const id of ids) {
    const d = depth.get(id) || 0;
    if (!levels.has(d)) levels.set(d, []);
    levels.get(d)!.push(id);
  }
  for (const xs of levels.values()) xs.sort((a, b) => a.localeCompare(b));
  const maxLevel = Math.max(0, ...levels.keys()),
    maxWidth = Math.max(1, ...[...levels.values()].map((x) => x.length));
  const width = Math.max(900, 150 + maxWidth * 190),
    height = Math.max(520, 140 + (maxLevel + 1) * 155),
    points = new Map<string, { x: number; y: number }>();
  for (const [d, xs] of levels) {
    const rowWidth = (xs.length - 1) * 190,
      start = (width - rowWidth) / 2;
    xs.forEach((id, i) =>
      points.set(id, { x: start + i * 190, y: 80 + d * 155 }),
    );
  }
  return {
    width,
    height,
    points,
    links: links.filter((l) => points.has(l.source) && points.has(l.target)),
  };
}

createRoot(document.getElementById("root")!).render(<App />);
