-- ============================================================================
-- GbR: jahresbezogene Partnerwerte fuer FE/FB
-- ============================================================================

CREATE TABLE IF NOT EXISTS gbr_partner_tax_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gbr_partner_id UUID NOT NULL REFERENCES gbr_partner(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
  special_expenses NUMERIC(12,2) DEFAULT 0,
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (gbr_partner_id, tax_year)
);

ALTER TABLE gbr_partner_tax_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own gbr_partner_tax_data" ON gbr_partner_tax_data FOR ALL
  USING (
    gbr_partner_id IN (
      SELECT gp.id
      FROM gbr_partner gp
      JOIN gbr_settings gs ON gs.id = gp.gbr_settings_id
      JOIN properties p ON p.id = gs.property_id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    gbr_partner_id IN (
      SELECT gp.id
      FROM gbr_partner gp
      JOIN gbr_settings gs ON gs.id = gp.gbr_settings_id
      JOIN properties p ON p.id = gs.property_id
      WHERE p.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION update_gbr_partner_tax_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gbr_partner_tax_data_updated_at ON gbr_partner_tax_data;

CREATE TRIGGER gbr_partner_tax_data_updated_at
  BEFORE UPDATE ON gbr_partner_tax_data
  FOR EACH ROW EXECUTE FUNCTION update_gbr_partner_tax_data_updated_at();
