import { spawn } from "node:child_process";
import { loadAgentPrompt, loadAgentSkills } from "../config/load.js";
import type { PlatformConfig } from "../types.js";
import { mcpForAgent } from "./mcp-map.js";
import type { McpServersFile } from "../config/load.js";

export type TurnResult = {
  text: string;
  runId: string;
  status: "finished" | "error";
};

type HostTurnRequest = {
  protocol: "odradek.agent.v1";
  agentId: string;
  prompt: string;
  workspaceCwd: string;
  allowedMcp: string[];
};

type HostTurnResponse = {
  text: string;
  runId?: string;
  status?: "finished" | "error";
};

function hostCommand(): [string, string[]] {
  const raw = process.env.ODRADEK_AGENT_COMMAND_JSON?.trim();
  if (!raw) {
    throw new Error(
      "No hay un adaptador de IA configurado. Configura ODRADEK_AGENT_COMMAND_JSON con un array JSON, por ejemplo [\"node\",\"adapter.mjs\"].",
    );
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error("ODRADEK_AGENT_COMMAND_JSON no es JSON válido"); }
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || !item)) {
    throw new Error("ODRADEK_AGENT_COMMAND_JSON debe ser un array no vacío de argumentos string");
  }
  return [value[0] as string, value.slice(1) as string[]];
}

async function invokeHost(request: HostTurnRequest): Promise<HostTurnResponse> {
  const [command, args] = hostCommand();
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: request.workspaceCwd,
      shell: false,
      env: { ...process.env, ODRADEK_AGENT_PROTOCOL: "odradek.agent.v1" },
      stdio: ["pipe", "pipe", "inherit"],
    });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => { stdout += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`El adaptador de IA terminó con código ${code ?? "desconocido"}`));
      try {
        const response = JSON.parse(stdout.trim()) as HostTurnResponse;
        if (typeof response.text !== "string") throw new Error("falta text");
        resolve(response);
      } catch {
        reject(new Error("El adaptador de IA debe devolver JSON {text, runId, status} por stdout"));
      }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export async function runAgentTurn(params: {
  agentId: string;
  config: PlatformConfig;
  userMessage: string;
  mcpServers?: McpServersFile["servers"];
}): Promise<TurnResult> {
  const def = params.config.agents[params.agentId];
  if (!def?.enabled) {
    throw new Error(`Agent disabled or unknown: ${params.agentId}`);
  }

  const system = await loadAgentPrompt(def.promptFile);
  const skills = await loadAgentSkills(def.skills);
  const allowedMcp = mcpForAgent(params.agentId, params.config.integrations);
  const prompt = [system, ...skills, params.userMessage].join("\n\n---\n\n");
  const result = await invokeHost({
    protocol: "odradek.agent.v1",
    agentId: params.agentId,
    prompt,
    workspaceCwd: params.config.runtime.workspaceCwd,
    allowedMcp,
  });
  return {
    text: result.text,
    runId: result.runId || `${params.agentId}-${Date.now()}`,
    status: result.status === "error" ? "error" : "finished",
  };
}
