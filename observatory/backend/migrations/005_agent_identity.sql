ALTER TABLE agents ADD COLUMN IF NOT EXISTS profile text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS provider text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS task text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS configured_model text;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS declared_skills jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS evidence_level text NOT NULL DEFAULT 'unverifiable';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS is_principal boolean NOT NULL DEFAULT false;

ALTER TABLE agents DROP CONSTRAINT IF EXISTS agents_evidence_level_values;
ALTER TABLE agents ADD CONSTRAINT agents_evidence_level_values CHECK (evidence_level IN ('declared','host-recorded','behavior-evidenced','unverifiable'));
