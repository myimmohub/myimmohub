-- =============================================================================
-- Migration: rent_adjustments + Indexmiete/Staffelmiete fields on tenants
-- =============================================================================

-- rent_adjustments: history of rent changes per tenant
CREATE TABLE IF NOT EXISTS rent_adjustments (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid        NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  effective_date         date        NOT NULL,
  cold_rent_cents        integer     NOT NULL,
  additional_costs_cents integer     NOT NULL DEFAULT 0,
  adjustment_type        text        DEFAULT 'manual'
                                     CHECK (adjustment_type IN ('manual', 'index', 'stepped')),
  index_value            numeric,    -- CPI value at time of adjustment (for Indexmiete)
  note                   text,
  created_at             timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS rent_adjustments_tenant_id_idx ON rent_adjustments (tenant_id);
CREATE INDEX IF NOT EXISTS rent_adjustments_effective_date_idx ON rent_adjustments (effective_date);

ALTER TABLE rent_adjustments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rent_adjustments' AND policyname = 'rent_adjustments_owner') THEN
    CREATE POLICY rent_adjustments_owner ON rent_adjustments FOR ALL USING (
      tenant_id IN (
        SELECT t.id FROM tenants t
        JOIN units u ON u.id = t.unit_id
        WHERE u.property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      )
    );
  END IF;
END $$;

-- Add Indexmiete / Staffelmiete fields to tenants
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS index_base_value       numeric,
  ADD COLUMN IF NOT EXISTS index_base_date        date,
  ADD COLUMN IF NOT EXISTS index_interval_months  integer DEFAULT 12,
  ADD COLUMN IF NOT EXISTS staffel_entries        jsonb   DEFAULT '[]';
-- staffel_entries JSON format: [{ "effective_date": "YYYY-MM-DD", "cold_rent_cents": 80000, "additional_costs_cents": 15000 }]
