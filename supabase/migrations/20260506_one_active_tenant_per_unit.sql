-- Constraint: pro Einheit darf höchstens EIN Mieter gleichzeitig aktiv sein.
--
-- "Aktiv" bedeutet: status = 'active' AND lease_end IS NULL (unbefristet).
-- Mieter mit gesetztem lease_end (= geplanter Auszug) gelten nicht mehr als
-- "voll aktiv" und blockieren den Slot nicht — so kann der Nachfolge-Mieter
-- bereits angelegt werden.
--
-- Partial Unique Index: passt zur Postgres-RLS und greift nur, wenn beide
-- Bedingungen erfüllt sind.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_active_tenant_per_unit
  ON tenants(unit_id)
  WHERE status = 'active' AND lease_end IS NULL;
