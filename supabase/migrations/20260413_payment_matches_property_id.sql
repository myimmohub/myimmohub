ALTER TABLE payment_matches ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS payment_matches_property_id_idx ON payment_matches (property_id);
