-- ============================================================================
-- Steuer-Einstellungen: manueller Vermietungsanteil fuer FE/FB
-- ============================================================================

ALTER TABLE tax_settings
ADD COLUMN IF NOT EXISTS rental_share_override_pct NUMERIC(8,6);
