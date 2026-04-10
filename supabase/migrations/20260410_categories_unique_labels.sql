-- ============================================================================
-- Kategorien: aktive Labels eindeutig halten
-- ============================================================================

-- Bestehende Dubletten bereinigen. Wir behalten bevorzugt System-Kategorien,
-- danach den aeltesten aktiven Eintrag je normalisiertem Label.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(btrim(label))
      ORDER BY is_system DESC, created_at ASC, id ASC
    ) AS rn
  FROM categories
  WHERE deleted_at IS NULL
)
UPDATE categories
SET deleted_at = now()
WHERE id IN (
  SELECT id
  FROM ranked
  WHERE rn > 1
);

-- Aktive Kategorien duerfen keinen doppelten Namen mehr haben, unabhaengig von
-- Gross-/Kleinschreibung oder fuehrenden/trailenden Leerzeichen.
CREATE UNIQUE INDEX IF NOT EXISTS categories_active_label_unique_idx
ON categories (lower(btrim(label)))
WHERE deleted_at IS NULL;
