/**
 * Konsolidierte AfA-Logik (Auftrag C).
 *
 * Vor dem Refactor existierten drei separate Implementationen:
 *   - `lib/calculateAfA.ts` mit Baujahr-Switch < 1925 / ≤ 2022 / > 2022.
 *   - `lib/tax/structuredTaxLogic.ts:deriveBuildingAfaRate` mit dem gleichen
 *     Switch-Set, aber nur auf `taxData.build_year` aufbauend.
 *   - `lib/tax/rentalTaxEngineBridge.ts:deriveBuildingRate` mit identischer
 *     Logik nur als Lookup für die Engine-Asset-Cost-Rückrechnung.
 *
 * Diese Datei ist jetzt die Single-Source-of-Truth. Die alten Stellen sind
 * dünne Wrapper geblieben (für API-Stabilität), rufen aber den Helper auf.
 *
 * Quellen:
 *   - § 7 Abs. 4 Nr. 1 EStG: Wohngebäude vor 1925 → 2,5 % p.a. (40 Jahre).
 *   - § 7 Abs. 4 Nr. 2 EStG: Wohngebäude ab 1925 → 2,0 % p.a. (50 Jahre).
 *   - JStG 2022 / § 7 Abs. 4 Nr. 2 Buchst. a EStG: Wohngebäude mit
 *     Fertigstellung NACH dem 31.12.2022 (= Baujahr ≥ 2023) → 3,0 % p.a.
 */

const RATE_OLD_BUILDING = 0.025;       // < 1925 (Altbau)
const RATE_STANDARD = 0.02;            // 1925..2022 (Standard, vor JStG 2022)
const RATE_NEW_BUILDING_2023 = 0.03;   // ≥ 2023 (JStG 2022)

const DEFAULT_MOVABLE_USEFUL_LIFE_YEARS = 10;

/**
 * Building-AfA-Rate nach Baujahr (oder Kaufdatum als Fallback).
 *
 * @param args.baujahr Baujahr (Fertigstellung) der Immobilie. Bevorzugte Quelle.
 * @param args.kaufdatum Kaufdatum, wird NICHT für die AfA-Rate verwendet, kann
 *   aber von Aufrufern als sekundärer Fingerprint mitgegeben werden (Rückgabe
 *   bleibt davon unberührt; Parameter erhält Symmetrie zur Movable-Variante).
 * @param args.propertyType Optionaler Hint, z.B. "wirtschaftsgebaude". Wird
 *   aktuell ignoriert — Sondersätze für Wirtschaftsgebäude (3 % bzw. 4 % nach
 *   § 7 Abs. 4 Nr. 1 EStG) implementieren wir hier bewusst NICHT, weil die
 *   bestehenden drei Implementationen das auch nicht taten und Kesslerberg +
 *   alle anderen aktuellen Properties Wohngebäude sind. Wenn das gebraucht
 *   wird, ergänzen wir es hier (Single-Source-of-Truth).
 *
 * @returns AfA-Satz als Dezimalbruch (z.B. 0.02 für 2 %).
 */
export function resolveBuildingAfaRate(args: {
  baujahr: number | null | undefined;
  kaufdatum?: string | null;
  propertyType?: string | null;
}): number {
  const baujahr = args.baujahr;
  if (baujahr == null) return RATE_STANDARD;
  if (baujahr < 1925) return RATE_OLD_BUILDING;
  if (baujahr >= 2023) return RATE_NEW_BUILDING_2023;
  return RATE_STANDARD;
}

/**
 * AfA-Rate für bewegliche Wirtschaftsgüter (Inventar, Einbauküche etc.).
 *
 * Standard: Linear über die betriebliche Nutzungsdauer (BMF-AfA-Tabellen).
 * Wir setzen 10 Jahre als Default, weil das die für Vermietungsobjekte am
 * häufigsten genutzte ND ist (Möblierung, Einbauküche, Sanitäreinrichtungen
 * laut AfA-Tabelle „Allgemeine Wirtschaftsgüter").
 *
 * @returns AfA-Satz als Dezimalbruch (z.B. 0.1 für 10 %).
 */
export function resolveMovableAssetAfaRate(args: {
  nutzungsdauerJahre?: number | null;
  defaultJahre?: number;
}): number {
  const nd = args.nutzungsdauerJahre;
  if (nd != null && Number.isFinite(nd) && nd > 0) {
    return 1 / nd;
  }
  const fallback = args.defaultJahre && args.defaultJahre > 0
    ? args.defaultJahre
    : DEFAULT_MOVABLE_USEFUL_LIFE_YEARS;
  return 1 / fallback;
}
