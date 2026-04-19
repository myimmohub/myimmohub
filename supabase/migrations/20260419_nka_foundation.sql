-- ============================================================================
-- Nebenkostenabrechnung Foundation
-- Phase 1-3: Tabellen, RLS, Category bridge, erste Seed-Daten
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Erweiterungen bestehender Tabellen
-- ----------------------------------------------------------------------------

ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS ist_umlagefaehig BOOLEAN,
ADD COLUMN IF NOT EXISTS betr_kv_position INTEGER CHECK (betr_kv_position BETWEEN 1 AND 17),
ADD COLUMN IF NOT EXISTS umlageschluessel_override TEXT
  CHECK (umlageschluessel_override IN ('wohnflaeche','personen','verbrauch','einheiten','mea')),
ADD COLUMN IF NOT EXISTS anlage_v_erfasst_via TEXT;

ALTER TABLE tenants
ADD COLUMN IF NOT EXISTS nka_abrechnungszeitraum_start DATE,
ADD COLUMN IF NOT EXISTS umlageschluessel_pro_position_json JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS vorauszahlung_nk_monatlich NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS anteil_wohnflaeche_m2 NUMERIC(8,2),
ADD COLUMN IF NOT EXISTS personen_anzahl INTEGER DEFAULT 1;

ALTER TABLE properties
ADD COLUMN IF NOT EXISTS wohnflaeche_gesamt_m2 NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS anzahl_einheiten INTEGER DEFAULT 1,
ADD COLUMN IF NOT EXISTS miteigentumsanteile_gesamt NUMERIC(12,6),
ADD COLUMN IF NOT EXISTS ist_weg BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS hausverwaltung_name TEXT,
ADD COLUMN IF NOT EXISTS hausverwaltung_email TEXT;

ALTER TABLE categories
ADD COLUMN IF NOT EXISTS ist_umlagefaehig_default BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS betr_kv_position INTEGER CHECK (betr_kv_position BETWEEN 1 AND 17),
ADD COLUMN IF NOT EXISTS umlageschluessel_default TEXT
  CHECK (umlageschluessel_default IN ('wohnflaeche','personen','verbrauch','einheiten','mea'));

-- ----------------------------------------------------------------------------
-- Neue Tabellen
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS nka_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gbr_settings_id UUID REFERENCES gbr_settings(id) ON DELETE SET NULL,
  zeitraum_von DATE NOT NULL,
  zeitraum_bis DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'offen'
    CHECK (status IN ('offen','in_bearbeitung','versandt','widerspruch','abgeschlossen','verfristet')),
  deadline_abrechnung DATE GENERATED ALWAYS AS (((zeitraum_bis + INTERVAL '12 months')::date)) STORED,
  versandt_am TIMESTAMPTZ,
  widerspruchsfrist_bis DATE,
  gesamtkosten_umlagefaehig NUMERIC(12,2) NOT NULL DEFAULT 0,
  gesamtkosten_nicht_umlagefaehig NUMERIC(12,2) NOT NULL DEFAULT 0,
  leerstandsanteil_tage INTEGER NOT NULL DEFAULT 0,
  leerstandsanteil_eur NUMERIC(12,2) NOT NULL DEFAULT 0,
  pdf_pfad TEXT,
  erstellt_von_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(property_id, zeitraum_von, zeitraum_bis)
);

CREATE TABLE IF NOT EXISTS nka_cost_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nka_periode_id UUID NOT NULL REFERENCES nka_periods(id) ON DELETE CASCADE,
  betr_kv_position INTEGER NOT NULL CHECK (betr_kv_position BETWEEN 1 AND 17),
  bezeichnung TEXT NOT NULL,
  betrag_brutto NUMERIC(12,2) NOT NULL,
  umlageschluessel TEXT NOT NULL DEFAULT 'wohnflaeche'
    CHECK (umlageschluessel IN ('wohnflaeche','personen','verbrauch','einheiten','mea')),
  quelle TEXT NOT NULL
    CHECK (quelle IN ('transaktion','manuell','weg_import','messdienst_api','messdienst_pdf')),
  transaktion_id UUID REFERENCES transactions(id) ON DELETE SET NULL,
  beleg_pfad TEXT,
  ist_umlagefaehig BOOLEAN NOT NULL DEFAULT true,
  notiz TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nka_tenant_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nka_periode_id UUID NOT NULL REFERENCES nka_periods(id) ON DELETE CASCADE,
  mieter_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  mietvertrag_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  bewohnt_von DATE NOT NULL,
  bewohnt_bis DATE NOT NULL,
  tage_anteil INTEGER NOT NULL,
  personen_anzahl INTEGER NOT NULL DEFAULT 1,
  anteil_wohnflaeche_m2 NUMERIC(8,2),
  summe_anteile NUMERIC(12,2) NOT NULL DEFAULT 0,
  summe_vorauszahlungen NUMERIC(12,2) NOT NULL DEFAULT 0,
  nachzahlung_oder_guthaben NUMERIC(12,2) GENERATED ALWAYS AS (summe_anteile - summe_vorauszahlungen) STORED,
  anpassung_vorauszahlung_neu NUMERIC(12,2),
  faelligkeit_nachzahlung DATE,
  versandt_an_email TEXT,
  versandt_am TIMESTAMPTZ,
  postmark_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nka_heating_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nka_periode_id UUID NOT NULL REFERENCES nka_periods(id) ON DELETE CASCADE,
  messdienst TEXT NOT NULL CHECK (messdienst IN ('techem','ista','minol','brunata','kalo','sonstige')),
  quelle TEXT NOT NULL CHECK (quelle IN ('api','pdf_upload')),
  original_pdf_pfad TEXT,
  api_rohdaten_json JSONB,
  extrahierte_daten_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  gesamtkosten_heizung NUMERIC(12,2),
  gesamtkosten_warmwasser NUMERIC(12,2),
  vorwegabzug NUMERIC(12,2) NOT NULL DEFAULT 0,
  heizkosten_pro_einheit_json JSONB,
  status TEXT NOT NULL DEFAULT 'extrahiert' CHECK (status IN ('extrahiert','validiert','abgelehnt')),
  validiert_am TIMESTAMPTZ,
  validiert_von_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nka_weg_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  nka_periode_id UUID REFERENCES nka_periods(id) ON DELETE SET NULL,
  abrechnungsjahr INTEGER NOT NULL,
  hausverwaltung TEXT,
  abrechnungsdatum DATE,
  original_pdf_pfad TEXT NOT NULL,
  extrahierte_positionen_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  umlagefaehige_gesamtkosten NUMERIC(12,2),
  nicht_umlagefaehige_gesamtkosten NUMERIC(12,2),
  instandhaltungsruecklage_eingezahlt NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'extrahiert' CHECK (status IN ('extrahiert','validiert','uebertragen_in_nka','abgelehnt')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS nka_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nka_tenant_share_id UUID NOT NULL REFERENCES nka_tenant_shares(id) ON DELETE CASCADE,
  eingegangen_am DATE NOT NULL,
  grund TEXT,
  strittiger_betrag NUMERIC(12,2),
  status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','in_klaerung','abgeholfen','abgelehnt','rechtsstreit')),
  notizen TEXT,
  anhaenge_pfade TEXT[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nka_periods_deadline ON nka_periods(deadline_abrechnung)
  WHERE status NOT IN ('abgeschlossen','verfristet');
CREATE INDEX IF NOT EXISTS idx_nka_cost_items_period ON nka_cost_items(nka_periode_id);
CREATE INDEX IF NOT EXISTS idx_nka_cost_items_tx ON nka_cost_items(transaktion_id);
CREATE INDEX IF NOT EXISTS idx_nka_tenant_shares_period ON nka_tenant_shares(nka_periode_id);
CREATE INDEX IF NOT EXISTS idx_nka_tenant_shares_tenant ON nka_tenant_shares(mieter_id);
CREATE INDEX IF NOT EXISTS idx_nka_weg_imports_property_year ON nka_weg_imports(property_id, abrechnungsjahr);

-- ----------------------------------------------------------------------------
-- RLS
-- ----------------------------------------------------------------------------

ALTER TABLE nka_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE nka_cost_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE nka_tenant_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE nka_heating_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE nka_weg_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE nka_disputes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nka_periods' AND policyname = 'nka_periods_owner') THEN
    CREATE POLICY nka_periods_owner ON nka_periods FOR ALL
      USING (
        user_id = auth.uid()
        OR property_id IN (
          SELECT property_id FROM user_roles
          WHERE user_id = auth.uid() AND rolle = 'steuerberater'
        )
      )
      WITH CHECK (
        user_id = auth.uid()
        OR property_id IN (
          SELECT property_id FROM user_roles
          WHERE user_id = auth.uid() AND rolle IN ('admin','eigentuemer','buchhalter')
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nka_cost_items' AND policyname = 'nka_cost_items_owner') THEN
    CREATE POLICY nka_cost_items_owner ON nka_cost_items FOR ALL
      USING (
        nka_periode_id IN (SELECT id FROM nka_periods WHERE user_id = auth.uid())
      )
      WITH CHECK (
        nka_periode_id IN (SELECT id FROM nka_periods WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nka_tenant_shares' AND policyname = 'nka_tenant_shares_owner') THEN
    CREATE POLICY nka_tenant_shares_owner ON nka_tenant_shares FOR ALL
      USING (
        nka_periode_id IN (SELECT id FROM nka_periods WHERE user_id = auth.uid())
      )
      WITH CHECK (
        nka_periode_id IN (SELECT id FROM nka_periods WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nka_heating_imports' AND policyname = 'nka_heating_imports_owner') THEN
    CREATE POLICY nka_heating_imports_owner ON nka_heating_imports FOR ALL
      USING (
        nka_periode_id IN (SELECT id FROM nka_periods WHERE user_id = auth.uid())
      )
      WITH CHECK (
        nka_periode_id IN (SELECT id FROM nka_periods WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nka_weg_imports' AND policyname = 'nka_weg_imports_owner') THEN
    CREATE POLICY nka_weg_imports_owner ON nka_weg_imports FOR ALL
      USING (
        property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      )
      WITH CHECK (
        property_id IN (SELECT id FROM properties WHERE user_id = auth.uid())
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'nka_disputes' AND policyname = 'nka_disputes_owner') THEN
    CREATE POLICY nka_disputes_owner ON nka_disputes FOR ALL
      USING (
        nka_tenant_share_id IN (
          SELECT nts.id
          FROM nka_tenant_shares nts
          JOIN nka_periods np ON np.id = nts.nka_periode_id
          WHERE np.user_id = auth.uid()
        )
      )
      WITH CHECK (
        nka_tenant_share_id IN (
          SELECT nts.id
          FROM nka_tenant_shares nts
          JOIN nka_periods np ON np.id = nts.nka_periode_id
          WHERE np.user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Seed-BetrKV-Kategorien
-- ----------------------------------------------------------------------------

INSERT INTO categories (
  label, icon, gruppe, typ, anlage_v, editierbar, badge_100pct, is_system,
  ist_umlagefaehig_default, betr_kv_position, umlageschluessel_default
) VALUES
  ('Wasserversorgung', '🚰', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 2, 'personen'),
  ('Entwässerung', '💧', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 3, 'personen'),
  ('Heizung', '🔥', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 4, 'verbrauch'),
  ('Warmwasser', '🛁', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 5, 'verbrauch'),
  ('Verbundene Heizungs-/WW-Anlage', '♨️', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 6, 'verbrauch'),
  ('Aufzug', '🛗', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 7, 'wohnflaeche'),
  ('Straßenreinigung / Müllabfuhr', '🧹', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 8, 'wohnflaeche'),
  ('Gebäudereinigung / Ungezieferbekämpfung', '🪳', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 9, 'wohnflaeche'),
  ('Gartenpflege', '🌿', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 10, 'wohnflaeche'),
  ('Beleuchtung (Allgemeinstrom)', '💡', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 11, 'wohnflaeche'),
  ('Schornsteinreinigung', '🏭', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 12, 'wohnflaeche'),
  ('Gebäudeversicherung', '🛡️', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 13, 'wohnflaeche'),
  ('Hauswart', '🧑‍🔧', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 14, 'wohnflaeche'),
  ('Gemeinschaftsantenne / Breitband', '📡', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 15, 'einheiten'),
  ('Gemeinschaftswaschanlage', '🫧', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 16, 'einheiten'),
  ('Sonstige Betriebskosten', '📦', 'Betriebskosten', 'ausgabe', 'Z. 46', false, false, true, true, 17, 'wohnflaeche')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE VIEW v_nka_status_monitor AS
SELECT
  np.id,
  np.property_id,
  p.name AS property_name,
  np.zeitraum_von,
  np.zeitraum_bis,
  np.status,
  np.deadline_abrechnung,
  CASE
    WHEN np.status = 'abgeschlossen' THEN 'done'
    WHEN np.deadline_abrechnung < CURRENT_DATE THEN 'critical'
    WHEN np.deadline_abrechnung <= CURRENT_DATE + INTERVAL '30 days' THEN 'warning'
    WHEN np.deadline_abrechnung <= CURRENT_DATE + INTERVAL '90 days' THEN 'attention'
    ELSE 'ok'
  END AS deadline_status
FROM nka_periods np
JOIN properties p ON p.id = np.property_id;
