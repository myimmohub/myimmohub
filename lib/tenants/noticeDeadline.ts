/**
 * Kündigungsfristen-Berechnung (BGB §573c).
 *
 * Vermieter:
 *  - Mietdauer < 5 Jahre   → 3 Monate
 *  - 5 ≤ Mietdauer < 8     → 6 Monate
 *  - Mietdauer ≥ 8 Jahre   → 9 Monate
 *
 * Mieter (kann beliebig kündigen): immer 3 Monate.
 *
 * Werktag-Korrektur (§573c Abs. 1 S. 1): Eine Kündigung muss spätestens am
 * dritten Werktag eines Monats zugehen, um zum Ablauf des übernächsten
 * Monats wirksam zu werden. Sonst startet die Frist erst im Folgemonat.
 *
 * Diese Funktion berechnet das effektive Vertragsende (lease_end) basierend
 * auf dem Eingangsdatum.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIso(value: string, name: string) {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`${name} muss ISO YYYY-MM-DD sein, war: ${value}`);
  }
}

export type NoticeParty = "tenant" | "landlord";

export type NoticeDeadlineInput = {
  /** Datum, an dem die Kündigung beim Empfänger eingegangen ist (ISO). */
  notice_received_date: string;
  /** Wer kündigt? */
  notice_party?: NoticeParty;
  /**
   * Mietdauer (Jahre, gerundet abwärts), nur relevant für Vermieter-Kündigung.
   * Wird ignoriert, wenn `notice_party === "tenant"`.
   */
  lease_duration_years?: number;
  /**
   * Manuelle Override der Kündigungsfrist (Monate). Wenn gesetzt, gewinnt
   * dieser Wert über die §573c-Tabelle.
   */
  notice_period_months?: number;
};

export type NoticeDeadlineResult = {
  /** Effektives Mietende (ISO). */
  lease_end_date: string;
  /** Verwendete Kündigungsfrist in Monaten. */
  notice_period_months: number;
  /** True, wenn Werktag-Korrektur gegriffen hat. */
  workday_correction_applied: boolean;
};

/** Bundeseinheitliche Feiertage (vereinfacht: nur die jährlichen Fixe). */
const FIXED_HOLIDAYS: Array<[number, number]> = [
  [1, 1], // Neujahr
  [5, 1], // Tag der Arbeit
  [10, 3], // Tag der Deutschen Einheit
  [12, 25],
  [12, 26],
];

function isHoliday(year: number, month: number, day: number): boolean {
  return FIXED_HOLIDAYS.some(([m, d]) => m === month && d === day);
}

function isWorkday(date: Date): boolean {
  const dow = date.getUTCDay(); // 0=Sun, 6=Sat
  if (dow === 0 || dow === 6) return false;
  return !isHoliday(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Index des n-ten Werktags eines Monats (1-indexed).
 * Gibt das Day-of-Month zurück.
 */
function nthWorkdayOfMonth(year: number, month: number, n: number): number {
  let count = 0;
  for (let d = 1; d <= 31; d++) {
    const date = new Date(Date.UTC(year, month - 1, d));
    if (date.getUTCMonth() !== month - 1) break; // Monatsende
    if (isWorkday(date)) {
      count += 1;
      if (count === n) return d;
    }
  }
  return 31; // theoretisch unerreichbar
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function isoFromYmd(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function noticePeriodFromTable(
  party: NoticeParty,
  durationYears: number,
): number {
  if (party === "tenant") return 3;
  if (durationYears >= 8) return 9;
  if (durationYears >= 5) return 6;
  return 3;
}

export function calculateNoticeDeadline(
  input: NoticeDeadlineInput,
): NoticeDeadlineResult {
  assertIso(input.notice_received_date, "notice_received_date");

  const party = input.notice_party ?? "tenant";
  const durationYears = input.lease_duration_years ?? 0;
  const noticePeriodMonths =
    input.notice_period_months ?? noticePeriodFromTable(party, durationYears);

  const [y, m, d] = input.notice_received_date.split("-").map(Number);
  const thirdWorkday = nthWorkdayOfMonth(y, m, 3);

  // Werktag-Korrektur: Wenn der Eingangstag NACH dem 3. Werktag liegt,
  // startet die Frist erst im Folgemonat.
  const correction = d > thirdWorkday;
  // Berechnen: Frist beginnt am 1. des Eingangsmonats (oder Folgemonats bei
  // Korrektur), Ende ist nach `noticePeriodMonths` ganzen Monaten.
  let startMonth = m;
  let startYear = y;
  if (correction) {
    startMonth += 1;
    if (startMonth > 12) {
      startMonth -= 12;
      startYear += 1;
    }
  }

  // lease_end ist das Ende des Monats, in dem die Frist abläuft:
  // Frist beginnt zum 1. von startMonth, läuft `noticePeriodMonths` Monate.
  // Effektives Ende = letzter Tag des (startMonth + noticePeriodMonths - 1).
  let endMonth = startMonth + noticePeriodMonths - 1;
  let endYear = startYear;
  while (endMonth > 12) {
    endMonth -= 12;
    endYear += 1;
  }
  const endDay = lastDayOfMonth(endYear, endMonth);

  return {
    lease_end_date: isoFromYmd(endYear, endMonth, endDay),
    notice_period_months: noticePeriodMonths,
    workday_correction_applied: correction,
  };
}
