/**
 * Lookup-Tabellen für Kategorien aus der Datenbank.
 * Ersetzt die hardcodierten Konstanten aus categorizeTransaction.ts.
 *
 * Kategorien werden einmalig per fetch geladen und in Maps umgewandelt,
 * die dieselbe Schnittstelle bieten wie die alten statischen Records.
 */

export type DbCategory = {
  id: string;
  label: string;
  icon: string;
  gruppe: string;
  typ: string;         // "einnahme" | "ausgabe" | "neutral"
  anlage_v: string | null;
  editierbar: boolean;
  badge_100pct: boolean;
  is_system: boolean;
  description: string | null;
};

export type CategoryLookup = {
  /** Alle Kategorien aus der DB */
  categories: DbCategory[];
  /** label → DbCategory */
  byLabel: Map<string, DbCategory>;
  /** id → DbCategory */
  byId: Map<string, DbCategory>;
  /** Label-Anzeige: label → "Icon Label" */
  labelDisplay: Record<string, string>;
  /** Anlage-V Text: label → "Z. 47" etc. */
  anlageV: Record<string, string | null>;
  /** Steuerlich absetzbar: label → boolean (ausgabe = true, einnahme/neutral = false) */
  taxDeductible: Record<string, boolean>;
  /** Gruppiert nach DB-Feld `gruppe` */
  grouped: { gruppe: string; items: DbCategory[] }[];
};

/** Lädt Kategorien von /api/settings/categories und baut Lookup-Maps auf */
export async function loadCategoryLookup(): Promise<CategoryLookup> {
  const res = await fetch("/api/settings/categories");
  const categories: DbCategory[] = res.ok ? await res.json() : [];

  const byLabel = new Map<string, DbCategory>();
  const byId = new Map<string, DbCategory>();
  const labelDisplay: Record<string, string> = {};
  const anlageV: Record<string, string | null> = {};
  const taxDeductible: Record<string, boolean> = {};

  for (const cat of categories) {
    byLabel.set(cat.label, cat);
    byId.set(cat.id, cat);
    labelDisplay[cat.label] = `${cat.icon} ${cat.label}`;
    anlageV[cat.label] = cat.anlage_v;
    taxDeductible[cat.label] = cat.typ === "ausgabe";
  }

  // Gruppierung
  const gruppenOrder: string[] = [];
  const gruppenMap = new Map<string, DbCategory[]>();
  for (const cat of categories) {
    if (!gruppenMap.has(cat.gruppe)) {
      gruppenOrder.push(cat.gruppe);
      gruppenMap.set(cat.gruppe, []);
    }
    gruppenMap.get(cat.gruppe)!.push(cat);
  }
  const grouped = gruppenOrder.map((g) => ({ gruppe: g, items: gruppenMap.get(g)! }));

  return { categories, byLabel, byId, labelDisplay, anlageV, taxDeductible, grouped };
}

/**
 * Badge-Variante basierend auf Kategorie-Typ aus der DB.
 * Fallback: Prüft auch die alten Slug-basierten Sets für Abwärtskompatibilität.
 */
export type BadgeVariant = "einnahmen" | "werbungskosten" | "nicht_absetzbar" | "unbekannt";

// Alte Slugs für Abwärtskompatibilität (Transaktionen die vor der Umstellung kategorisiert wurden)
const OLD_EINNAHMEN = new Set([
  "miete_einnahmen_wohnen", "miete_einnahmen_gewerbe",
  "nebenkosten_einnahmen", "mietsicherheit_einnahme", "sonstige_einnahmen",
]);
const OLD_NICHT_ABSETZBAR = new Set([
  "tilgung_kredit", "mietsicherheit_ausgabe", "sonstiges_nicht_absetzbar",
]);

export function getCategoryVariant(cat: string | null, lookup?: CategoryLookup): BadgeVariant {
  if (!cat) return "unbekannt";

  // Neue DB-Kategorien
  if (lookup) {
    const dbCat = lookup.byLabel.get(cat);
    if (dbCat) {
      if (dbCat.typ === "einnahme") return "einnahmen";
      if (dbCat.typ === "ausgabe") return "werbungskosten";
      return "nicht_absetzbar";
    }
  }

  // Fallback: alte Slugs
  if (OLD_EINNAHMEN.has(cat)) return "einnahmen";
  if (OLD_NICHT_ABSETZBAR.has(cat)) return "nicht_absetzbar";
  return "werbungskosten";
}
