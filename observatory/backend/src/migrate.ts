import { readdir, readFile } from "node:fs/promises"; import { createPool } from "./db.js";
const pool=createPool();
await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
for (const f of (await readdir(new URL("../migrations/", import.meta.url))).filter((x) => x.endsWith(".sql")).sort()) {
  const exists=await pool.query("SELECT 1 FROM schema_migrations WHERE filename=$1",[f]);
  if(exists.rowCount) continue;
  const client=await pool.connect();
  try { await client.query("BEGIN"); await client.query(await readFile(new URL(`../migrations/${f}`,import.meta.url),"utf8")); await client.query("INSERT INTO schema_migrations(filename) VALUES($1)",[f]); await client.query("COMMIT"); }
  catch(error){await client.query("ROLLBACK");throw error;} finally {client.release();}
}
await pool.end();
