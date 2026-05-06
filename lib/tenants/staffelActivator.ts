/**
 * Staffelmieten-Aktivator (pure Function).
 *
 * Schaut ein `staffel_entries`-Array eines Mieters durch, vergleicht mit den
 * bereits persistierten `rent_adjustments` und liefert die Liste der neu zu
 * erzeugenden Adjustments. Idempotent: erneuter Aufruf nach Persistierung
 * liefert ein leeres `to_insert`.
 *
 * Konflikt-Logik (effective_date doppelt belegt mit anderem Betrag):
 *  - Bestehende Adjustments gewinnen — der Staffel-Entry wird mit Begründung
 *    "conflict" geskippt. So überschreibt eine manuelle Anpassung die
 *    Staffel und die Verlauf bleibt konsistent.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, name: string) {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`${name} muss ISO YYYY-MM-DD sein, war: ${value}`);
  }
}

export type StaffelEntry = {
  /** ISO yyyy-mm-dd: ab wann die neue Miete gilt. */
  effective_date: string;
  /** Neue Kaltmiete in Cent. */
  cold_rent_cents: number;
  /** Optional: neue NK-Vorauszahlung. */
  additional_costs_cents?: number;
  /** Optional: Notiz. */
  note?: string;
};

export type StaffelExistingAdjustment = {
  effective_date: string;
  cold_rent_cents: number;
  additional_costs_cents: number | null;
  adjustment_type: "manual" | "index" | "stepped";
};

export type StaffelActivatorInput = {
  tenant_id: string;
  staffel_entries: StaffelEntry[];
  /** Bestehende rent_adjustments für den Mieter (zum Idempotenz-Check). */
  existing_rent_adjustments: StaffelExistingAdjustment[];
  /** Stichtag (Default: heute). Materialisiert wird alles mit effective_date <= asOfDate. */
  asOfDate?: string;
};

export type StaffelActivatorInsert = {
  tenant_id: string;
  effective_date: string;
  cold_rent_cents: number;
  additional_costs_cents: number | null;
  adjustment_type: "stepped";
  note: string | null;
};

export type StaffelActivatorResult = {
  /** Neue rent_adjustments-Zeilen, die persistiert werden müssen. */
  to_insert: StaffelActivatorInsert[];
  /** Staffel-Einträge, die übersprungen wurden (mit Begründung). */
  skipped: Array<{ entry: StaffelEntry; reason: string }>;
};

/** Default-asOfDate ist „heute" (UTC) als YYYY-MM-DD. */
function todayIso(): string {
  const now = new Date();
  const yy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function activateStaffelEntries(
  input: StaffelActivatorInput,
): StaffelActivatorResult {
  const asOf = input.asOfDate ?? todayIso();
  assertIsoDate(asOf, "asOfDate");

  const toInsert: StaffelActivatorInsert[] = [];
  const skipped: StaffelActivatorResult["skipped"] = [];

  // Lookup für bestehende Adjustments per effective_date.
  const existingByDate = new Map<string, StaffelExistingAdjustment>();
  for (const ex of input.existing_rent_adjustments) {
    assertIsoDate(ex.effective_date, "existing.effective_date");
    existingByDate.set(ex.effective_date, ex);
  }

  for (const entry of input.staffel_entries) {
    assertIsoDate(entry.effective_date, "staffel_entry.effective_date");

    // Future-Entry → skip
    if (entry.effective_date > asOf) {
      skipped.push({ entry, reason: "future" });
      continue;
    }

    const existing = existingByDate.get(entry.effective_date);
    if (existing) {
      // Idempotent: gleiches Datum + gleicher Betrag → already_active
      if (existing.cold_rent_cents === entry.cold_rent_cents) {
        skipped.push({ entry, reason: "already_active" });
      } else {
        // Konflikt: bestehender Eintrag (z.B. manuelle Anpassung) gewinnt
        skipped.push({ entry, reason: "conflict" });
      }
      continue;
    }

    toInsert.push({
      tenant_id: input.tenant_id,
      effective_date: entry.effective_date,
      cold_rent_cents: entry.cold_rent_cents,
      additional_costs_cents: entry.additional_costs_cents ?? null,
      adjustment_type: "stepped",
      note: entry.note ?? null,
    });
  }

  // Sortiere to_insert nach effective_date ASC (deterministisch)
  toInsert.sort((a, b) =>
    a.effective_date < b.effective_date ? -1 : a.effective_date > b.effective_date ? 1 : 0,
  );

  return { to_insert: toInsert, skipped };
}
