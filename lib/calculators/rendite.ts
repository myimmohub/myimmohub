export interface RenditeInput {
  /** Kaufpreis in EUR */
  kaufpreis: number;
  /** Monatliche Kaltmiete in EUR */
  kaltmiete: number;
  /** Monatliche Nebenkosten / Verwaltung in EUR */
  nebenkosten: number;
  /** Kaufnebenkosten in Prozent (z. B. 10 für 10 %) */
  kaufnebenkostenPct: number;
}

export interface RenditeResult {
  /** Bruttomietrendite in Prozent */
  bruttoRenditePct: number;
  /** Nettomietrendite in Prozent */
  nettoRenditePct: number;
  /** Jahresmiete (kalt) */
  jahresmiete: number;
  /** Gesamtinvestition inkl. Kaufnebenkosten */
  gesamtinvestition: number;
  /** Bewertung */
  bewertung: "niedrig" | "solide" | "attraktiv";
}

export function calcRendite(input: RenditeInput): RenditeResult | null {
  const { kaufpreis, kaltmiete, nebenkosten, kaufnebenkostenPct } = input;
  if (kaufpreis <= 0 || kaltmiete <= 0) return null;

  const jahresmiete = kaltmiete * 12;
  const jahreskosten = nebenkosten * 12;
  const gesamtinvestition = kaufpreis * (1 + kaufnebenkostenPct / 100);

  const bruttoRenditePct = (jahresmiete / kaufpreis) * 100;
  const nettoRenditePct = ((jahresmiete - jahreskosten) / gesamtinvestition) * 100;

  const bewertung: RenditeResult["bewertung"] =
    nettoRenditePct < 3 ? "niedrig" : nettoRenditePct <= 5 ? "solide" : "attraktiv";

  return { bruttoRenditePct, nettoRenditePct, jahresmiete, gesamtinvestition, bewertung };
}
