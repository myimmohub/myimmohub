export const GRUNDERWERBSTEUER: Record<string, number> = {
  Bayern: 3.5,
  Sachsen: 3.5,
  Hamburg: 4.5,
  Bremen: 5.0,
  Niedersachsen: 5.0,
  "Mecklenburg-Vorpommern": 5.0,
  "Rheinland-Pfalz": 5.0,
  "Sachsen-Anhalt": 5.0,
  "Baden-Württemberg": 5.0,
  Berlin: 6.0,
  Hessen: 6.0,
  Brandenburg: 6.5,
  "Nordrhein-Westfalen": 6.5,
  Saarland: 6.5,
  "Schleswig-Holstein": 6.5,
  Thüringen: 6.5,
};

export const BUNDESLAENDER = Object.keys(GRUNDERWERBSTEUER).sort((a, b) =>
  a.localeCompare(b, "de"),
);

export interface KaufnebenkostenInput {
  kaufpreis: number;
  bundesland: string;
  /** Notarkosten in Prozent */
  notarPct: number;
  /** Grundbucheintragung in Prozent */
  grundbuchPct: number;
  mitMakler: boolean;
  /** Maklercourtage in Prozent */
  maklerPct: number;
}

export interface KaufnebenkostenResult {
  grunderwerbsteuerSatz: number;
  grunderwerbsteuer: number;
  notarkosten: number;
  grundbuchkosten: number;
  maklerkosten: number;
  gesamtNebenkosten: number;
  gesamtInvestition: number;
  nebenkostenPct: number;
}

export function calcKaufnebenkosten(input: KaufnebenkostenInput): KaufnebenkostenResult | null {
  const { kaufpreis, bundesland, notarPct, grundbuchPct, mitMakler, maklerPct } = input;
  if (kaufpreis <= 0) return null;

  const grunderwerbsteuerSatz = GRUNDERWERBSTEUER[bundesland] ?? 3.5;
  const grunderwerbsteuer = (kaufpreis * grunderwerbsteuerSatz) / 100;
  const notarkosten = (kaufpreis * notarPct) / 100;
  const grundbuchkosten = (kaufpreis * grundbuchPct) / 100;
  const maklerkosten = mitMakler ? (kaufpreis * maklerPct) / 100 : 0;

  const gesamtNebenkosten = grunderwerbsteuer + notarkosten + grundbuchkosten + maklerkosten;
  const gesamtInvestition = kaufpreis + gesamtNebenkosten;
  const nebenkostenPct = (gesamtNebenkosten / kaufpreis) * 100;

  return {
    grunderwerbsteuerSatz,
    grunderwerbsteuer,
    notarkosten,
    grundbuchkosten,
    maklerkosten,
    gesamtNebenkosten,
    gesamtInvestition,
    nebenkostenPct,
  };
}
