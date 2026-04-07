/**
 * Browser-sichere Kategorie-Konstanten — kein Server-only Import.
 * Wird von Client-Komponenten importiert; classifyDocument.ts re-exportiert von hier.
 */

export type DocumentCategory =
  | "miete"
  | "rechnung_handwerk"
  | "rechnung_verwaltung"
  | "versicherung"
  | "nebenkostenabrechnung"
  | "zinsen"
  | "sonstiges";

/** Anzeigetexte für alle Kategorien — zentral definiert, von UI-Komponenten importiert. */
export const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  miete: "Miete",
  rechnung_handwerk: "Handwerkerrechnung",
  rechnung_verwaltung: "Verwaltungsrechnung",
  versicherung: "Versicherung",
  nebenkostenabrechnung: "Nebenkostenabrechnung",
  zinsen: "Zinsen",
  sonstiges: "Sonstiges",
};

/** Geordnete Liste aller Kategorien für Dropdowns. */
export const ALL_CATEGORIES: DocumentCategory[] = [
  "miete",
  "rechnung_handwerk",
  "rechnung_verwaltung",
  "versicherung",
  "nebenkostenabrechnung",
  "zinsen",
  "sonstiges",
];
