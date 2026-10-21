-- Normalize historical ordering once before enforcing one timeline slot per session.
-- Event IDs are retained, so edges remain valid.
WITH numbered AS (
  SELECT id, row_number() OVER (PARTITION BY session_id ORDER BY sequence, created_at, id) - 1 AS next_sequence
  FROM events
)
UPDATE events e SET sequence = numbered.next_sequence
FROM numbered WHERE e.id = numbered.id;

CREATE UNIQUE INDEX IF NOT EXISTS events_session_sequence_key ON events(session_id, sequence);
CREATE INDEX IF NOT EXISTS edges_session_event_idx ON edges(session_id, event_id);
CREATE INDEX IF NOT EXISTS events_session_agent_sequence_idx ON events(session_id, agent_id, sequence DESC);
