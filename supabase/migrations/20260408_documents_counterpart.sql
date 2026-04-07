-- Absender/Dienstleister-Spalte für Dokumente
ALTER TABLE documents ADD COLUMN IF NOT EXISTS counterpart TEXT;
