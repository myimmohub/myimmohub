-- =============================================================================
-- Migration: cpi_index_values + rent_adjustment_suggestions
-- Datum: 2026-05-06
-- =============================================================================
--
-- Verbraucherpreisindex Deutschland (CPI), manuell pflegbar.
-- Standard: Basisjahr 2020 = 100. Quelle: Destatis (https://www.destatis.de).
CREATE TABLE IF NOT EXISTS cpi_index_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  index_date DATE NOT NULL,           -- erster Tag des Monats
  index_value NUMERIC(10,3) NOT NULL, -- z.B. 122.700
  source TEXT,                         -- "destatis" | "manual" | "..."
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(index_date)
);
CREATE INDEX IF NOT EXISTS idx_cpi_index_values_date ON cpi_index_values(index_date DESC);

ALTER TABLE cpi_index_values ENABLE ROW LEVEL SECURITY;

-- CPI ist global und manuell gepflegt — alle authenticated User dürfen lesen +
-- schreiben (pragmatisch für Single-Tenant). Falls ein dedizierter Maintainer
-- gewünscht ist, kann diese Policy später verschärft werden.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'cpi_index_values' AND policyname = 'cpi_full_access_authenticated'
  ) THEN
    CREATE POLICY cpi_full_access_authenticated ON cpi_index_values
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Cron generiert Vorschläge, Vermieter muss explizit annehmen (kein Auto-Apply!)
CREATE TABLE IF NOT EXISTS rent_adjustment_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  effective_date DATE NOT NULL,
  current_cold_rent_cents BIGINT NOT NULL,
  proposed_cold_rent_cents BIGINT NOT NULL,
  delta_cents BIGINT NOT NULL,
  pct_change NUMERIC(7,4) NOT NULL,
  base_value_cents BIGINT NOT NULL,
  base_date DATE NOT NULL,
  base_index NUMERIC(10,3) NOT NULL,
  current_index NUMERIC(10,3) NOT NULL,
  current_index_date DATE NOT NULL,
  is_eligible BOOLEAN NOT NULL,
  next_eligible_date DATE NOT NULL,
  warnings JSONB,
  status TEXT NOT NULL CHECK (status IN ('pending','accepted','rejected','expired')) DEFAULT 'pending',
  decided_at TIMESTAMPTZ,
  decided_by UUID,
  resulting_adjustment_id UUID REFERENCES rent_adjustments(id) ON DELETE SET NULL,
  UNIQUE(tenant_id, effective_date, base_index, current_index)
);

ALTER TABLE rent_adjustment_suggestions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rent_adjustment_suggestions' AND policyname = 'rent_adjustment_suggestions_owner'
  ) THEN
    CREATE POLICY rent_adjustment_suggestions_owner ON rent_adjustment_suggestions
      FOR ALL
      USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
      WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rent_adjustment_suggestions_property
  ON rent_adjustment_suggestions(property_id, status);
CREATE INDEX IF NOT EXISTS idx_rent_adjustment_suggestions_tenant
  ON rent_adjustment_suggestions(tenant_id, status);
