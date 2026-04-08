-- ============================================================================
-- Seed: Zusätzliche System-Kategorien
-- ============================================================================

INSERT INTO categories (icon, label, typ, gruppe, anlage_v, editierbar, badge_100pct, is_system) VALUES
-- FINANZIERUNG
('💳', 'Kontoführungsgebühren', 'ausgabe', 'Finanzierung', 'Z. 48', true, false, true),
-- SONSTIGES
('🔀', 'Geldtransit', 'ausgabe', 'Sonstiges', 'nicht absetzbar', false, false, true),
('🚫', 'Privat / Sonstige', 'ausgabe', 'Sonstiges', 'nicht absetzbar', false, false, true)
ON CONFLICT DO NOTHING;
