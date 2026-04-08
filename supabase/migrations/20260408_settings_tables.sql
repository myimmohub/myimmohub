-- ============================================================================
-- Steuereinstellungen & Kategorie-Mapping – Tabellen
-- ============================================================================

-- Kategorien (Anlage-V-Mapping)
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  icon TEXT DEFAULT '📌',
  gruppe TEXT NOT NULL,
  typ TEXT NOT NULL CHECK (typ IN ('einnahme', 'ausgabe')),
  anlage_v TEXT,
  editierbar BOOLEAN DEFAULT true,
  badge_100pct BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT false,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Steuerliche Details pro Immobilie
CREATE TABLE IF NOT EXISTS tax_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  objekttyp TEXT DEFAULT 'dauervermietung' CHECK (objekttyp IN ('dauervermietung', 'ferienwohnung_teil', 'ferienwohnung_voll', 'gewerbe')),
  eigennutzung_tage INT DEFAULT 0,
  gesamt_tage INT DEFAULT 365,
  kleinunternehmer BOOLEAN DEFAULT false,
  option_ust BOOLEAN DEFAULT false,
  ak_gebaeude NUMERIC,
  baujahr INT,
  afa_satz TEXT DEFAULT '2',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- GWG & Abschreibung pro Immobilie
CREATE TABLE IF NOT EXISTS gwg_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  sofortabzug_grenze NUMERIC DEFAULT 800,
  sammelposten_grenze NUMERIC DEFAULT 1000,
  nutzungsdauern JSONB DEFAULT '{"einbaukueche":10,"bodenbelaege":15,"heizungsanlage":20,"moebel":13,"elektrogeraete":5,"badausstattung":20}',
  para_7b BOOLEAN DEFAULT false,
  denkmal BOOLEAN DEFAULT false,
  para_35a BOOLEAN DEFAULT false
);

-- GbR-Stammdaten pro Immobilie
CREATE TABLE IF NOT EXISTS gbr_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE UNIQUE,
  name TEXT,
  steuernummer TEXT,
  finanzamt TEXT,
  veranlagungszeitraum INT,
  sonder_werbungskosten BOOLEAN DEFAULT false,
  feststellungserklaerung BOOLEAN DEFAULT false,
  teilweise_eigennutzung BOOLEAN DEFAULT false
);

-- GbR-Gesellschafter
CREATE TABLE IF NOT EXISTS gbr_partner (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gbr_settings_id UUID NOT NULL REFERENCES gbr_settings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  anteil NUMERIC NOT NULL,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Benutzerrollen
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  rolle TEXT NOT NULL DEFAULT 'admin' CHECK (rolle IN ('admin', 'buchhalter', 'eigentuemer', 'steuerberater')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, property_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gwg_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbr_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE gbr_partner ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read categories" ON categories FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "manage own categories" ON categories FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "update own categories" ON categories FOR UPDATE USING (created_by = auth.uid() OR is_system = true);
CREATE POLICY "delete own categories" ON categories FOR DELETE USING (created_by = auth.uid() AND is_system = false);

CREATE POLICY "own tax_settings" ON tax_settings FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "own gwg_settings" ON gwg_settings FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "own gbr_settings" ON gbr_settings FOR ALL
  USING (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()))
  WITH CHECK (property_id IN (SELECT id FROM properties WHERE user_id = auth.uid()));

CREATE POLICY "own gbr_partner" ON gbr_partner FOR ALL
  USING (gbr_settings_id IN (SELECT gs.id FROM gbr_settings gs JOIN properties p ON gs.property_id = p.id WHERE p.user_id = auth.uid()))
  WITH CHECK (gbr_settings_id IN (SELECT gs.id FROM gbr_settings gs JOIN properties p ON gs.property_id = p.id WHERE p.user_id = auth.uid()));

CREATE POLICY "own user_roles" ON user_roles FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Admin-Rolle für bestehende Property-Owner anlegen
INSERT INTO user_roles (user_id, property_id, rolle)
SELECT user_id, id, 'admin' FROM properties
ON CONFLICT (user_id, property_id) DO NOTHING;
