-- =============================================================================
-- Migration: NKA-Modul (Nebenkostenabrechnung)
-- Datum: 2026-05-06
-- =============================================================================
--
-- Tabellen:
--   * nka_perioden            – Abrechnungsperiode pro Property + Steuerjahr
--   * nka_kostenpositionen    – BetrKV-Kostenpositionen einer Periode
--   * nka_mieteranteile       – Snapshot der Verteilung je Mieter
--   * nka_unallocated         – Restbeträge (Leerstand, direct-Mismatch, …)
--
-- Konvention: alle monetären Felder in Cent (BIGINT). RLS via properties.user_id.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. nka_perioden
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nka_perioden (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id  UUID         NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tax_year     INT          NOT NULL CHECK (tax_year BETWEEN 2000 AND 2100),
  period_start DATE         NOT NULL,
  period_end   DATE         NOT NULL,
  status       TEXT         NOT NULL DEFAULT 'draft'
                            CHECK (status IN ('draft', 'distributed', 'sent', 'closed')),
  note         TEXT,
  created_at   TIMESTAMPTZ  DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  DEFAULT NOW(),
  CHECK (period_end >= period_start),
  UNIQUE (property_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_nka_perioden_property_year
  ON nka_perioden (property_id, tax_year);

ALTER TABLE nka_perioden ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nka_perioden' AND policyname = 'nka_perioden_owner'
  ) THEN
    CREATE POLICY nka_perioden_owner ON nka_perioden
      FOR ALL
      USING  (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
      WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. nka_kostenpositionen
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nka_kostenpositionen (
  id                                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id                         UUID          NOT NULL REFERENCES nka_perioden(id) ON DELETE CASCADE,
  position                          TEXT          NOT NULL CHECK (position IN (
                                       'grundsteuer','wasser','abwasser','heizung','warmwasser',
                                       'strassenreinigung','muellabfuhr','gebaeudereinigung',
                                       'gartenpflege','beleuchtung','schornsteinreinigung',
                                       'sach_haftpflicht_versicherung','hauswart',
                                       'gemeinschaftsantenne_kabel','wartung','sonstiges'
                                    )),
  label                             TEXT,
  brutto_cents                      BIGINT        NOT NULL,
  umlagefaehig_pct                  NUMERIC(5,2)  NOT NULL DEFAULT 100
                                                  CHECK (umlagefaehig_pct >= 0 AND umlagefaehig_pct <= 100),
  verteilungsschluessel             TEXT          NOT NULL CHECK (verteilungsschluessel IN
                                                  ('direct','sqm','units','persons','consumption')),
  direct_shares                     JSONB,
  consumption                       JSONB,
  heizkosten_verbrauchsanteil_pct   NUMERIC(5,2),
  transaction_id                    UUID          REFERENCES transactions(id) ON DELETE SET NULL,
  document_id                       UUID          REFERENCES documents(id)    ON DELETE SET NULL,
  created_at                        TIMESTAMPTZ   DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ   DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nka_kostenpositionen_period
  ON nka_kostenpositionen (period_id);

ALTER TABLE nka_kostenpositionen ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nka_kostenpositionen' AND policyname = 'nka_kostenpositionen_owner'
  ) THEN
    CREATE POLICY nka_kostenpositionen_owner ON nka_kostenpositionen
      FOR ALL
      USING (period_id IN (
        SELECT p.id FROM nka_perioden p
        WHERE p.property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      ))
      WITH CHECK (period_id IN (
        SELECT p.id FROM nka_perioden p
        WHERE p.property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      ));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. nka_mieteranteile (Snapshot der Verteilung)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nka_mieteranteile (
  id                       UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id                UUID         NOT NULL REFERENCES nka_perioden(id) ON DELETE CASCADE,
  tenant_id                UUID         NOT NULL REFERENCES tenants(id)      ON DELETE CASCADE,
  unit_id                  UUID         NOT NULL REFERENCES units(id),
  total_share_cents        BIGINT       NOT NULL,
  total_paid_advance_cents BIGINT       NOT NULL,
  balance_cents            BIGINT       NOT NULL,
  breakdown                JSONB        NOT NULL,
  active_days              INT          NOT NULL,
  created_at               TIMESTAMPTZ  DEFAULT NOW(),
  updated_at               TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (period_id, tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_nka_mieteranteile_period
  ON nka_mieteranteile (period_id);

ALTER TABLE nka_mieteranteile ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nka_mieteranteile' AND policyname = 'nka_mieteranteile_owner'
  ) THEN
    CREATE POLICY nka_mieteranteile_owner ON nka_mieteranteile
      FOR ALL
      USING (period_id IN (
        SELECT p.id FROM nka_perioden p
        WHERE p.property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      ))
      WITH CHECK (period_id IN (
        SELECT p.id FROM nka_perioden p
        WHERE p.property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      ));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. nka_unallocated
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nka_unallocated (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id           UUID         NOT NULL REFERENCES nka_perioden(id) ON DELETE CASCADE,
  cost_item_id        UUID         NOT NULL REFERENCES nka_kostenpositionen(id) ON DELETE CASCADE,
  unallocated_cents   BIGINT       NOT NULL,
  reason              TEXT,
  created_at          TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nka_unallocated_period
  ON nka_unallocated (period_id);

ALTER TABLE nka_unallocated ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nka_unallocated' AND policyname = 'nka_unallocated_owner'
  ) THEN
    CREATE POLICY nka_unallocated_owner ON nka_unallocated
      FOR ALL
      USING (period_id IN (
        SELECT p.id FROM nka_perioden p
        WHERE p.property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      ))
      WITH CHECK (period_id IN (
        SELECT p.id FROM nka_perioden p
        WHERE p.property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      ));
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- updated_at-Trigger
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_nka_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS nka_perioden_updated_at ON nka_perioden;
CREATE TRIGGER nka_perioden_updated_at
  BEFORE UPDATE ON nka_perioden
  FOR EACH ROW EXECUTE FUNCTION update_nka_updated_at();

DROP TRIGGER IF EXISTS nka_kostenpositionen_updated_at ON nka_kostenpositionen;
CREATE TRIGGER nka_kostenpositionen_updated_at
  BEFORE UPDATE ON nka_kostenpositionen
  FOR EACH ROW EXECUTE FUNCTION update_nka_updated_at();

DROP TRIGGER IF EXISTS nka_mieteranteile_updated_at ON nka_mieteranteile;
CREATE TRIGGER nka_mieteranteile_updated_at
  BEFORE UPDATE ON nka_mieteranteile
  FOR EACH ROW EXECUTE FUNCTION update_nka_updated_at();
