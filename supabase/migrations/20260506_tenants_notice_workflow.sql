-- Notice-Workflow + Audit-History für Mieter.
-- Spec siehe docs/mieter-roadmap.md.

-- 1) Notice-Felder
ALTER TABLE tenants
  ADD COLUMN IF NOT EXISTS notice_received_date DATE,
  ADD COLUMN IF NOT EXISTS notice_party TEXT
    CHECK (notice_party IS NULL OR notice_party IN ('tenant', 'landlord')),
  ADD COLUMN IF NOT EXISTS notice_period_months INT DEFAULT 3;

-- 2) Audit-History-Tabelle
CREATE TABLE IF NOT EXISTS tenants_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  changed_at TIMESTAMPTZ DEFAULT NOW(),
  changed_by UUID,
  change_type TEXT NOT NULL CHECK (change_type IN ('insert','update','delete')),
  old_values JSONB,
  new_values JSONB
);

CREATE INDEX IF NOT EXISTS tenants_history_tenant_idx ON tenants_history(tenant_id);
CREATE INDEX IF NOT EXISTS tenants_history_changed_at_idx ON tenants_history(changed_at DESC);

ALTER TABLE tenants_history ENABLE ROW LEVEL SECURITY;

-- RLS: Owner über tenants → units → properties.user_id
DROP POLICY IF EXISTS tenants_history_owner_select ON tenants_history;
CREATE POLICY tenants_history_owner_select ON tenants_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM tenants t
      JOIN units u ON u.id = t.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE t.id = tenants_history.tenant_id
        AND p.user_id = auth.uid()
    )
  );

-- 3) Trigger
CREATE OR REPLACE FUNCTION tenants_audit_trigger_fn()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    INSERT INTO tenants_history (tenant_id, changed_by, change_type, old_values, new_values)
    VALUES (NEW.id, auth.uid(), 'insert', NULL, to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'UPDATE') THEN
    INSERT INTO tenants_history (tenant_id, changed_by, change_type, old_values, new_values)
    VALUES (NEW.id, auth.uid(), 'update', to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    INSERT INTO tenants_history (tenant_id, changed_by, change_type, old_values, new_values)
    VALUES (OLD.id, auth.uid(), 'delete', to_jsonb(OLD), NULL);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tenants_audit_trigger ON tenants;
CREATE TRIGGER tenants_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON tenants
  FOR EACH ROW EXECUTE FUNCTION tenants_audit_trigger_fn();
