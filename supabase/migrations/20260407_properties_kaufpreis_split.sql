-- Kaufpreisaufteilung: Gebäude / Grund / Inventar
-- Nur der Gebäudeanteil ist AfA-fähig nach § 7 Abs. 4 EStG.
-- Grund und Boden ist nicht abschreibbar (§ 11d EStDV).
-- Inventar wird separat abgeschrieben (GWG-Regelung § 6 Abs. 2 EStG).

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS gebaeudewert            NUMERIC,   -- Gebäudeanteil (AfA-Basis)
  ADD COLUMN IF NOT EXISTS grundwert               NUMERIC,   -- Grundstücksanteil (nicht abschreibbar)
  ADD COLUMN IF NOT EXISTS inventarwert            NUMERIC,   -- Inventar / bewegliche WG
  ADD COLUMN IF NOT EXISTS kaufpreis_split_quelle  TEXT;      -- 'manuell' | 'ki_extraktion' | 'bmf_schaetzung'
