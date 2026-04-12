-- ============================================================================
-- Steuerlogik: Jahresbezogene Tax-Settings + verknüpfte Banking-Transaktionen
-- ============================================================================

BEGIN;

ALTER TABLE tax_settings
ADD COLUMN IF NOT EXISTS tax_year INTEGER NOT NULL DEFAULT 0;

UPDATE tax_settings
SET tax_year = 0
WHERE tax_year IS NULL;

ALTER TABLE tax_settings
DROP CONSTRAINT IF EXISTS tax_settings_property_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tax_settings_tax_year_check'
  ) THEN
    ALTER TABLE tax_settings
    ADD CONSTRAINT tax_settings_tax_year_check
    CHECK (tax_year = 0 OR (tax_year BETWEEN 2000 AND 2100));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS tax_settings_property_year_unique_idx
ON tax_settings (property_id, tax_year);

ALTER TABLE tax_maintenance_distributions
ADD COLUMN IF NOT EXISTS source_transaction_ids UUID[] NOT NULL DEFAULT '{}';

COMMIT;
