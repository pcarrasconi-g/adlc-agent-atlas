#!/usr/bin/env node
/**
 * Punto de entrada para `npm link` / instalación global en la máquina del dev.
 * Se conserva el nombre de archivo por compatibilidad; el binario público es `odradek-agent`.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src", "cli.ts");
const args = ["--import", "tsx", cli, ...process.argv.slice(2)];

const result = spawnSync(process.execPath, args, { stdio: "inherit", cwd: root });
process.exit(result.status ?? 1);
