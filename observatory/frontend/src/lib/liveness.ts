// Claude Code exposes no per-agent heartbeat, so "alive" is only ever
// "a signal arrived recently". Never pulse forever: past the threshold the
// agent is uncertain, and an old or recorded session never pulses at all.

export type Liveness = "active" | "uncertain" | "ended" | "history";

export const TERMINAL = new Set(["done", "failed", "blocked", "cancelled", "canceled", "complete", "completed"]);

export const DEFAULT_STALE_AFTER_MS = 120_000;

export function staleAfterMs(raw?: string | null): number {
  const sec = Number(raw);
  return Number.isFinite(sec) && sec >= 5 ? sec * 1000 : DEFAULT_STALE_AFTER_MS;
}

export function liveness(input: {
  status: string;
  lastSignalMs: number | null; // epoch ms of the agent's last signal
  nowMs: number;
  staleAfter: number;
  atPresent: boolean; // the cursor shows the newest step
  recorded: boolean; // the session already has a terminal result
}): Liveness {
  if (TERMINAL.has(input.status)) return "ended";
  if (input.recorded || !input.atPresent) return "history";
  if (input.lastSignalMs === null) return "uncertain";
  return input.nowMs - input.lastSignalMs <= input.staleAfter ? "active" : "uncertain";
}
