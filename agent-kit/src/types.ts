import { z } from "zod";

export const AgentTurnSchema = z.object({
  status: z.enum(["continue", "blocked", "done", "escalate_human"]),
  summary: z.string(),
  decisions: z.array(z.string()).optional().default([]),
  questionsFor: z
    .array(z.object({ to: z.string(), text: z.string() }))
    .optional()
    .default([]),
  artifacts: z
    .array(z.object({ type: z.string(), content: z.string() }))
    .optional()
    .default([]),
  suggestedNextSpeaker: z.string().optional(),
});

export type AgentTurn = z.infer<typeof AgentTurnSchema>;

export const SupervisorTurnSchema = z.object({
  status: z.enum(["continue", "blocked", "done", "escalate_human"]),
  summary: z.string(),
  nextSpeaker: z.string(),
  reason: z.string(),
  blockers: z.array(z.string()).optional().default([]),
});

export type SupervisorTurn = z.infer<typeof SupervisorTurnSchema>;

/** A directed interaction recorded in the transcript for observability consumers. */
export type TranscriptRelation = {
  from: string;
  to: string;
  kind: "delegation" | "handoff" | "message" | "wait";
  source: "explicit" | "inferred";
  confidence: number;
};

export type TranscriptEntry = {
  round: number;
  /** Logical prompt selector; never use this as an observability identity. */
  profileId?: string;
  agentId: string;
  rawText: string;
  parsed?: AgentTurn | SupervisorTurn | undefined;
  relations?: TranscriptRelation[];
  runId?: string;
  at: string;
};

export type PlatformConfig = {
  runtime: {
    defaultModel: string;
    workspaceCwd: string;
    maxDialogueRounds: number;
  };
  dialogue: {
    openingOrder: string[];
    closers: string[];
  };
  agents: Record<
    string,
    {
      displayName: string;
      enabled: boolean;
      model: string;
      promptFile: string;
      skills?: string[];
      runtime: "local" | "cloud";
      responsibilities: string[];
      mayRequestFrom?: string[];
    }
  >;
  integrations: Record<string, { enabled: boolean; mcpServerName?: string; notes?: string }>;
};
