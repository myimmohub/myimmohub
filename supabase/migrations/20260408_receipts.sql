-- Belege (Receipts) – verknüpft Dokumente mit Transaktionen
CREATE TABLE IF NOT EXISTS receipts (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id        UUID REFERENCES transactions(id) ON DELETE SET NULL,
  file_path             TEXT NOT NULL,
  filename              TEXT NOT NULL,
  extracted_amount      DECIMAL(12,2),
  extracted_date        DATE,
  extracted_counterpart TEXT,
  extracted_text        TEXT,
  match_score           DECIMAL(4,3),
  linked_by             TEXT NOT NULL DEFAULT 'user' CHECK (linked_by IN ('auto','user')),
  linked_at             TIMESTAMPTZ,
  source                TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','email')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS receipts_transaction_id_idx ON receipts(transaction_id) WHERE transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS receipts_user_unlinked_idx ON receipts(user_id) WHERE transaction_id IS NULL;

ALTER TABLE receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own receipts" ON receipts FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
