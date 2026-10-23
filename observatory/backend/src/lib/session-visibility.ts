export const visibleSessionPredicate = (sessionAlias: string) => `NOT EXISTS(
  SELECT 1 FROM sessions newer
  WHERE newer.source_id = ${sessionAlias}.source_id
    AND newer.id <> ${sessionAlias}.id
    AND (newer.updated_at, newer.id) > (${sessionAlias}.updated_at, ${sessionAlias}.id)
)`;

export const projectsWithVisibleSessionCount = `
  SELECT p.id,p.name,p.source_kind AS "sourceKind",p.created_at AS "createdAt",
    COALESCE(visible."sessionCount",0)::int AS "sessionCount"
  FROM projects p
  LEFT JOIN LATERAL (
    SELECT count(*)::int AS "sessionCount"
    FROM sessions s
    WHERE s.project_id=p.id AND ${visibleSessionPredicate("s")}
  ) visible ON true
  ORDER BY p.created_at DESC`;
