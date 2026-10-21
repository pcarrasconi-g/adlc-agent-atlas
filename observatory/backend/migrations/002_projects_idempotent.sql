-- Preserve all historical sessions while folding accidental duplicate projects
-- created by versions before a natural project identity existed.
WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY name, source_kind ORDER BY created_at, id) AS canonical_id
  FROM projects
)
UPDATE sessions AS s
SET project_id = ranked.canonical_id
FROM ranked
WHERE s.project_id = ranked.id AND ranked.id <> ranked.canonical_id;

WITH ranked AS (
  SELECT id,
         first_value(id) OVER (PARTITION BY name, source_kind ORDER BY created_at, id) AS canonical_id
  FROM projects
)
DELETE FROM projects AS p
USING ranked
WHERE p.id = ranked.id AND ranked.id <> ranked.canonical_id;

ALTER TABLE projects
  ADD CONSTRAINT projects_name_source_kind_key UNIQUE (name, source_kind);
