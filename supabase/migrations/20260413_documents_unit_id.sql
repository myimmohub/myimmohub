-- Mietverträge einer Einheit zuordnen
ALTER TABLE documents ADD COLUMN IF NOT EXISTS unit_id UUID REFERENCES units(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS documents_unit_id_idx ON documents (unit_id);
