import type { McpServersFile } from "../config/load.js";

type HostMcp = Record<
  string,
  | { command: string; args?: string[]; env?: Record<string, string> }
  | { url: string; headers?: Record<string, string> }
>;

export function toHostMcpServers(
  servers: McpServersFile["servers"] | undefined,
  allowedNames: string[],
): HostMcp | undefined {
  if (!servers) return undefined;
  const out: HostMcp = {};
  for (const name of allowedNames) {
    const s = servers[name];
    if (!s) continue;
    if (s.transport === "http" && s.url) {
      out[name] = { url: s.url, headers: s.headers };
    } else if (s.command) {
      out[name] = { command: s.command, args: s.args, env: s.env };
    }
  }
  return Object.keys(out).length ? out : undefined;
}

export function mcpForAgent(
  agentId: string,
  integrations: Record<string, { enabled: boolean; mcpServerName?: string }>,
): string[] {
  const names: string[] = [];
  if (agentId === "product-analyst" && integrations.jira?.enabled) {
    names.push(integrations.jira.mcpServerName ?? "jira");
  }
  if (agentId === "devops") {
    if (integrations.azure?.enabled) names.push(integrations.azure.mcpServerName ?? "azure");
    if (integrations.jira?.enabled) names.push(integrations.jira.mcpServerName ?? "jira");
  }
  return names;
}
