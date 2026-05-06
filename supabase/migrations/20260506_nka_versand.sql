-- =============================================================================
-- Migration: NKA-Versand (Mailout der Mieterabrechnung über Resend)
-- Datum: 2026-05-06
-- =============================================================================
--
-- Zweck:
--   * Persistiert pro (period_id, tenant_id) genau einen Versand-Datensatz inkl.
--     Resend-Message-ID. Webhook-Updates aktualisieren `status`/`*_at`-Spalten.
--
-- RLS: Owner-Schema analog zu nka_perioden — Zugriff über properties.user_id.
-- =============================================================================

CREATE TABLE IF NOT EXISTS nka_versand (
  id                  UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id           UUID         NOT NULL REFERENCES nka_perioden(id) ON DELETE CASCADE,
  tenant_id           UUID         NOT NULL REFERENCES tenants(id)      ON DELETE CASCADE,
  property_id         UUID         NOT NULL REFERENCES properties(id)   ON DELETE CASCADE,
  recipient_email     TEXT         NOT NULL,
  subject             TEXT         NOT NULL,
  body_text           TEXT         NOT NULL,
  resend_message_id   TEXT,
  status              TEXT         NOT NULL DEFAULT 'queued'
                                   CHECK (status IN ('queued','sent','delivered','bounced','complained','failed')),
  status_detail       TEXT,
  sent_at             TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,
  bounced_at          TIMESTAMPTZ,
  failed_at           TIMESTAMPTZ,
  pdf_size_bytes      INT,
  created_at          TIMESTAMPTZ  DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  DEFAULT NOW(),
  UNIQUE (period_id, tenant_id)
);

ALTER TABLE nka_versand ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'nka_versand' AND policyname = 'Owner full access on nka_versand'
  ) THEN
    CREATE POLICY "Owner full access on nka_versand" ON nka_versand
      FOR ALL
      USING  (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
      WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nka_versand_property
  ON nka_versand (property_id);

CREATE INDEX IF NOT EXISTS idx_nka_versand_resend_id
  ON nka_versand (resend_message_id);

-- updated_at-Trigger nutzt die in 20260506_nka_perioden_kostenpositionen.sql
-- definierte Funktion update_nka_updated_at().
DROP TRIGGER IF EXISTS nka_versand_updated_at ON nka_versand;
CREATE TRIGGER nka_versand_updated_at
  BEFORE UPDATE ON nka_versand
  FOR EACH ROW EXECUTE FUNCTION update_nka_updated_at();
