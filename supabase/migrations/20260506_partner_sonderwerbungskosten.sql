-- ============================================================================
-- GbR: Sonderwerbungskosten / Sondereinnahmen je Partner
-- ============================================================================
--
-- Tabelle für itemisierte Sonderwerbungskosten (z.B. eigenfinanzierte
-- Schuldzinsen eines Beteiligten) und Sondereinnahmen je GbR-Partner und
-- Steuerjahr. Ergänzt das aggregierte Feld `gbr_partner_tax_data.special_expenses`,
-- das nur eine Summe ohne Klassifikation enthält.
--
-- Hintergrund (Codex-Briefing):
--   Schuldzinsen, die nur ein Beteiligter trägt, gehören NICHT in den
--   Anlage-V-Pool, sondern in Anlage FE 1 als „Saldo aus Sondereinnahmen
--   und Sonderwerbungskosten" beim jeweiligen Beteiligten (z.B. Z.61/Z.122
--   in 2024).
--
-- Konvention:
--   amount > 0  → Sondereinnahme (verschlechtert NICHT das Ergebnis)
--   amount < 0  → Sonderwerbungskosten (vertieft den Verlust)
-- ============================================================================

CREATE TABLE IF NOT EXISTS gbr_partner_special_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  gbr_partner_id UUID NOT NULL REFERENCES gbr_partner(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
  label TEXT NOT NULL,
  amount NUMERIC(14,2) NOT NULL,
  classification TEXT NOT NULL CHECK (
    classification IN ('special_income', 'special_expense_interest', 'special_expense_other')
  ),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (property_id, gbr_partner_id, tax_year, label)
);

ALTER TABLE gbr_partner_special_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner full access on gbr_partner_special_expenses"
  ON gbr_partner_special_expenses
  FOR ALL
  USING (
    property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
  )
  WITH CHECK (
    property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_gbr_partner_special_expenses_property_year
  ON gbr_partner_special_expenses(property_id, tax_year);

CREATE INDEX IF NOT EXISTS idx_gbr_partner_special_expenses_partner_year
  ON gbr_partner_special_expenses(gbr_partner_id, tax_year);

CREATE OR REPLACE FUNCTION update_gbr_partner_special_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gbr_partner_special_expenses_updated_at ON gbr_partner_special_expenses;

CREATE TRIGGER gbr_partner_special_expenses_updated_at
  BEFORE UPDATE ON gbr_partner_special_expenses
  FOR EACH ROW EXECUTE FUNCTION update_gbr_partner_special_expenses_updated_at();
