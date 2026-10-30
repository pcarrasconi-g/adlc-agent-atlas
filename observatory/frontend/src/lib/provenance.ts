// The four provenances from docs/ATLAS_EVENT_CONTRACT.md, plus "unknown".
// Every visible claim carries exactly one.

export type Provenance = "verified" | "observed" | "declared" | "inferred" | "unknown";

export const provenanceLabel: Record<Provenance, string> = {
  verified: "Verified by command",
  observed: "Observed by hook",
  declared: "Declared by agent",
  inferred: "Inferred by rule",
  unknown: "Unknown",
};

// Higher is stronger evidence.
const rank: Record<Provenance, number> = { unknown: 0, inferred: 1, declared: 2, observed: 3, verified: 4 };

/** Backend `evidenceLevel` (agent identity/metadata) to provenance. */
export function fromEvidence(level?: string | null): Provenance {
  switch (level) {
    case "host-recorded":
      return "observed";
    case "behavior-evidenced":
      return "verified";
    case "declared":
      return "declared";
    default:
      return "unknown";
  }
}

/** Relation provenance. "explicit" is a runtime-written annotation, i.e. declared. */
export function fromRelation(value?: string | null): Provenance {
  switch (String(value || "").toLowerCase()) {
    case "observed":
      return "observed";
    case "verified":
      return "verified";
    case "inferred":
      return "inferred";
    case "explicit":
    case "declared":
      return "declared";
    default:
      return "inferred";
  }
}

export const stronger = (a: Provenance, b: Provenance): Provenance => (rank[b] > rank[a] ? b : a);
export const isStronger = (a: Provenance, b: Provenance) => rank[a] > rank[b];

export function ageLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
