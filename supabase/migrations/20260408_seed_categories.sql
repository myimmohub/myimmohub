-- ============================================================================
-- Seed: System-Kategorien (Anlage-V-Mapping)
-- ============================================================================

INSERT INTO categories (icon, label, typ, gruppe, anlage_v, editierbar, badge_100pct, is_system) VALUES
-- EINNAHMEN
('💶', 'Mieteinnahmen', 'einnahme', 'Einnahmen', 'Z. 9 / 10 / 11', false, false, true),
('🌴', 'Ferienvermietung – Einnahmen', 'einnahme', 'Einnahmen', 'Z. 9', false, false, true),
('🔄', 'Nebenkostenerstattungen', 'einnahme', 'Einnahmen', 'Z. 13', false, false, true),
('➕', 'Sonstige Einnahmen', 'einnahme', 'Einnahmen', 'Z. 14', false, false, true),
-- GEBÄUDE & GRUNDSTÜCK
('🏛️', 'Grundsteuer', 'ausgabe', 'Gebäude', 'Z. 47', false, false, true),
('🛡️', 'Versicherungen', 'ausgabe', 'Gebäude', 'Z. 48', true, false, true),
('🏢', 'Hausverwaltung / WEG-Kosten', 'ausgabe', 'Gebäude', 'Z. 48', true, false, true),
-- INSTANDHALTUNG
('🔧', 'Handwerkerleistungen', 'ausgabe', 'Instandhaltung', 'Z. 40', true, false, true),
('🧹', 'Hausmeisterdienste', 'ausgabe', 'Instandhaltung', 'Z. 48', true, false, true),
('🪣', 'Materialkosten', 'ausgabe', 'Instandhaltung', 'Z. 40', true, false, true),
-- BETRIEBSKOSTEN
('⚡', 'Energieversorgung', 'ausgabe', 'Betriebskosten', 'Z. 48', true, false, true),
('💧', 'Wasser & Abwasser', 'ausgabe', 'Betriebskosten', 'Z. 48', true, false, true),
('♻️', 'Müllentsorgung', 'ausgabe', 'Betriebskosten', 'Z. 48', true, false, true),
('📡', 'Internet / Telefon / TV', 'ausgabe', 'Betriebskosten', 'Z. 48', true, false, true),
-- EINRICHTUNG
('🛋️', 'Einrichtung / Möbel', 'ausgabe', 'Einrichtung', 'Z. 33–39 / 48', true, false, true),
('🪴', 'Haushaltsbedarf / Kleinausstattung', 'ausgabe', 'Einrichtung', 'Z. 48', true, false, true),
-- FINANZIERUNG
('🏦', 'Kreditzinsen / Schuldzinsen', 'ausgabe', 'Finanzierung', 'Z. 35', false, false, true),
-- FERIENIMMOBILIE
('🏔️', 'Kurtaxe / Tourismusabgaben', 'ausgabe', 'Ferienimmobilie', 'Z. 48', false, true, true),
('🏷️', 'Plattformprovisionen / Agentur', 'ausgabe', 'Ferienimmobilie', 'Z. 48', false, true, true),
('🧺', 'Reinigungskosten (Gästewechsel)', 'ausgabe', 'Ferienimmobilie', 'Z. 48', false, true, true),
('🗝️', 'Schlüsselübergabe / Check-in-Service', 'ausgabe', 'Ferienimmobilie', 'Z. 48', false, true, true),
('🛏️', 'Gästewäsche / Bettwäsche-Service', 'ausgabe', 'Ferienimmobilie', 'Z. 48', false, true, true),
('🏠', 'Ferienhausverwaltung vor Ort', 'ausgabe', 'Ferienimmobilie', 'Z. 48', false, true, true),
('🧴', 'Verbrauchsmaterialien für Gäste', 'ausgabe', 'Ferienimmobilie', 'Z. 48', false, true, true),
('📺', 'GEMA / Rundfunkbeitrag', 'ausgabe', 'Ferienimmobilie', 'Z. 48', true, false, true),
-- VERWALTUNG
('📋', 'Steuerberatung / Rechtskosten', 'ausgabe', 'Verwaltung', 'Z. 48', true, false, true),
('📢', 'Inserate & Vermarktung', 'ausgabe', 'Verwaltung', 'Z. 48', true, false, true),
('🚗', 'Fahrtkosten', 'ausgabe', 'Verwaltung', 'Z. 48', true, false, true),
('🗂️', 'Bürokosten / Verwaltungsaufwand', 'ausgabe', 'Verwaltung', 'Z. 48', true, false, true)
ON CONFLICT DO NOTHING;
