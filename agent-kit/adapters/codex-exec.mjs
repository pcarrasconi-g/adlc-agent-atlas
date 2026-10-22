#!/usr/bin/env node
// Odradek v2 host adapter for Codex CLI. Reads one request from stdin, starts
// one actual Codex exec session, and returns its provider-issued thread ID.
import { spawn } from "node:child_process";

let request = "";
for await (const chunk of process.stdin) request += chunk;
const input = JSON.parse(request);
if (input.protocol !== "odradek.agent.v2" || !input.profileId || !input.prompt || !input.workspaceCwd) {
  throw new Error("Expected odradek.agent.v2 with profileId, prompt and workspaceCwd.");
}

const child = spawn("codex", ["exec", "--json", "-C", input.workspaceCwd, input.prompt], { stdio: ["ignore", "pipe", "pipe"] });
let stdout = ""; let stderr = "";
child.stdout.setEncoding("utf8"); child.stderr.setEncoding("utf8");
child.stdout.on("data", chunk => { stdout += chunk; });
child.stderr.on("data", chunk => { stderr += chunk; });
const code = await new Promise(resolve => child.on("close", resolve));
if (code !== 0) throw new Error(stderr || `codex exec exited ${code}`);

let threadId; let text = "";
for (const line of stdout.split("\n")) {
  try {
    const event = JSON.parse(line);
    threadId ??= event.thread_id ?? event.threadId ?? event?.thread?.id;
    if (event.type === "item.completed" && typeof event?.item?.text === "string") text = event.item.text;
  } catch { /* Codex JSONL only; ignore non-event diagnostics. */ }
}
if (!threadId) throw new Error("Codex exec completed without a provider thread ID; refusing to invent one.");
process.stdout.write(JSON.stringify({ text: text || "Codex turn completed.", runId: threadId, status: "finished", instance: { id: `codex:${threadId}`, provider: "codex" } }));
