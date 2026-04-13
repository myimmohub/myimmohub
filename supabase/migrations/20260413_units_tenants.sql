-- =============================================================================
-- Migration: units, tenants, cost_allocations, payment_matches
-- Datum: 2026-04-13
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. units
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS units (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid        NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  label       text        NOT NULL,
  unit_type   text        DEFAULT 'residential'
                          CHECK (unit_type IN ('residential', 'commercial', 'parking', 'other')),
  floor       text,
  area_sqm    numeric,
  rooms       numeric,
  features    jsonb       DEFAULT '{}',
  meter_ids   jsonb       DEFAULT '{}',
  vat_liable  boolean     DEFAULT false,
  is_active   boolean     DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS units_property_id_idx ON units (property_id);
CREATE INDEX IF NOT EXISTS units_is_active_idx   ON units (is_active);

ALTER TABLE units ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'units' AND policyname = 'units_owner') THEN
    CREATE POLICY units_owner ON units FOR ALL USING (
      property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 2. tenants
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tenants (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id               uuid        NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  first_name            text,
  last_name             text,
  email                 text,
  phone                 text,
  additional_tenants    jsonb       DEFAULT '[]',
  lease_start           date        NOT NULL,
  lease_end             date,
  cold_rent_cents       integer     NOT NULL,
  additional_costs_cents integer    DEFAULT 0,
  deposit_cents         integer     DEFAULT 0,
  payment_reference     text,
  rent_type             text        DEFAULT 'fixed'
                                    CHECK (rent_type IN ('fixed', 'index', 'stepped')),
  status                text        DEFAULT 'active'
                                    CHECK (status IN ('active', 'notice_given', 'ended')),
  source_document_id    uuid,
  extraction_confidence jsonb,
  created_at            timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenants_unit_id_idx ON tenants (unit_id);
CREATE INDEX IF NOT EXISTS tenants_status_idx  ON tenants (status);

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenants' AND policyname = 'tenants_owner') THEN
    CREATE POLICY tenants_owner ON tenants FOR ALL USING (
      unit_id IN (
        SELECT id FROM units
        WHERE property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      )
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3. cost_allocations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_allocations (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id    uuid        NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  unit_id           uuid        NOT NULL REFERENCES units(id) ON DELETE CASCADE,
  allocation_method text        DEFAULT 'direct'
                                CHECK (allocation_method IN ('direct', 'sqm', 'meter_reading', 'manual')),
  share_percent     numeric(5,2),
  amount_cents      integer,
  meter_value_from  numeric,
  meter_value_to    numeric,
  note              text,
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cost_allocations_transaction_id_idx ON cost_allocations (transaction_id);
CREATE INDEX IF NOT EXISTS cost_allocations_unit_id_idx        ON cost_allocations (unit_id);

ALTER TABLE cost_allocations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cost_allocations' AND policyname = 'cost_allocations_owner') THEN
    CREATE POLICY cost_allocations_owner ON cost_allocations FOR ALL USING (
      unit_id IN (
        SELECT id FROM units
        WHERE property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      )
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 4. payment_matches
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment_matches (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id   uuid        NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
  tenant_id        uuid        REFERENCES tenants(id) ON DELETE CASCADE,
  unit_id          uuid        REFERENCES units(id) ON DELETE CASCADE,
  match_method     text        DEFAULT 'manual'
                               CHECK (match_method IN ('reference', 'amount', 'sender_name', 'manual')),
  match_confidence numeric(4,3) DEFAULT 0,
  status           text        DEFAULT 'suggested'
                               CHECK (status IN ('auto_matched', 'suggested', 'confirmed', 'rejected')),
  direction        text        DEFAULT 'incoming'
                               CHECK (direction IN ('incoming', 'outgoing')),
  period_month     date,
  matched_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_matches_transaction_id_idx ON payment_matches (transaction_id);
CREATE INDEX IF NOT EXISTS payment_matches_tenant_id_idx      ON payment_matches (tenant_id);
CREATE INDEX IF NOT EXISTS payment_matches_status_idx         ON payment_matches (status);

ALTER TABLE payment_matches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'payment_matches' AND policyname = 'payment_matches_owner') THEN
    CREATE POLICY payment_matches_owner ON payment_matches FOR ALL USING (
      tenant_id IN (
        SELECT id FROM tenants
        WHERE unit_id IN (
          SELECT id FROM units
          WHERE property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
        )
      )
      OR
      unit_id IN (
        SELECT id FROM units
        WHERE property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      )
    );
  END IF;
END $$;
