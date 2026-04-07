-- =============================================================================
-- Migration: is_confirmed-Spalte für transactions
-- Datum: 2026-04-07
--
-- Speichert ob der Nutzer eine KI-Kategorie manuell bestätigt hat.
-- false (default) = KI-Vorschlag, noch nicht vom Nutzer geprüft
-- true            = vom Nutzer bestätigt (Einzel- oder Batch-Bestätigung)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'is_confirmed'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN is_confirmed BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
