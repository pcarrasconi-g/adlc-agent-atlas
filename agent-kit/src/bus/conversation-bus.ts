import type { AgentTurn, SupervisorTurn, TranscriptEntry } from "../types.js";

function entryHeadline(e: TranscriptEntry): string {
  const p = e.parsed;
  if (!p) return "";
  return `**Estado:** ${p.status} — ${p.summary}`;
}

export class ConversationBus {
  readonly goal: string;
  readonly jiraKey?: string;
  private entries: TranscriptEntry[] = [];

  constructor(goal: string, options?: { jiraKey?: string }) {
    this.goal = goal;
    this.jiraKey = options?.jiraKey;
  }

  append(entry: Omit<TranscriptEntry, "at"> & { at?: string }): void {
    this.entries.push({
      ...entry,
      at: entry.at ?? new Date().toISOString(),
    });
  }

  getTranscript(): TranscriptEntry[] {
    return [...this.entries];
  }

  formatForAgent(targetAgentId: string): string {
    const header = [
      "# Objetivo del equipo",
      this.goal,
      this.jiraKey ? `\nJira: ${this.jiraKey}` : "",
      "\n# Transcript (orden cronológico)\n",
    ].join("\n");

    const body = this.entries
      .map((e) => {
        const parsed = e.parsed as AgentTurn | SupervisorTurn | undefined;
        const questions =
          parsed && "questionsFor" in parsed && parsed.questionsFor?.length
            ? `\nPreguntas pendientes: ${JSON.stringify(parsed.questionsFor)}`
            : "";
        const directed =
          parsed && "questionsFor" in parsed
            ? parsed.questionsFor?.filter((q) => q.to === targetAgentId)
            : [];
        const forYou =
          directed && directed.length
            ? `\n>>> Preguntas para ti (${targetAgentId}): ${directed.map((q) => q.text).join(" | ")}`
            : "";
        return `## Ronda ${e.round} — ${e.agentId}\n${entryHeadline(e)}\n${e.rawText.slice(0, 4000)}${questions}${forYou}`;
      })
      .join("\n\n");

    return `${header}${body}\n\n# Tu turno\nResponde según tu rol y termina con el JSON obligatorio.`;
  }

  lastSpeaker(): string | undefined {
    return this.entries.at(-1)?.agentId;
  }

  countTurnsByAgent(agentId: string): number {
    return this.entries.filter((e) => e.agentId === agentId).length;
  }
}
