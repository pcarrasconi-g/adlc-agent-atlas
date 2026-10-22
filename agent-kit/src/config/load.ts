import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import YAML from "yaml";
import type { PlatformConfig } from "../types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CONFIG_ROOT = path.resolve(__dirname, "../../config");

function expandEnv(value: string): string {
  return value.replace(/\$\{([^}:]+)(?::-([^}]*))?\}/g, (_, name: string, fallback?: string) => {
    const v = process.env[name];
    if (v !== undefined && v !== "") return v;
    return fallback ?? "";
  });
}

function walkExpand(obj: unknown): unknown {
  if (typeof obj === "string") return expandEnv(obj);
  if (Array.isArray(obj)) return obj.map(walkExpand);
  if (obj && typeof obj === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) out[k] = walkExpand(v);
    return out;
  }
  return obj;
}

export async function loadPlatformConfig(): Promise<PlatformConfig> {
  const raw = await readFile(path.join(CONFIG_ROOT, "agents.yaml"), "utf8");
  const parsed = walkExpand(YAML.parse(raw)) as PlatformConfig;
  return parsed;
}

export async function loadAgentPrompt(promptFile: string): Promise<string> {
  return readFile(path.join(CONFIG_ROOT, promptFile), "utf8");
}

export async function loadAgentSkills(skillIds: string[] = []): Promise<string[]> {
  return Promise.all(skillIds.map(async (skillId) => {
    if (!/^[a-z0-9-]+$/.test(skillId)) throw new Error(`Invalid skill id: ${skillId}`);
    return readFile(path.join(CONFIG_ROOT, "skills", `${skillId}.md`), "utf8");
  }));
}

export type McpServersFile = {
  servers: Record<
    string,
    {
      transport: "stdio" | "http";
      command?: string;
      args?: string[];
      env?: Record<string, string>;
      url?: string;
      headers?: Record<string, string>;
    }
  >;
};

export async function loadMcpServers(): Promise<McpServersFile["servers"] | undefined> {
  const file = path.join(CONFIG_ROOT, "mcp.servers.yaml");
  try {
    const raw = await readFile(file, "utf8");
    const parsed = walkExpand(YAML.parse(raw)) as McpServersFile;
    return parsed.servers;
  } catch {
    return undefined;
  }
}
