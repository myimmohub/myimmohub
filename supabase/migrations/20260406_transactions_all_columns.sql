-- =============================================================================
-- Konsolidierte Migration: alle fehlenden Spalten für transactions
-- Bitte einmalig in Supabase → SQL Editor ausführen.
-- Das Script ist vollständig idempotent (mehrfaches Ausführen sicher).
-- =============================================================================

DO $$
BEGIN

  -- is_tax_deductible: true = steuerlich absetzbar (Werbungskosten)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'is_tax_deductible'
  ) THEN
    ALTER TABLE transactions ADD COLUMN is_tax_deductible BOOLEAN DEFAULT NULL;
  END IF;

  -- anlage_v_zeile: Zeilennummer in der deutschen Anlage V (z. B. 35 = Schuldzinsen)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'anlage_v_zeile'
  ) THEN
    ALTER TABLE transactions ADD COLUMN anlage_v_zeile INTEGER DEFAULT NULL;
  END IF;

  -- split_from_transaction_id: Verweis auf Original-Transaktion bei Zins/Tilgung-Aufteilung
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'split_from_transaction_id'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN split_from_transaction_id UUID DEFAULT NULL
        REFERENCES transactions(id) ON DELETE SET NULL;
  END IF;

  -- confidence: KI-Konfidenzwert der Kategorisierung (0.000–1.000)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'transactions' AND column_name = 'confidence'
  ) THEN
    ALTER TABLE transactions
      ADD COLUMN confidence DECIMAL(4, 3) DEFAULT NULL
        CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;

END $$;

-- Index für Split-Abfragen
CREATE INDEX IF NOT EXISTS transactions_split_from_idx
  ON transactions (split_from_transaction_id)
  WHERE split_from_transaction_id IS NOT NULL;
