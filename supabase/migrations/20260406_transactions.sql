-- =============================================================================
-- Migration: transactions-Tabelle anlegen / erweitern
-- Datum: 2026-04-06
--
-- Dieses Skript ist idempotent:
--   • Tabelle existiert noch nicht  → wird komplett angelegt
--   • Tabelle existiert bereits     → fehlende Spalten werden ergänzt,
--                                     bestehende Daten bleiben unberührt
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Tabelle anlegen (falls noch nicht vorhanden)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS transactions (
  id          UUID         DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID         NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID         REFERENCES properties(id) ON DELETE SET NULL,
  date        DATE         NOT NULL,
  amount      DECIMAL(12, 2) NOT NULL,   -- negativ = Ausgabe, positiv = Einnahme
  description TEXT,                      -- Verwendungszweck
  counterpart TEXT,                      -- Empfänger oder Auftraggeber
  category    TEXT,                      -- zunächst leer, später KI-befüllt
  source      TEXT         NOT NULL DEFAULT 'csv_import'
                           CHECK (source IN ('csv_import', 'finapi')),
  import_hash TEXT         UNIQUE,       -- Fingerabdruck gegen Doppel-Importe
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 2. Fehlende Spalten nachträglich ergänzen (falls Tabelle schon existiert)
-- -----------------------------------------------------------------------------
DO $$
BEGIN

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'user_id') THEN
    ALTER TABLE transactions
      ADD COLUMN user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'property_id') THEN
    ALTER TABLE transactions
      ADD COLUMN property_id UUID REFERENCES properties(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'date') THEN
    ALTER TABLE transactions
      ADD COLUMN date DATE NOT NULL DEFAULT CURRENT_DATE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'amount') THEN
    ALTER TABLE transactions
      ADD COLUMN amount DECIMAL(12, 2) NOT NULL DEFAULT 0;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'description') THEN
    ALTER TABLE transactions ADD COLUMN description TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'counterpart') THEN
    ALTER TABLE transactions ADD COLUMN counterpart TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'category') THEN
    ALTER TABLE transactions ADD COLUMN category TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'source') THEN
    ALTER TABLE transactions
      ADD COLUMN source TEXT NOT NULL DEFAULT 'csv_import'
      CHECK (source IN ('csv_import', 'finapi'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'transactions' AND column_name = 'import_hash') THEN
    ALTER TABLE transactions ADD COLUMN import_hash TEXT;
  END IF;

END $$;

-- -----------------------------------------------------------------------------
-- 3. Unique-Constraint auf import_hash (falls noch nicht vorhanden)
--    Verhindert Doppel-Importe derselben Transaktion
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'transactions_import_hash_key'
      AND conrelid = 'transactions'::regclass
  ) THEN
    ALTER TABLE transactions
      ADD CONSTRAINT transactions_import_hash_key UNIQUE (import_hash);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. Row Level Security aktivieren
-- -----------------------------------------------------------------------------
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- Jeder Nutzer sieht und verwaltet nur seine eigenen Zeilen
-- (CREATE POLICY IF NOT EXISTS wird von Supabase nicht unterstützt → DO-Block)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Nutzer sehen eigene Transaktionen') THEN
    CREATE POLICY "Nutzer sehen eigene Transaktionen"
      ON transactions FOR SELECT USING (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Nutzer können eigene Transaktionen einfügen') THEN
    CREATE POLICY "Nutzer können eigene Transaktionen einfügen"
      ON transactions FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Nutzer können eigene Transaktionen bearbeiten') THEN
    CREATE POLICY "Nutzer können eigene Transaktionen bearbeiten"
      ON transactions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'transactions' AND policyname = 'Nutzer können eigene Transaktionen löschen') THEN
    CREATE POLICY "Nutzer können eigene Transaktionen löschen"
      ON transactions FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 5. Indizes für häufige Abfragen
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS transactions_user_id_idx
  ON transactions (user_id);

CREATE INDEX IF NOT EXISTS transactions_property_id_idx
  ON transactions (property_id)
  WHERE property_id IS NOT NULL;

-- Zeitreihen-Abfragen (z. B. Cashflow-Chart) laufen über date DESC
CREATE INDEX IF NOT EXISTS transactions_user_date_idx
  ON transactions (user_id, date DESC);

-- Partieller Index: nur Zeilen mit gesetztem import_hash prüfen
CREATE INDEX IF NOT EXISTS transactions_import_hash_idx
  ON transactions (import_hash)
  WHERE import_hash IS NOT NULL;
