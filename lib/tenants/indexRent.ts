/**
 * Indexmiete-Engine (pure Function).
 *
 * Berechnet die zulässige neue Kaltmiete bei einer Indexmiete-Anpassung
 * (BGB §557b Verbraucherpreisindex Deutschland, Basis 2020 = 100).
 *
 * Vertrag:
 *  - Alle Werte in Cent (integer), keine Floats für Geldgrößen
 *  - pct_change wird mit voller Float-Präzision berechnet, NUR die Geldgröße
 *    wird Cent-genau (half-up) gerundet
 *  - Mindestabstand zwischen Anpassungen: BGB §557b verlangt ≥ 12 Monate
 *
 * Diese Funktion ist deterministisch — keine I/O, kein Date.now, kein Random.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type IndexRentWarning = { code: string; message: string };

export type IndexRentInput = {
  /** Vereinbarte Basis-Kaltmiete in Cent (zum Zeitpunkt base_date oder letzter Anpassung). */
  base_value_cents: number;
  /** ISO yyyy-mm-dd: Datum, ab dem base_value_cents galt. Bei erster Anpassung = lease_start oder Vertragsabschluss. */
  base_date: string;
  /** CPI-Indexstand zum base_date (Verbraucherpreisindex Deutschland, Basis 2020 = 100). */
  base_index: number;
  /** Aktueller CPI-Stand zum current_date. */
  current_index: number;
  /** ISO yyyy-mm-dd: Stichtag, ab dem die Anpassung wirken soll. */
  current_date: string;
  /** Mindestabstand zwischen Anpassungen in Monaten (BGB §557b: ≥ 12). Default 12. */
  interval_months?: number;
  /** Datum letzter Anpassung (falls != base_date). Default = base_date. */
  last_adjustment_date?: string;
};

export type IndexRentResult = {
  /** Neue zulässige Kaltmiete in Cent (Cent-genau, half-up). */
  new_value_cents: number;
  /** Differenz zur alten Miete in Cent. */
  delta_cents: number;
  /** Prozentuale Veränderung relativ zu base_value_cents (auf 4 Stellen Float). */
  pct_change: number;
  /** True, wenn Mindestabstand eingehalten ist. */
  is_eligible: boolean;
  /** Datum, ab dem die nächste Anpassung frühestens möglich wäre (current_date + interval_months). */
  next_eligible_date: string;
  /** Liste fachlicher Hinweise / Warnings. */
  warnings: IndexRentWarning[];
};

function assertIsoDate(value: string, name: string) {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`${name} muss ISO YYYY-MM-DD sein, war: ${value}`);
  }
}

/** Half-up Cent-Rundung (kaufmännisch, symmetrisch für negative Werte). */
function roundHalfUpInteger(value: number): number {
  if (value >= 0) return Math.floor(value + 0.5);
  return -Math.floor(-value + 0.5);
}

/** Kalendergenau: Anzahl voller Monate zwischen `from` und `to` (inkl. Tag-Korrektur). */
function monthsBetween(fromIso: string, toIso: string): number {
  assertIsoDate(fromIso, "fromIso");
  assertIsoDate(toIso, "toIso");
  const [fy, fm, fd] = fromIso.split("-").map(Number);
  const [ty, tm, td] = toIso.split("-").map(Number);
  let months = (ty - fy) * 12 + (tm - fm);
  // Tag-Korrektur: wenn der Zieltag vor dem Starttag im Monat liegt,
  // ist der Monat noch nicht vollständig "abgelaufen".
  if (td < fd) months -= 1;
  return months;
}

/** Addiert `months` Kalendermonate zu einem ISO-Datum (Tag wird beibehalten, mit setMonth-Semantik). */
function addMonthsIso(iso: string, months: number): string {
  assertIsoDate(iso, "iso");
  const [y, m, d] = iso.split("-").map(Number);
  // Konstruktion via Date.UTC — setMonth-Semantik: Tag-Überlauf in den Folgemonat
  // ist hier akzeptabel (z.B. 31. Jan + 1 Monat = 3. März); für die Use-Case
  // "next_eligible_date" ist das fachlich tragbar, weil immer ≥ 12 Monate.
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCMonth(date.getUTCMonth() + months);
  const yy = date.getUTCFullYear();
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(date.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function calculateIndexedRent(input: IndexRentInput): IndexRentResult {
  assertIsoDate(input.base_date, "base_date");
  assertIsoDate(input.current_date, "current_date");
  if (input.last_adjustment_date) {
    assertIsoDate(input.last_adjustment_date, "last_adjustment_date");
  }

  const interval = input.interval_months ?? 12;
  const lastAdj = input.last_adjustment_date ?? input.base_date;
  const warnings: IndexRentWarning[] = [];

  // Sicherheits-Checks
  if (input.base_index <= 0) {
    warnings.push({
      code: "invalid_base_index",
      message: `Basis-Index ist ungültig (${input.base_index}). Anpassung wird nicht durchgeführt.`,
    });
    return {
      new_value_cents: input.base_value_cents,
      delta_cents: 0,
      pct_change: 0,
      is_eligible: false,
      next_eligible_date: addMonthsIso(input.current_date, interval),
      warnings,
    };
  }

  if (input.current_date < input.base_date) {
    warnings.push({
      code: "current_before_base",
      message: `Stichtag (${input.current_date}) liegt vor Basis-Datum (${input.base_date}).`,
    });
  }

  if (interval < 12) {
    warnings.push({
      code: "interval_below_minimum",
      message: `BGB §557b verlangt mindestens 12 Monate Mindestabstand (gesetzt: ${interval}).`,
    });
  }

  const months = monthsBetween(lastAdj, input.current_date);
  const isEligible = months >= interval;
  if (!isEligible) {
    warnings.push({
      code: "min_interval_not_met",
      message: `Mindestabstand von ${interval} Monaten noch nicht erreicht (verstrichen: ${months}).`,
    });
  }

  // pct_change in voller Float-Präzision, ausgegeben auf 4 Stellen.
  const pctChangeRaw = (input.current_index - input.base_index) / input.base_index;
  const pctChange = Math.round(pctChangeRaw * 10000) / 10000;

  if (input.current_index < input.base_index) {
    warnings.push({
      code: "index_decrease",
      message: `Indexrückgang: aktueller Index (${input.current_index}) liegt unter Basis-Index (${input.base_index}). Mieter kann ggf. eine Senkung verlangen.`,
    });
  }

  const newValue = roundHalfUpInteger(input.base_value_cents * (1 + pctChangeRaw));
  const delta = newValue - input.base_value_cents;
  const nextEligible = addMonthsIso(input.current_date, interval);

  return {
    new_value_cents: newValue,
    delta_cents: delta,
    pct_change: pctChange,
    is_eligible: isEligible,
    next_eligible_date: nextEligible,
    warnings,
  };
}
