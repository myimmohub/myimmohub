export interface KreditInput {
  /** Kaufpreis in EUR */
  kaufpreis: number;
  /** Eigenkapital in EUR */
  eigenkapital: number;
  /** Nominalzinssatz in Prozent (z. B. 3.5 für 3,5 %) */
  zinssatzPct: number;
  /** Anfangstilgung in Prozent (z. B. 2 für 2 %) */
  tilgungPct: number;
  /** Zinsbindung in Jahren */
  zinsbindungJahre: number;
}

export interface KreditResult {
  /** Darlehensbetrag */
  darlehen: number;
  /** Eigenkapitalquote in Prozent */
  eigenkapitalQuotePct: number;
  /** Monatliche Annuität */
  monatlicheRate: number;
  /** Zinsanteil im ersten Monat */
  zinsenMonat1: number;
  /** Tilgungsanteil im ersten Monat */
  tilgungMonat1: number;
  /** Restschuld nach Zinsbindung */
  restschuld: number;
  /** Gesamte Zinslast über die Zinsbindung */
  gesamtzinsen: number;
}

export function calcKredit(input: KreditInput): KreditResult | null {
  const { kaufpreis, eigenkapital, zinssatzPct, tilgungPct, zinsbindungJahre } = input;
  if (kaufpreis <= 0) return null;

  const darlehen = Math.max(kaufpreis - eigenkapital, 0);
  if (darlehen <= 0) return null;

  const eigenkapitalQuotePct = (eigenkapital / kaufpreis) * 100;

  // Monatliche Annuität (vereinfacht: (z + t) / 12 / 100 * Darlehen)
  const monatlicheRate = (darlehen * (zinssatzPct + tilgungPct)) / 12 / 100;

  // Zins- und Tilgungsanteil im ersten Monat
  const zinsenMonat1 = (darlehen * zinssatzPct) / 12 / 100;
  const tilgungMonat1 = monatlicheRate - zinsenMonat1;

  // Restschuld nach Zinsbindung (exakte Annuitäten-Formel)
  let restschuld: number;
  if (zinssatzPct > 0) {
    const r = zinssatzPct / 100;
    const n = zinsbindungJahre;
    const annuitat = monatlicheRate * 12;
    restschuld = darlehen * Math.pow(1 + r, n) - (annuitat * (Math.pow(1 + r, n) - 1)) / r;
  } else {
    restschuld = darlehen - tilgungMonat1 * 12 * zinsbindungJahre;
  }
  restschuld = Math.max(restschuld, 0);

  const gesamtzinsen = monatlicheRate * 12 * zinsbindungJahre - (darlehen - restschuld);

  return {
    darlehen,
    eigenkapitalQuotePct,
    monatlicheRate,
    zinsenMonat1,
    tilgungMonat1,
    restschuld,
    gesamtzinsen: Math.max(gesamtzinsen, 0),
  };
}
