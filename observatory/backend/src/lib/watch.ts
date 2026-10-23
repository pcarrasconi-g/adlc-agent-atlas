import { redact } from "./redact.js";

// Native filesystem events are not consistently forwarded through all bind-mount
// implementations. Polling is deliberate here: the watched directory contains
// only small, infrequent session transcripts and correctness matters more than
// avoiding a tiny periodic stat cost.
export const transcriptWatchOptions = {
  ignoreInitial: false,
  awaitWriteFinish: { stabilityThreshold: 500 },
  usePolling: true,
  interval: 250,
};

export function importFailureMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return redact(message).slice(0, 1_000);
}
