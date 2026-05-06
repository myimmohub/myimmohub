/**
 * Mietzins-Auflösung zu einem Stichtag.
 *
 * Heute überschreibt `app/api/rent-adjustments/route.ts:80..91` direkt
 * `tenants.cold_rent_cents` und `tenants.additional_costs_cents`, sobald
 * `effective_date <= heute`. Das macht historische Auswertungen brüchig:
 * Anlage V, NKA und `rent-arrears` sehen jeweils nur den letzten Wert.
 *
 * Diese Pure Function ist die zentrale Wahrheit dafür, welche Kalt-/NK-Werte
 * an einem gegebenen Stichtag galten. Sie ist deterministisch, ohne DB-
 * Zugriff und damit goldstandard-tauglich.
 *
 * Vertrag:
 *   - Eingabe: ein Mieter-Stamm (cold + nk + lease_start) und eine Liste
 *     der `rent_adjustments` für diesen Mieter.
 *   - Ausgabe: cold_rent_cents / additional_costs_cents zum Stichtag.
 *
 * Regeln:
 *   1. Adjustment mit `effective_date > asOfDate` wird ignoriert.
 *   2. Adjustments werden nach `effective_date` aufsteigend sortiert; das
 *      jüngste Adjustment, dessen `effective_date <= asOfDate`, gewinnt.
 *   3. Ohne anwendbares Adjustment: Fallback auf den Stamm
 *      (`tenants.cold_rent_cents`, `tenants.additional_costs_cents`).
 *   4. Ist `asOfDate < lease_start`, gibt die Funktion den Stamm zurück
 *      und setzt `applied=false` — Auswertungen können das anzeigen.
 *
 * Datum-Format: ISO YYYY-MM-DD. Wir vergleichen lexikographisch — bei ISO
 * korrekt äquivalent zu Date-Vergleich, ohne Timezone-Stolperfallen.
 */

export type TenantBase = {
  id: string;
  cold_rent_cents: number;
  additional_costs_cents: number | null;
  lease_start: string; // ISO YYYY-MM-DD
};

export type RentAdjustment = {
  id?: string;
  tenant_id?: string;
  effective_date: string; // ISO YYYY-MM-DD
  cold_rent_cents: number;
  additional_costs_cents: number | null;
  adjustment_type?: "manual" | "index" | "stepped";
};

export type EffectiveRent = {
  cold_rent_cents: number;
  additional_costs_cents: number;
  /** Inkrafttretensdatum des angewandten Adjustments oder lease_start (Fallback). */
  effective_from: string;
  /** Quelle: 'base' = Stammdatensatz, 'adjustment' = aus rent_adjustments. */
  source: "base" | "adjustment";
  /** False, wenn `asOfDate < lease_start` (Mietverhältnis noch nicht aktiv). */
  applied: boolean;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, name: string) {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`${name} muss ISO YYYY-MM-DD sein, war: ${value}`);
  }
}

/** Effektiver Mietzins zu einem Stichtag. */
export function effectiveRentAt(
  tenant: TenantBase,
  adjustments: RentAdjustment[],
  asOfDate: string,
): EffectiveRent {
  assertIsoDate(asOfDate, "asOfDate");
  assertIsoDate(tenant.lease_start, "tenant.lease_start");

  const baseAdditional = tenant.additional_costs_cents ?? 0;
  const base: EffectiveRent = {
    cold_rent_cents: tenant.cold_rent_cents,
    additional_costs_cents: baseAdditional,
    effective_from: tenant.lease_start,
    source: "base",
    applied: asOfDate >= tenant.lease_start,
  };

  if (asOfDate < tenant.lease_start) {
    return base;
  }

  // Filter: nur Adjustments, die zum Stichtag schon greifen.
  const eligible = adjustments
    .filter((adj) => {
      assertIsoDate(adj.effective_date, "adjustment.effective_date");
      return adj.effective_date <= asOfDate;
    })
    // Sortiere nach effective_date aufsteigend, ties brechen wir stabil.
    .sort((a, b) => {
      if (a.effective_date < b.effective_date) return -1;
      if (a.effective_date > b.effective_date) return 1;
      return 0;
    });

  if (eligible.length === 0) return base;

  // Adjustments vor dem lease_start sind unsinnig, aber technisch zulässig —
  // wir respektieren sie trotzdem (das jüngste gewinnt). Sollte das System
  // sie verbieten wollen, gehört das in die API-Validation.
  const winner = eligible[eligible.length - 1];

  return {
    cold_rent_cents: winner.cold_rent_cents,
    additional_costs_cents: winner.additional_costs_cents ?? 0,
    effective_from: winner.effective_date,
    source: "adjustment",
    applied: true,
  };
}

/**
 * Materialisiert offene Staffelmieten in echte `rent_adjustments`.
 *
 * Eingabe: Mieter mit `staffel_entries` (jsonb-Array aus
 * `tenants`), bereits gespeicherte `rent_adjustments` und Stichtag.
 * Ausgabe: Liste neu zu erzeugender `rent_adjustments` (also
 * staffel_entries mit `effective_date <= asOfDate`, die noch nicht
 * vorhanden sind).
 *
 * Idempotent: ein zweiter Aufruf nach Persistierung liefert ein leeres
 * Array.
 *
 * Vergleich gegen bestehende Adjustments erfolgt über `effective_date` +
 * `cold_rent_cents` (ein Tupel je Datum). Das passt zur
 * Migrationspraxis (kein UNIQUE-Index auf `tenant_id, effective_date`).
 */
export type StaffelEntry = {
  effective_date: string;
  cold_rent_cents: number;
  additional_costs_cents?: number;
};

export function pendingStaffelAdjustments(args: {
  tenantId: string;
  staffelEntries: StaffelEntry[];
  existingAdjustments: RentAdjustment[];
  asOfDate: string;
}): RentAdjustment[] {
  const { tenantId, staffelEntries, existingAdjustments, asOfDate } = args;
  assertIsoDate(asOfDate, "asOfDate");

  const existingKeys = new Set(
    existingAdjustments.map((adj) => `${adj.effective_date}:${adj.cold_rent_cents}`),
  );

  const out: RentAdjustment[] = [];
  for (const entry of staffelEntries) {
    assertIsoDate(entry.effective_date, "staffelEntry.effective_date");
    if (entry.effective_date > asOfDate) continue;
    const key = `${entry.effective_date}:${entry.cold_rent_cents}`;
    if (existingKeys.has(key)) continue;
    out.push({
      tenant_id: tenantId,
      effective_date: entry.effective_date,
      cold_rent_cents: entry.cold_rent_cents,
      additional_costs_cents: entry.additional_costs_cents ?? null,
      adjustment_type: "stepped",
    });
    existingKeys.add(key);
  }
  return out;
}
