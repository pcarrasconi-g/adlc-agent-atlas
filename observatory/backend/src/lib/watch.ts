import { redact } from "./redact.js";

// Native filesystem events are not consistently forwarded through all bind-mount
// implementations. Polling is deliberate here: the watched directory contains
// only small, infrequent session transcripts and correctness matters more than
// avoiding a tiny periodic stat cost.
const boundedInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export function transcriptWatchOptions(env: NodeJS.ProcessEnv = process.env) {
  return {
    ignoreInitial: false,
    awaitWriteFinish: { stabilityThreshold: boundedInteger(env.ODRADEK_WATCH_STABILITY_MS, 500, 100, 10_000) },
    usePolling: env.ODRADEK_WATCH_USE_POLLING !== "false",
    interval: boundedInteger(env.ODRADEK_WATCH_POLL_MS, 1_000, 100, 10_000),
  };
}

export function importFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redact(message).slice(0, 1_000);
}
