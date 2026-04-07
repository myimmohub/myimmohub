-- =============================================================================
-- Migration: confidence-Spalte für transactions
-- Datum: 2026-04-06
--
-- Speichert den KI-Konfidenzwert (0.000–1.000) der Kategorisierung.
-- Wird von "Alle bestätigen (confidence > 0.85)" in der Review-UI genutzt.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN confidence DECIMAL(4, 3) DEFAULT NULL
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;
