-- =============================================================================
-- Migration: Steuer-Spalten + Split-Referenz für transactions
-- Datum: 2026-04-06
--
-- Neue Spalten:
--   is_tax_deductible       BOOLEAN  – steuerlich absetzbar (KI-befüllt)
--   anlage_v_zeile          INTEGER  – Zeilennummer in Anlage V (nullable)
--   split_from_transaction_id UUID   – Verweis auf Original-Transaktion bei
--                                      Aufteilung von Kreditraten in Zins/Tilgung
--
-- Dieses Skript ist idempotent: vorhandene Spalten werden nicht doppelt angelegt.
-- =============================================================================

DO $$
BEGIN

  -- is_tax_deductible: Standard NULL (= noch nicht kategorisiert)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'is_tax_deductible'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN is_tax_deductible BOOLEAN DEFAULT NULL;
  END IF;

  -- anlage_v_zeile: Zeilennummer Anlage V, NULL wenn nicht anwendbar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'anlage_v_zeile'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN anlage_v_zeile INTEGER DEFAULT NULL;
  END IF;

  -- split_from_transaction_id: Fremdschlüssel auf transactions.id (Self-Reference)
  -- Wird gesetzt wenn eine Kreditrate in Zins- und Tilgungstransaktion aufgeteilt wird.
  -- ON DELETE SET NULL: Löschen der Original-Transaktion lässt Split-Zeilen bestehen.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'split_from_transaction_id'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN split_from_transaction_id UUID DEFAULT NULL
        REFERENCES transactions(id) ON DELETE SET NULL;
  END IF;

END $$;

-- Index für Split-Abfragen (alle Teilbuchungen einer Original-Transaktion)
CREATE INDEX IF NOT EXISTS transactions_split_from_idx
  ON transactions (split_from_transaction_id)
  WHERE split_from_transaction_id IS NOT NULL;
