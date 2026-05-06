-- =============================================================================
-- Migration: rent_arrears_events
-- Datum: 2026-05-06
-- =============================================================================
CREATE TABLE IF NOT EXISTS rent_arrears_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  event_date DATE NOT NULL,
  arrear_month TEXT NOT NULL,           -- yyyy-mm
  arrear_amount_cents BIGINT NOT NULL,
  level INT NOT NULL CHECK (level IN (0, 1, 2, 3)),  -- 0=Erinnerung, 1=1.Mahnung, 2=2.Mahnung, 3=Letztmalig
  status TEXT NOT NULL CHECK (status IN ('queued','sent','delivered','bounced','failed','cancelled')) DEFAULT 'queued',
  resend_message_id TEXT,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  status_detail TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, arrear_month, level)
);

ALTER TABLE rent_arrears_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rent_arrears_events' AND policyname = 'rent_arrears_events_owner'
  ) THEN
    CREATE POLICY rent_arrears_events_owner ON rent_arrears_events
      FOR ALL
      USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
      WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_rent_arrears_events_property ON rent_arrears_events(property_id, level);
CREATE INDEX IF NOT EXISTS idx_rent_arrears_events_tenant ON rent_arrears_events(tenant_id);
