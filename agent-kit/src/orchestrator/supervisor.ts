import path from "node:path";
import { loadMcpServers, loadPlatformConfig } from "../config/load.js";
import { runAgentTurn } from "../agents/run-turn.js";
import { parseAgentTurn, parseSupervisorTurn } from "../agents/parse-turn.js";
import { ConversationBus } from "../bus/conversation-bus.js";
import type { PlatformConfig, TranscriptEntry, TranscriptRelation } from "../types.js";
import type { FlowReporter } from "../visualization/flow-reporter.js";

export type RunOutcome =
  | { kind: "done"; transcript: ReturnType<ConversationBus["getTranscript"]> }
  | { kind: "escalate"; reason: string; transcript: ReturnType<ConversationBus["getTranscript"]> }
  | { kind: "error"; message: string };

function pickOpeningSpeaker(config: PlatformConfig): string {
  return config.dialogue.openingOrder.find((id) => config.agents[id]?.enabled) ?? "product-analyst";
}

function fallbackNext(
  config: PlatformConfig,
  lastAgentId: string,
  suggested?: string,
): string {
  if (suggested && config.agents[suggested]?.enabled) return suggested;
  const order = config.dialogue.openingOrder;
  const idx = order.indexOf(lastAgentId);
  if (idx >= 0 && idx < order.length - 1) return order[idx + 1];
  return "reviewer";
}

export async function runMultiAgentDialogue(options: {
  goal: string;
  jiraKey?: string;
  workspaceCwd?: string;
  reporter?: FlowReporter;
}): Promise<RunOutcome> {
  const config = await loadPlatformConfig();
  const cwd = options.workspaceCwd
    ? path.resolve(options.workspaceCwd)
    : path.resolve(config.runtime.workspaceCwd || process.cwd());
  config.runtime.workspaceCwd = cwd;
  const mcp = await loadMcpServers();
  const bus = new ConversationBus(options.goal, { jiraKey: options.jiraKey });
  const reporter = options.reporter;

  function emitTurn(entry: Omit<TranscriptEntry, "at"> & { at?: string }): void {
    const parsed = entry.parsed;
    const relations: TranscriptRelation[] = [...(entry.relations ?? [])];
    if (parsed && "nextSpeaker" in parsed && parsed.nextSpeaker && parsed.nextSpeaker !== entry.agentId) {
      relations.push({
        from: entry.agentId,
        to: parsed.nextSpeaker,
        kind: "delegation",
        source: "explicit",
        confidence: 1,
      });
    }
    if (parsed && "questionsFor" in parsed) {
      for (const question of parsed.questionsFor ?? []) {
        if (question.to && question.to !== entry.agentId) {
          relations.push({
            from: entry.agentId,
            to: question.to,
            kind: "message",
            source: "explicit",
            confidence: 1,
          });
        }
      }
      if (parsed.suggestedNextSpeaker && parsed.suggestedNextSpeaker !== entry.agentId) {
        relations.push({
          from: entry.agentId,
          to: parsed.suggestedNextSpeaker,
          kind: "handoff",
          source: "explicit",
          confidence: 1,
        });
      }
    }
    const unique = new Map(relations.map((relation) => [
      `${relation.from}:${relation.to}:${relation.kind}`,
      relation,
    ]));
    bus.append({ ...entry, relations: [...unique.values()] });
    reporter?.onTurnEnd(bus.getTranscript().at(-1)!);
  }

  let nextSpeaker = pickOpeningSpeaker(config);
  const maxRounds = config.runtime.maxDialogueRounds;

  for (let round = 1; round <= maxRounds; round++) {
    // Supervisor cada 2 turnos de trabajo o si hay blocked
    const needsSupervisor =
      round > 1 && (round % 3 === 0 || bus.getTranscript().at(-1)?.parsed?.status === "blocked");

    if (needsSupervisor && config.agents.supervisor?.enabled) {
      reporter?.onTurnStart(round, "supervisor");
      const supMsg = bus.formatForAgent("supervisor");
      const sup = await runAgentTurn({
        agentId: "supervisor",
        config,
        userMessage: `Ronda ${round}. Decide próximo hablante.\n\n${supMsg}`,
        mcpServers: mcp,
      });
      const parsed = parseSupervisorTurn(sup.text);
      emitTurn({
        round,
        agentId: "supervisor",
        rawText: sup.text,
        parsed,
        runId: sup.runId,
      });

      if (parsed?.status === "done") {
        return { kind: "done", transcript: bus.getTranscript() };
      }
      if (parsed?.status === "escalate_human") {
        return { kind: "escalate", reason: parsed.reason, transcript: bus.getTranscript() };
      }
      if (parsed?.nextSpeaker) nextSpeaker = parsed.nextSpeaker;
    }

    const agentId = nextSpeaker;
    reporter?.onTurnStart(round, agentId);
    const userMessage = bus.formatForAgent(agentId);
    const turn = await runAgentTurn({
      agentId,
      config,
      userMessage: `Ronda ${round}.\n\n${userMessage}`,
      mcpServers: mcp,
    });

    const parsed = parseAgentTurn(turn.text);
    emitTurn({
      round,
      agentId,
      rawText: turn.text,
      parsed,
      runId: turn.runId,
    });

    if (turn.status === "error") {
      return { kind: "error", message: `Run failed for ${agentId} (${turn.runId})` };
    }

    if (parsed?.status === "done" && config.dialogue.closers.includes(agentId)) {
      return { kind: "done", transcript: bus.getTranscript() };
    }
    if (parsed?.status === "blocked") {
      nextSpeaker = "supervisor";
      continue;
    }

    nextSpeaker = fallbackNext(config, agentId, parsed?.suggestedNextSpeaker);

    // Anti-loop: mismo agente 3 veces seguidas → supervisor
    const recent = bus.getTranscript().slice(-3).map((e) => e.agentId);
    if (recent.length === 3 && recent.every((id) => id === agentId)) {
      nextSpeaker = "supervisor";
    }
  }

  return {
    kind: "escalate",
    reason: `Se alcanzó maxDialogueRounds (${maxRounds})`,
    transcript: bus.getTranscript(),
  };
}
