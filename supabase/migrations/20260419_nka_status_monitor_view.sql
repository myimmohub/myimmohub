-- =============================================================================
-- v_nka_status_monitor – konsolidierte Definition
--
-- In Prod war der View bislang von der Migration 20260419_nka_foundation.sql
-- abgedriftet (fehlende deadline_status- und property_name-Spalten, dafür
-- zusätzliche Kennzahlen-Spalten). Diese Migration setzt eine einheitliche
-- Form, die beide Anwendungsfälle abdeckt: Deadline-Ampel für UI + Kennzahlen.
-- =============================================================================

-- CREATE OR REPLACE VIEW verbietet Rename/Reorder bestehender Spalten – daher DROP zuerst.
DROP VIEW IF EXISTS v_nka_status_monitor;

CREATE VIEW v_nka_status_monitor AS
SELECT
  np.id,
  np.property_id,
  np.user_id,
  p.name                                AS property_name,
  np.zeitraum_von,
  np.zeitraum_bis,
  np.status,
  np.deadline_abrechnung,
  np.gesamtkosten_umlagefaehig,
  np.gesamtkosten_nicht_umlagefaehig,
  (SELECT count(*) FROM nka_tenant_shares WHERE nka_periode_id = np.id) AS tenant_share_count,
  (SELECT count(*) FROM nka_cost_items   WHERE nka_periode_id = np.id) AS cost_item_count,
  CASE
    WHEN np.status = 'abgeschlossen' THEN 'done'
    WHEN np.deadline_abrechnung < CURRENT_DATE THEN 'critical'
    WHEN np.deadline_abrechnung <= CURRENT_DATE + INTERVAL '30 days' THEN 'warning'
    WHEN np.deadline_abrechnung <= CURRENT_DATE + INTERVAL '90 days' THEN 'attention'
    ELSE 'ok'
  END                                   AS deadline_status
FROM nka_periods np
JOIN properties  p  ON p.id = np.property_id;
