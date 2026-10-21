-- Preserve causal provenance and the time span in which a relationship is
-- active. Existing adjacency links remain usable and are explicitly marked as
-- inferred with a conservative confidence score.
ALTER TABLE edges ADD COLUMN IF NOT EXISTS provenance text NOT NULL DEFAULT 'inferred';
ALTER TABLE edges ADD COLUMN IF NOT EXISTS confidence double precision NOT NULL DEFAULT 0.25;
ALTER TABLE edges ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE edges ADD COLUMN IF NOT EXISTS sequence_start integer;
ALTER TABLE edges ADD COLUMN IF NOT EXISTS sequence_end integer;

UPDATE edges ed
SET sequence_start = COALESCE(ed.sequence_start, ev.sequence),
    sequence_end = COALESCE(ed.sequence_end, ev.sequence)
FROM events ev
WHERE ev.id = ed.event_id;

ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_confidence_bounds;
ALTER TABLE edges ADD CONSTRAINT edges_confidence_bounds CHECK (confidence >= 0 AND confidence <= 1);
ALTER TABLE edges DROP CONSTRAINT IF EXISTS edges_sequence_bounds;
ALTER TABLE edges ADD CONSTRAINT edges_sequence_bounds CHECK (sequence_end IS NULL OR sequence_start IS NULL OR sequence_end >= sequence_start);
CREATE INDEX IF NOT EXISTS edges_session_sequence_bounds_idx ON edges(session_id, sequence_start, sequence_end);
