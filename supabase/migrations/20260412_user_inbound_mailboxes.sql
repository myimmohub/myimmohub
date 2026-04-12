-- ============================================================================
-- Persönliche Inbound-Postfächer pro Nutzer
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS user_inbound_mailboxes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  alias TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE user_inbound_mailboxes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own user_inbound_mailboxes" ON user_inbound_mailboxes;

CREATE POLICY "own user_inbound_mailboxes" ON user_inbound_mailboxes FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMIT;
