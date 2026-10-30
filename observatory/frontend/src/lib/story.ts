// "Learn" mode: a short guided story computed deterministically from the same
// events and links the map draws. No LLM, no invented steps: a step exists only
// if the recording has the evidence for it, and each step says how sure we are.
import { fromRelation, provenanceLabel, isStronger, type Provenance } from "./provenance.ts";
import { TERMINAL } from "./liveness.ts";

export type StoryEvent = { sequence: number; status?: string | null; agentId?: string | null; type?: string | null };
export type StoryNode = { id: string; name: string; isPrincipal?: boolean };
export type StoryLink = {
  source: string;
  target: string;
  relation: string;
  provenance?: string | null;
  sequenceStart?: number | null;
  sequence?: number | null;
};
export type StoryStep = {
  id: string;
  title: string;
  body: string;
  sequence: number; // event sequence the map should be shown at
  agents: string[]; // node ids to highlight
  links: string[]; // linkKey()s to highlight
  provenance: Provenance;
};

export const linkKey = (source: string, target: string) => `${source}->${target}`;
const startOf = (l: StoryLink) => l.sequenceStart ?? l.sequence ?? 0;
const status = (e: StoryEvent) => String(e.status || "").toLowerCase();
const isCheck = (e: StoryEvent) => /^(gate|check|verification)[._]/i.test(String(e.type || ""));

export function buildStory(events: StoryEvent[], nodes: StoryNode[], links: StoryLink[]): StoryStep[] {
  if (!events.length) return [];
  const ordered = [...events].sort((a, b) => a.sequence - b.sequence);
  const name = (id: string) => nodes.find((n) => n.id === id)?.name || "an agent";
  const principal = nodes.find((n) => n.isPrincipal)?.id;
  const delegations = links
    .filter((l) => l.relation === "delegation" || l.relation === "handoff")
    .sort((a, b) => startOf(a) - startOf(b));
  const steps: StoryStep[] = [];

  // 1. Who delegated to whom, as of the first delegation.
  if (delegations.length) {
    const first = delegations[0];
    const at = startOf(first);
    const visible = delegations.filter((l) => l.source === first.source && startOf(l) <= at);
    const prov = fromRelation(first.provenance);
    steps.push({
      id: "delegate",
      title: `${name(first.source)} hands out work`,
      body: `${name(first.source)} delegated to ${visible.map((l) => name(l.target)).join(", ")}. This link is shown as “${provenanceLabel[prov].toLowerCase()}”: it tells who started whom, not whether the work will be right.`,
      sequence: at,
      agents: [first.source, ...visible.map((l) => l.target)],
      links: visible.map((l) => linkKey(l.source, l.target)),
      provenance: prov,
    });
  }

  // 2. Concurrency: the moment the most agents were working at once (needs >= 2).
  const active = new Set<string>();
  let peak: { count: number; sequence: number; agents: string[] } = { count: 0, sequence: 0, agents: [] };
  for (const e of ordered) {
    if (!e.agentId || e.agentId === principal) continue;
    if (TERMINAL.has(status(e))) active.delete(e.agentId);
    else active.add(e.agentId);
    if (active.size > peak.count) peak = { count: active.size, sequence: e.sequence, agents: [...active] };
  }
  if (peak.count >= 2) {
    steps.push({
      id: "parallel",
      title: `${peak.count} agents work at the same time`,
      body: `Each one got its own assignment and its own identity: ${peak.agents.map(name).join(" and ")} are different instances even if they share a type. Parallel work is why a single log line is not enough to follow a run.`,
      sequence: peak.sequence,
      agents: peak.agents,
      links: [],
      provenance: "observed",
    });
  }

  // 3. The first result an agent reported.
  const firstResult = ordered.find((e) => e.agentId && e.agentId !== principal && TERMINAL.has(status(e)));
  if (firstResult?.agentId) {
    steps.push({
      id: "result",
      title: `${name(firstResult.agentId)} reports “${status(firstResult)}”`,
      body: `This is the stop signal Claude Code recorded for that agent. It means the agent finished, not that its work passed any check.`,
      sequence: firstResult.sequence,
      agents: [firstResult.agentId],
      links: [],
      provenance: "observed",
    });
  }

  // 4. A relation first inferred from timing and later confirmed by a stronger signal.
  for (const weak of delegations) {
    const strong = delegations.find(
      (l) => l.source === weak.source && l.target === weak.target && isStronger(fromRelation(l.provenance), fromRelation(weak.provenance)) && startOf(l) > startOf(weak),
    );
    if (!strong) continue;
    steps.push({
      id: `confirm:${linkKey(weak.source, weak.target)}`,
      title: "A guess becomes a fact",
      body: `The link ${name(weak.source)} → ${name(weak.target)} first appeared as “${provenanceLabel[fromRelation(weak.provenance)].toLowerCase()}”, because Claude Code did not say who launched whom at that moment. A later signal confirmed it, so the map now shows it as “${provenanceLabel[fromRelation(strong.provenance)].toLowerCase()}”.`,
      sequence: startOf(strong),
      agents: [weak.source, weak.target],
      links: [linkKey(weak.source, weak.target)],
      provenance: fromRelation(strong.provenance),
    });
    break; // one is enough to teach the idea
  }

  // 5. What was actually verified.
  const checks = ordered.filter(isCheck);
  const lastSeq = ordered[ordered.length - 1].sequence;
  steps.push(
    checks.length
      ? {
          id: "verification",
          title: `${checks.length} check${checks.length > 1 ? "s" : ""} observed`,
          body: "These are checks whose command and exit code were recorded. They are the only evidence here that something passed or failed.",
          sequence: lastSeq,
          agents: [],
          links: [],
          provenance: "verified",
        }
      : {
          id: "verification",
          title: "Nothing was verified in this recording",
          body: "No check (lint, tests, typecheck) was observed. “Done” here only means the agents stopped; whether the work is correct is still unknown, and the map keeps it that way instead of painting it green.",
          sequence: lastSeq,
          agents: [],
          links: [],
          provenance: "unknown",
        },
  );

  return steps.sort((a, b) => a.sequence - b.sequence);
}
