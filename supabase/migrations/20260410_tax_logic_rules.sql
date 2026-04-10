-- ============================================================================
-- Steuerlogik-Regeln: Klassifizierung, Verteilungswahl, 15%-Pruefung
-- ============================================================================

ALTER TABLE tax_maintenance_distributions
ADD COLUMN IF NOT EXISTS classification TEXT;

ALTER TABLE tax_maintenance_distributions
ADD COLUMN IF NOT EXISTS deduction_mode TEXT;

UPDATE tax_maintenance_distributions
SET classification = COALESCE(classification, 'maintenance_expense'),
    deduction_mode = COALESCE(deduction_mode, CASE WHEN distribution_years > 1 THEN 'distributed' ELSE 'immediate' END);

ALTER TABLE tax_maintenance_distributions
ALTER COLUMN classification SET DEFAULT 'maintenance_expense';

ALTER TABLE tax_maintenance_distributions
ALTER COLUMN deduction_mode SET DEFAULT 'distributed';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tax_maintenance_distributions_classification_check'
  ) THEN
    ALTER TABLE tax_maintenance_distributions
    ADD CONSTRAINT tax_maintenance_distributions_classification_check
    CHECK (classification IN ('maintenance_expense', 'production_cost', 'depreciation'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tax_maintenance_distributions_deduction_mode_check'
  ) THEN
    ALTER TABLE tax_maintenance_distributions
    ADD CONSTRAINT tax_maintenance_distributions_deduction_mode_check
    CHECK (deduction_mode IN ('immediate', 'distributed'));
  END IF;
END $$;

ALTER TABLE tax_maintenance_distributions
ALTER COLUMN classification SET NOT NULL;

ALTER TABLE tax_maintenance_distributions
ALTER COLUMN deduction_mode SET NOT NULL;
