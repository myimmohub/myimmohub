-- ============================================================================
-- Komponentenbasierte Steuerlogik: AfA-Positionen und verteilter Aufwand
-- ============================================================================

CREATE TABLE IF NOT EXISTS tax_depreciation_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
  item_type TEXT NOT NULL CHECK (item_type IN ('building', 'outdoor', 'movable_asset')),
  label TEXT NOT NULL,
  gross_annual_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  apply_rental_ratio BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tax_maintenance_distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source_year INTEGER NOT NULL CHECK (source_year BETWEEN 2000 AND 2100),
  label TEXT NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  distribution_years INTEGER NOT NULL CHECK (distribution_years BETWEEN 1 AND 50),
  current_year_share_override NUMERIC(12,2),
  apply_rental_ratio BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tax_depreciation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_maintenance_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own tax_depreciation_items" ON tax_depreciation_items;
CREATE POLICY "own tax_depreciation_items" ON tax_depreciation_items FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

DROP POLICY IF EXISTS "own tax_maintenance_distributions" ON tax_maintenance_distributions;
CREATE POLICY "own tax_maintenance_distributions" ON tax_maintenance_distributions FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE OR REPLACE FUNCTION update_tax_logic_item_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tax_depreciation_items_updated_at ON tax_depreciation_items;
CREATE TRIGGER tax_depreciation_items_updated_at
  BEFORE UPDATE ON tax_depreciation_items
  FOR EACH ROW EXECUTE FUNCTION update_tax_logic_item_updated_at();

DROP TRIGGER IF EXISTS tax_maintenance_distributions_updated_at ON tax_maintenance_distributions;
CREATE TRIGGER tax_maintenance_distributions_updated_at
  BEFORE UPDATE ON tax_maintenance_distributions
  FOR EACH ROW EXECUTE FUNCTION update_tax_logic_item_updated_at();
