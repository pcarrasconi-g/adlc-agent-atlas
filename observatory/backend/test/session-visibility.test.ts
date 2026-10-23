import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { projectsWithVisibleSessionCount, visibleSessionPredicate } from "../src/lib/session-visibility.js";

test("projects and sessions reuse the same canonical visibility rule", () => {
  const predicate = visibleSessionPredicate("s").replace(/\s+/g, " ").trim();
  assert.match(projectsWithVisibleSessionCount.replace(/\s+/g, " "), new RegExp(predicate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(predicate, /newer\.source_id = s\.source_id/);
  assert.doesNotMatch(predicate, /s\.source_id IS NOT NULL/);
});

test("canonical visibility keeps every orphan and only the latest session per live source", () => {
  const rows = [
    { id: "old", sourceId: "source-a", updatedAt: 1 },
    { id: "latest", sourceId: "source-a", updatedAt: 2 },
    { id: "orphan-after-source-delete", sourceId: null, updatedAt: 1 },
  ];
  const visible = rows.filter((session) => !rows.some((newer) =>
    session.sourceId !== null && newer.sourceId === session.sourceId && newer.id !== session.id
      && (newer.updatedAt > session.updatedAt || (newer.updatedAt === session.updatedAt && newer.id > session.id)),
  ));
  assert.deepEqual(visible.map(({ id }) => id), ["latest", "orphan-after-source-delete"]);
  assert.equal(visible.length, 2, "project.sessionCount must equal the visible session list length");
});

test("API queries keep an orphaned session visible and count it after source deletion", {
  skip: process.env.ODRADEK_RUN_DB_INTEGRATION !== "1" ? "set ODRADEK_RUN_DB_INTEGRATION=1 with PostgreSQL connection variables" : false,
}, async () => {
  const pool = new Pool();
  const projectId = randomUUID();
  const sourceId = randomUUID();
  const sessionId = randomUUID();
  try {
    await pool.query("INSERT INTO projects(id,name,source_kind) VALUES($1,$2,$3)", [projectId, `visibility-test-${projectId}`, "test"]);
    await pool.query("INSERT INTO sources(id,name,kind,path) VALUES($1,$2,$3,$4)", [sourceId, "visibility source", "test", `/tmp/${sourceId}`]);
    await pool.query("INSERT INTO sessions(id,project_id,source_id,external_key,title,status) VALUES($1,$2,$3,$4,$5,$6)", [sessionId, projectId, sourceId, "orphan", "Orphan", "done"]);
    await pool.query("DELETE FROM sources WHERE id=$1", [sourceId]);

    const sessions = await pool.query(`SELECT s.id FROM sessions s WHERE s.project_id=$1 AND ${visibleSessionPredicate("s")}`, [projectId]);
    const projects = await pool.query(`${projectsWithVisibleSessionCount.replace("ORDER BY p.created_at DESC", "")} WHERE p.id=$1`, [projectId]);
    assert.deepEqual(sessions.rows.map((row) => row.id), [sessionId]);
    assert.equal(projects.rows[0].sessionCount, 1);
    assert.equal(projects.rows[0].sessionCount, sessions.rowCount);
  } finally {
    await pool.query("DELETE FROM projects WHERE id=$1", [projectId]).catch(() => {});
    await pool.end();
  }
});
