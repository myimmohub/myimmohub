-- ELSTER-Modul: tax_data Tabelle
-- Jeder Eintrag entspricht einem Steuerjahr für ein Objekt (Anlage V).

CREATE TABLE IF NOT EXISTS tax_data (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id                     UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tax_year                        INTEGER NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
  created_at                      TIMESTAMPTZ DEFAULT now(),
  updated_at                      TIMESTAMPTZ DEFAULT now(),

  -- Objekt-Stammdaten (Z. 1-8)
  tax_ref                         TEXT,
  ownership_share_pct             NUMERIC(5,2),
  property_type                   TEXT,
  build_year                      INTEGER,
  acquisition_date                DATE,
  acquisition_cost_building       NUMERIC(12,2),

  -- Einnahmen (Z. 9-14)
  rent_income                     NUMERIC(12,2),
  deposits_received               NUMERIC(12,2),
  rent_prior_year                 NUMERIC(12,2),
  operating_costs_income          NUMERIC(12,2),
  other_income                    NUMERIC(12,2),

  -- Werbungskosten (Z. 17-53)
  loan_interest                   NUMERIC(12,2),
  property_tax                    NUMERIC(12,2),
  hoa_fees                        NUMERIC(12,2),
  insurance                       NUMERIC(12,2),
  water_sewage                    NUMERIC(12,2),
  waste_disposal                  NUMERIC(12,2),
  property_management             NUMERIC(12,2),
  bank_fees                       NUMERIC(12,2),
  maintenance_costs               NUMERIC(12,2),
  other_expenses                  NUMERIC(12,2),

  -- AfA (Z. 33-36)
  depreciation_building           NUMERIC(12,2),
  depreciation_outdoor            NUMERIC(12,2),
  depreciation_fixtures           NUMERIC(12,2),

  -- Sonderwerbungskosten (Z. 60-61)
  special_deduction_7b            NUMERIC(12,2),
  special_deduction_renovation    NUMERIC(12,2),

  -- Import-Metadaten
  import_source                   TEXT,     -- 'pdf_import' | 'manual' | 'calculated'
  import_confidence               JSONB,    -- { field_name: 'high'|'medium'|'low' }

  UNIQUE (property_id, tax_year)
);

-- Row Level Security
ALTER TABLE tax_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user owns via property" ON tax_data
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "user inserts via property" ON tax_data
  FOR INSERT WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "user updates via property" ON tax_data
  FOR UPDATE USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "user deletes via property" ON tax_data
  FOR DELETE USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION update_tax_data_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tax_data_updated_at
  BEFORE UPDATE ON tax_data
  FOR EACH ROW EXECUTE FUNCTION update_tax_data_updated_at();
