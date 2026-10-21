import { AgentTurnSchema, SupervisorTurnSchema, type AgentTurn, type SupervisorTurn } from "../types.js";

export function extractJsonBlock(text: string): string | undefined {
  const fence = text.match(/```json\s*([\s\S]*?)```/i);
  if (fence?.[1]) return fence[1].trim();
  const start = text.lastIndexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return undefined;
}

export function parseAgentTurn(text: string): AgentTurn | undefined {
  const raw = extractJsonBlock(text);
  if (!raw) return undefined;
  try {
    return AgentTurnSchema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}

export function parseSupervisorTurn(text: string): SupervisorTurn | undefined {
  const raw = extractJsonBlock(text);
  if (!raw) return undefined;
  try {
    return SupervisorTurnSchema.parse(JSON.parse(raw));
  } catch {
    return undefined;
  }
}
