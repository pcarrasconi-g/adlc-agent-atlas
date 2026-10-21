import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runMultiAgentDialogue } from "./orchestrator/supervisor.js";
import { FlowReporter } from "./visualization/flow-reporter.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, "../output");

function usage(): void {
  console.error(`Usage:
  npm run run:goal -- --goal "objetivo" [--workspace /path/al/repo] [--jira PROJ-123] [--out sessions/nombre.json] [--no-visual]

  Adaptador: define ODRADEK_AGENT_COMMAND_JSON como un array JSON de comando y argumentos.
  El adaptador recibe {protocol, agentId, prompt, workspaceCwd, allowedMcp} por stdin
  y devuelve {text, runId, status} por stdout.
  Para uso con cualquier orquestador, se recomienda leer config/ y escribir una sesión
  explícita en output/sessions/<session-id>.json; este runner no instala SDKs ni hooks.`);
}

async function runGoal(args: string[]): Promise<void> {
  let goal = process.env.AGENT_GOAL ?? "";
  let jiraKey = process.env.JIRA_ISSUE_KEY;
  let outFile: string | undefined;
  let workspace: string | undefined = process.env.WORKSPACE_CWD;
  let visual = true;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--goal" && args[i + 1]) goal = args[++i];
    else if (args[i] === "--workspace" && args[i + 1]) workspace = args[++i];
    else if (args[i] === "--jira" && args[i + 1]) jiraKey = args[++i];
    else if (args[i] === "--out" && args[i + 1]) outFile = args[++i];
    else if (args[i] === "--no-visual") visual = false;
  }

  if (!goal) {
    usage();
    process.exit(1);
  }

  const reporter = visual ? new FlowReporter(goal, { jiraKey }) : undefined;
  if (visual) {
    console.log(`\n🎯 Objetivo: ${goal}${jiraKey ? ` (${jiraKey})` : ""}\n`);
  }

  const outcome = await runMultiAgentDialogue({ goal, jiraKey, workspaceCwd: workspace, reporter });
  const payload = JSON.stringify(outcome, null, 2);

  const defaultOut = path.join(OUTPUT_DIR, "sessions", `run-${Date.now()}.json`);
  const target = outFile ?? defaultOut;
  await writeFile(target, payload, "utf8");

  const flowPath = path.join(OUTPUT_DIR, "flow.html");
  if (visual && reporter) {
    const transcript = outcome.kind === "error" ? [] : outcome.transcript;
    const html = reporter.generateHtml(transcript, {
      kind: outcome.kind,
      reason: outcome.kind === "escalate" ? outcome.reason : outcome.kind === "error" ? outcome.message : undefined,
    });
    await writeFile(flowPath, html, "utf8");
  }

  console.log(`\nOutcome: ${outcome.kind}`);
  console.log(`Transcript: ${target}`);
  if (visual) console.log(`Flujo visual: ${flowPath}`);
  if (outcome.kind === "escalate") process.exit(2);
  if (outcome.kind === "error") process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (cmd === "run" || args.length === 0) {
    await runGoal(cmd === "run" ? args.slice(1) : args);
    return;
  }

  usage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
