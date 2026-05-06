/**
 * NKA Verteilungs-Engine (pure, deterministisch).
 *
 * Verteilt umlagefähige Kosten einer Periode auf Mieter nach den klassischen
 * BetrKV-Schlüsseln (m², Wohnungen, Personen, Verbrauch, direkt) inkl.
 * Pro-Rata-Tagesgewichtung bei Mieterwechseln und Heizkosten-Sondervorschrift
 * gemäß HeizkostenV §7 (i.d.R. 70% Verbrauch / 30% m²).
 *
 * Diese Datei ist bewusst frei von Side-Effects:
 * - kein Date.now / Math.random / I/O
 * - reproduzierbar bei gleicher Eingabe
 * - cent-genaue Rundung (half-up) mit Restcent-Korrektur
 *
 * Aufrufer (API-Route) lädt die nötigen Daten aus der DB, ruft `distribute()`
 * und persistiert das Ergebnis (siehe `app/api/nka/periods/[id]/distribute`).
 */

import { getActiveTenantSegments } from "@/lib/tenants/tenantPeriods";

export type Verteilungsschluessel =
  | "direct"
  | "sqm"
  | "units"
  | "persons"
  | "consumption";

export type BetrkvPosition =
  | "grundsteuer"
  | "wasser"
  | "abwasser"
  | "heizung"
  | "warmwasser"
  | "strassenreinigung"
  | "muellabfuhr"
  | "gebaeudereinigung"
  | "gartenpflege"
  | "beleuchtung"
  | "schornsteinreinigung"
  | "sach_haftpflicht_versicherung"
  | "hauswart"
  | "gemeinschaftsantenne_kabel"
  | "wartung"
  | "sonstiges";

export type NkaUnitInput = {
  id: string;
  unit_type: "residential" | "commercial";
  area_sqm: number | null;
  persons?: number | null;
  vat_liable?: boolean;
};

export type NkaTenantInput = {
  id: string;
  unit_id: string;
  lease_start: string; // ISO yyyy-mm-dd
  lease_end: string | null;
  cold_rent_cents: number;
  additional_costs_cents: number;
};

export type NkaCostItemInput = {
  id: string;
  position: BetrkvPosition;
  label?: string | null;
  brutto_cents: number;
  umlagefaehig_pct: number;
  verteilungsschluessel: Verteilungsschluessel;
  direct_shares?: Record<string, number>;
  consumption?: Record<string, { from: number; to: number }>;
  heizkosten_verbrauchsanteil_pct?: number;
};

export type NkaPaymentMatchInput = {
  tenant_id: string;
  period_month: string; // yyyy-mm
  cold_rent_cents: number;
  additional_costs_cents: number;
};

export type NkaDistributeInput = {
  periodStart: string; // yyyy-mm-dd inclusive
  periodEnd: string; // yyyy-mm-dd inclusive
  units: NkaUnitInput[];
  tenants: NkaTenantInput[];
  costItems: NkaCostItemInput[];
  paymentMatches?: NkaPaymentMatchInput[];
};

export type NkaShareLine = {
  cost_item_id: string;
  position: BetrkvPosition;
  label: string;
  schluessel: Verteilungsschluessel;
  base_brutto_cents: number;
  umlagefaehig_cents: number;
  tenant_share_cents: number;
  note?: string | null;
};

export type NkaTenantShare = {
  tenant_id: string;
  unit_id: string;
  active_days: number;
  shares: NkaShareLine[];
  total_share_cents: number;
  total_paid_advance_cents: number;
  balance_cents: number;
};

export type NkaWarning = {
  code: string;
  message: string;
  cost_item_id?: string;
  tenant_id?: string;
};

export type NkaDistributeOutput = {
  period_days: number;
  tenant_shares: NkaTenantShare[];
  warnings: NkaWarning[];
  unallocated_cents: Record<string, number>;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parsen einer ISO-Datums-Zeichenkette `yyyy-mm-dd` als UTC-Timestamp (ms). */
function parseIsoDate(iso: string): number {
  // Wir bauen den Timestamp explizit selbst, um Zeitzonen-Drifts zu vermeiden.
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) {
    throw new Error(`Ungültiges Datum (erwartet yyyy-mm-dd): ${iso}`);
  }
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** Anzahl Tage zwischen `from` und `to` (inklusive beider Tage). */
function daysInclusive(from: number, to: number): number {
  if (to < from) return 0;
  return Math.round((to - from) / MS_PER_DAY) + 1;
}

/**
 * Berechnet die Anzahl aktiver Tage eines Mieters in der Periode.
 * Mieter aktiv von `lease_start` bis `lease_end` (oder Periodenende, falls null).
 */
function activeDays(
  periodStartMs: number,
  periodEndMs: number,
  leaseStartIso: string,
  leaseEndIso: string | null,
): number {
  const leaseStart = parseIsoDate(leaseStartIso);
  const leaseEnd =
    leaseEndIso === null ? periodEndMs : parseIsoDate(leaseEndIso);

  if (leaseStart > periodEndMs) return 0;
  if (leaseEnd < periodStartMs) return 0;

  const overlapStart = Math.max(periodStartMs, leaseStart);
  const overlapEnd = Math.min(periodEndMs, leaseEnd);
  return daysInclusive(overlapStart, overlapEnd);
}

/**
 * Cent-Rundung nach "Half-Up" (kaufmännisch). Negative Beträge werden
 * symmetrisch behandelt.
 */
function roundCentsHalfUp(cents: number): number {
  if (cents >= 0) return Math.floor(cents + 0.5);
  return -Math.floor(-cents + 0.5);
}

/** Default-Bezeichnung pro BetrKV-Position (DE). */
const POSITION_LABELS: Record<BetrkvPosition, string> = {
  grundsteuer: "Grundsteuer",
  wasser: "Wasser",
  abwasser: "Abwasser",
  heizung: "Heizung",
  warmwasser: "Warmwasser",
  strassenreinigung: "Straßenreinigung",
  muellabfuhr: "Müllabfuhr",
  gebaeudereinigung: "Gebäudereinigung",
  gartenpflege: "Gartenpflege",
  beleuchtung: "Beleuchtung",
  schornsteinreinigung: "Schornsteinreinigung",
  sach_haftpflicht_versicherung: "Sach- & Haftpflichtversicherung",
  hauswart: "Hauswart",
  gemeinschaftsantenne_kabel: "Gemeinschaftsantenne / Kabel",
  wartung: "Wartung",
  sonstiges: "Sonstiges",
};

/**
 * Verteilt einen umlagefähigen Cent-Betrag gewichtet auf eine Liste von
 * (key, weight)-Tupeln. Restcent (Σ rounded ≠ rounded(total)) geht zum
 * Empfänger mit dem größten Gewicht (deterministisch, bei Gleichstand der
 * lexikografisch kleinste Key).
 *
 * Liefert `null`, wenn die Gesamtgewichtung 0 ist (keine Verteilung möglich).
 */
function distributeWeighted(
  totalCents: number,
  weighted: Array<{ key: string; weight: number }>,
): Map<string, number> | null {
  const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
  if (totalWeight <= 0) return null;
  if (weighted.length === 0) return null;

  // Vorläufige Cent-Beträge (rohe, ungerundete float).
  const raw = weighted.map((w) => ({
    key: w.key,
    weight: w.weight,
    raw: (totalCents * w.weight) / totalWeight,
  }));
  const rounded = raw.map((r) => ({ ...r, value: roundCentsHalfUp(r.raw) }));

  const sumRounded = rounded.reduce((s, r) => s + r.value, 0);
  const targetRounded = roundCentsHalfUp(totalCents);
  const diff = targetRounded - sumRounded;

  if (diff !== 0) {
    // Restcent zur Einheit mit größtem Gewicht (bei Gleichstand: kleinster Key).
    let bestIdx = 0;
    for (let i = 1; i < rounded.length; i++) {
      const a = rounded[bestIdx];
      const b = rounded[i];
      if (b.weight > a.weight || (b.weight === a.weight && b.key < a.key)) {
        bestIdx = i;
      }
    }
    rounded[bestIdx].value += diff;
  }

  const map = new Map<string, number>();
  for (const r of rounded) {
    map.set(r.key, (map.get(r.key) ?? 0) + r.value);
  }
  return map;
}

/**
 * Berechnet pro Tenant einen Gewichtungsfaktor je nach Schlüssel.
 * Liefert eine Liste { tenant_id, weight } sowie den (potentiellen) Leerstand-
 * Anteil an der Gewichtung (für Schlüssel, die auf Einheit + Tagen basieren).
 *
 * Leerstand: Wenn eine Einheit zeitweise unvermietet war, fließt das fehlende
 * Tag-Gewicht in `vacantWeight`.
 */
type WeightingResult = {
  tenantWeights: Array<{ tenant_id: string; weight: number }>;
  vacantWeight: number;
};

function weightSqm(
  units: NkaUnitInput[],
  tenants: Array<NkaTenantInput & { active_days: number }>,
  periodDays: number,
): WeightingResult {
  // Total m²-Tage = Σ unit.area_sqm × periodDays (alle Einheiten)
  // Tenant-Gewicht = unit.area_sqm × tenant.active_days
  // Leerstand = unit.area_sqm × (periodDays - Σ active_days der Mieter dieser Unit)
  const tenantWeights: Array<{ tenant_id: string; weight: number }> = [];
  let vacantWeight = 0;
  for (const u of units) {
    const sqm = u.area_sqm ?? 0;
    if (sqm <= 0) continue;
    const unitTenants = tenants.filter((t) => t.unit_id === u.id);
    let occupiedDays = 0;
    for (const t of unitTenants) {
      const w = sqm * t.active_days;
      if (w > 0) tenantWeights.push({ tenant_id: t.id, weight: w });
      occupiedDays += t.active_days;
    }
    // Leerstand kann auftreten, wenn occupiedDays < periodDays.
    const vacantDays = Math.max(0, periodDays - occupiedDays);
    if (vacantDays > 0) {
      vacantWeight += sqm * vacantDays;
    }
  }
  return { tenantWeights, vacantWeight };
}

function weightUnits(
  units: NkaUnitInput[],
  tenants: Array<NkaTenantInput & { active_days: number }>,
  periodDays: number,
): WeightingResult {
  // Jede Einheit zählt 1 (gewichtet nach Tagen).
  const tenantWeights: Array<{ tenant_id: string; weight: number }> = [];
  let vacantWeight = 0;
  for (const u of units) {
    const unitTenants = tenants.filter((t) => t.unit_id === u.id);
    let occupiedDays = 0;
    for (const t of unitTenants) {
      const w = t.active_days;
      if (w > 0) tenantWeights.push({ tenant_id: t.id, weight: w });
      occupiedDays += t.active_days;
    }
    const vacantDays = Math.max(0, periodDays - occupiedDays);
    if (vacantDays > 0) vacantWeight += vacantDays;
  }
  return { tenantWeights, vacantWeight };
}

function weightPersons(
  units: NkaUnitInput[],
  tenants: Array<NkaTenantInput & { active_days: number }>,
  periodDays: number,
): WeightingResult {
  const tenantWeights: Array<{ tenant_id: string; weight: number }> = [];
  let vacantWeight = 0;
  for (const u of units) {
    const persons = Math.max(1, u.persons ?? 1);
    const unitTenants = tenants.filter((t) => t.unit_id === u.id);
    let occupiedDays = 0;
    for (const t of unitTenants) {
      const w = persons * t.active_days;
      if (w > 0) tenantWeights.push({ tenant_id: t.id, weight: w });
      occupiedDays += t.active_days;
    }
    const vacantDays = Math.max(0, periodDays - occupiedDays);
    if (vacantDays > 0) vacantWeight += persons * vacantDays;
  }
  return { tenantWeights, vacantWeight };
}

function weightConsumption(
  units: NkaUnitInput[],
  tenants: Array<NkaTenantInput & { active_days: number }>,
  consumption: Record<string, { from: number; to: number }> | undefined,
  warnings: NkaWarning[],
  costItemId: string,
): { result: WeightingResult; ok: boolean } {
  const tenantWeights: Array<{ tenant_id: string; weight: number }> = [];
  let vacantWeight = 0;
  let ok = true;
  if (!consumption) {
    return { result: { tenantWeights, vacantWeight: 0 }, ok: false };
  }

  for (const u of units) {
    const c = consumption[u.id];
    if (!c) continue;
    if (c.to < c.from) {
      warnings.push({
        code: "consumption_negative",
        message: `Verbrauch (to < from) für Einheit ${u.id}: ${c.from} → ${c.to}`,
        cost_item_id: costItemId,
      });
      ok = false;
      continue;
    }
    const verbrauch = c.to - c.from;
    if (verbrauch <= 0) continue;

    const unitTenants = tenants.filter((t) => t.unit_id === u.id);
    const totalActiveDays = unitTenants.reduce((s, t) => s + t.active_days, 0);
    if (totalActiveDays <= 0) {
      // Verbrauch ohne aktiven Mieter → komplett Leerstand
      vacantWeight += verbrauch;
      continue;
    }
    for (const t of unitTenants) {
      // Gewichte den Verbrauch der Einheit anteilig nach Aktivtagen.
      const share = (verbrauch * t.active_days) / totalActiveDays;
      if (share > 0) tenantWeights.push({ tenant_id: t.id, weight: share });
    }
  }
  return { result: { tenantWeights, vacantWeight }, ok };
}

// ─── Hauptfunktion ──────────────────────────────────────────────────────────

export function distribute(input: NkaDistributeInput): NkaDistributeOutput {
  const warnings: NkaWarning[] = [];
  const periodStartMs = parseIsoDate(input.periodStart);
  const periodEndMs = parseIsoDate(input.periodEnd);
  if (periodEndMs < periodStartMs) {
    throw new Error(
      `periodEnd (${input.periodEnd}) liegt vor periodStart (${input.periodStart}).`,
    );
  }
  const periodDays = daysInclusive(periodStartMs, periodEndMs);

  // Aktive Mieter ermitteln über die zentrale Pure Function (siehe
  // `lib/tenants/tenantPeriods.ts`). Status wird hier nicht ausgewertet —
  // NKA betrachtet alle Mieter mit überlappendem Mietverhältnis.
  const segments = getActiveTenantSegments({
    tenants: input.tenants.map((t) => ({
      id: t.id,
      unit_id: t.unit_id,
      lease_start: t.lease_start,
      lease_end: t.lease_end,
      status: "active",
    })),
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
  });
  const activeDaysById = new Map(segments.map((s) => [s.tenant_id, s.days]));
  const activeTenants = input.tenants
    .filter((t) => activeDaysById.has(t.id))
    .map((t) => ({ ...t, active_days: activeDaysById.get(t.id)! }));

  // Determinismus: feste Reihenfolge (sortiert nach id).
  activeTenants.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Skeleton der tenant_shares vorbereiten (auch mit 0 € shares, damit ein
  // Mieter ohne zugewiesene Position trotzdem mit 0 erscheint).
  const tenantShareMap = new Map<string, NkaTenantShare>();
  for (const t of activeTenants) {
    tenantShareMap.set(t.id, {
      tenant_id: t.id,
      unit_id: t.unit_id,
      active_days: t.active_days,
      shares: [],
      total_share_cents: 0,
      total_paid_advance_cents: 0,
      balance_cents: 0,
    });
  }

  const unallocated: Record<string, number> = {};

  // Sortierte Cost-Items für Determinismus.
  const sortedCostItems = [...input.costItems].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  for (const item of sortedCostItems) {
    const label = item.label ?? POSITION_LABELS[item.position] ?? item.position;
    const brutto = roundCentsHalfUp(item.brutto_cents);
    const umlPct = Math.max(0, Math.min(100, item.umlagefaehig_pct));
    const umlagefaehig = roundCentsHalfUp((brutto * umlPct) / 100);

    if (umlagefaehig === 0) {
      // Nichts zu verteilen, aber baseline-Eintrag pro Mieter (für Transparenz),
      // damit der Output für jeden Mieter alle Items enthält.
      for (const t of activeTenants) {
        const ts = tenantShareMap.get(t.id)!;
        ts.shares.push({
          cost_item_id: item.id,
          position: item.position,
          label,
          schluessel: item.verteilungsschluessel,
          base_brutto_cents: brutto,
          umlagefaehig_cents: 0,
          tenant_share_cents: 0,
          note: umlPct === 0 ? "0 % umlagefähig" : null,
        });
      }
      continue;
    }

    if (item.verteilungsschluessel === "direct") {
      // Direct: explizite Mieteranteile.
      const direct = item.direct_shares ?? {};
      const sumDirect = Object.values(direct).reduce(
        (s, v) => s + roundCentsHalfUp(v ?? 0),
        0,
      );
      let unallocFromDirect = 0;
      if (sumDirect !== umlagefaehig) {
        warnings.push({
          code: "direct_shares_mismatch",
          message: `direct_shares (${sumDirect} ¢) ≠ umlagefähig (${umlagefaehig} ¢) für Position ${item.position}.`,
          cost_item_id: item.id,
        });
        unallocFromDirect = umlagefaehig - sumDirect;
      }

      for (const t of activeTenants) {
        const ts = tenantShareMap.get(t.id)!;
        const tenantShare = roundCentsHalfUp(direct[t.id] ?? 0);
        ts.shares.push({
          cost_item_id: item.id,
          position: item.position,
          label,
          schluessel: "direct",
          base_brutto_cents: brutto,
          umlagefaehig_cents: umlagefaehig,
          tenant_share_cents: tenantShare,
          note: tenantShare > 0 ? "direkter Anteil" : null,
        });
        ts.total_share_cents += tenantShare;
      }
      // Direkt-Anteile, die nicht aktiven Mietern zugewiesen wurden,
      // landen in unallocated.
      for (const [tenantId, val] of Object.entries(direct)) {
        if (!tenantShareMap.has(tenantId)) {
          unallocFromDirect += roundCentsHalfUp(val ?? 0);
          warnings.push({
            code: "direct_share_inactive_tenant",
            message: `direct_share für inaktiven oder unbekannten Mieter ${tenantId} ignoriert.`,
            cost_item_id: item.id,
            tenant_id: tenantId,
          });
        }
      }
      if (unallocFromDirect !== 0) {
        unallocated[item.id] = (unallocated[item.id] ?? 0) + unallocFromDirect;
      }
      continue;
    }

    if (item.position === "heizung") {
      // HeizkostenV §7: 50–70 % nach Verbrauch, Rest nach Fläche.
      const verbrauchPctRaw = item.heizkosten_verbrauchsanteil_pct ?? 70;
      const verbrauchPct = Math.max(50, Math.min(100, verbrauchPctRaw));
      if (verbrauchPctRaw < 50) {
        warnings.push({
          code: "heiz_verbrauch_zu_niedrig",
          message: `heizkosten_verbrauchsanteil_pct=${verbrauchPctRaw} unter dem gesetzlichen Minimum (50). Auf 50 angehoben.`,
          cost_item_id: item.id,
        });
      }

      // Fallback: keine consumption → 100 % nach m² mit Warning.
      const consumptionData = item.consumption;
      const hasConsumption =
        !!consumptionData && Object.keys(consumptionData).length > 0;

      if (!hasConsumption) {
        warnings.push({
          code: "heiz_no_consumption_fallback_sqm",
          message:
            "Heizung ohne Verbrauchsdaten – Fallback auf 100 % m² (rechtlich nur eingeschränkt zulässig).",
          cost_item_id: item.id,
        });
        const w = weightSqm(input.units, activeTenants, periodDays);
        applyWeights(
          item,
          umlagefaehig,
          brutto,
          label,
          item.verteilungsschluessel,
          w,
          tenantShareMap,
          unallocated,
          activeTenants,
          "Fallback m² (kein Verbrauch erfasst)",
        );
        continue;
      }

      const verbrauchAnteilCents = roundCentsHalfUp(
        (umlagefaehig * verbrauchPct) / 100,
      );
      const flaecheAnteilCents = umlagefaehig - verbrauchAnteilCents;

      // Verbrauchsanteil
      const cw = weightConsumption(
        input.units,
        activeTenants,
        consumptionData,
        warnings,
        item.id,
      );
      applyWeights(
        item,
        verbrauchAnteilCents,
        brutto,
        label,
        "consumption",
        cw.result,
        tenantShareMap,
        unallocated,
        activeTenants,
        `${verbrauchPct} % Verbrauch (HeizkostenV)`,
      );

      // Flächenanteil
      const sw = weightSqm(input.units, activeTenants, periodDays);
      applyWeights(
        item,
        flaecheAnteilCents,
        brutto,
        label,
        "sqm",
        sw,
        tenantShareMap,
        unallocated,
        activeTenants,
        `${100 - verbrauchPct} % Fläche (HeizkostenV)`,
      );
      continue;
    }

    // Regulärer Schlüssel
    let weighting: WeightingResult;
    let noteForLine: string | null = null;
    switch (item.verteilungsschluessel) {
      case "sqm":
        weighting = weightSqm(input.units, activeTenants, periodDays);
        break;
      case "units":
        weighting = weightUnits(input.units, activeTenants, periodDays);
        break;
      case "persons":
        weighting = weightPersons(input.units, activeTenants, periodDays);
        break;
      case "consumption": {
        const cw = weightConsumption(
          input.units,
          activeTenants,
          item.consumption,
          warnings,
          item.id,
        );
        weighting = cw.result;
        if (!cw.ok && (!item.consumption || Object.keys(item.consumption).length === 0)) {
          warnings.push({
            code: "consumption_missing",
            message:
              "Verbrauchs-Schlüssel ohne Daten – nichts verteilbar; Betrag landet in unallocated.",
            cost_item_id: item.id,
          });
        }
        noteForLine = "Verbrauch";
        break;
      }
      default: {
        // Sollte durch TypeScript-Erschöpfung nie passieren, aber defensiv.
        warnings.push({
          code: "unknown_schluessel",
          message: `Unbekannter Verteilungsschlüssel: ${String(
            item.verteilungsschluessel,
          )}`,
          cost_item_id: item.id,
        });
        continue;
      }
    }

    applyWeights(
      item,
      umlagefaehig,
      brutto,
      label,
      item.verteilungsschluessel,
      weighting,
      tenantShareMap,
      unallocated,
      activeTenants,
      noteForLine,
    );
  }

  // Vorauszahlungen aggregieren (additional_costs_cents aus paymentMatches).
  const advanceMap = new Map<string, number>();
  for (const pm of input.paymentMatches ?? []) {
    advanceMap.set(
      pm.tenant_id,
      (advanceMap.get(pm.tenant_id) ?? 0) +
        roundCentsHalfUp(pm.additional_costs_cents),
    );
  }

  const tenant_shares: NkaTenantShare[] = [];
  // Wieder sortierte Reihenfolge für deterministischen Output.
  for (const t of activeTenants) {
    const ts = tenantShareMap.get(t.id)!;
    ts.total_paid_advance_cents = advanceMap.get(t.id) ?? 0;
    ts.balance_cents = ts.total_paid_advance_cents - ts.total_share_cents;
    tenant_shares.push(ts);
  }

  return {
    period_days: periodDays,
    tenant_shares,
    warnings,
    unallocated_cents: unallocated,
  };
}

/**
 * Rechnet ein gewichtetes Verteilungs-Ergebnis in tenant_shares ein und
 * akkumuliert nicht zuordenbares Restgeld in `unallocated`.
 */
function applyWeights(
  item: NkaCostItemInput,
  amountCents: number,
  bruttoCents: number,
  label: string,
  schluesselForLine: Verteilungsschluessel,
  weighting: WeightingResult,
  tenantShareMap: Map<string, NkaTenantShare>,
  unallocated: Record<string, number>,
  activeTenants: Array<NkaTenantInput & { active_days: number }>,
  noteForLine: string | null,
): void {
  if (amountCents === 0) {
    for (const t of activeTenants) {
      const ts = tenantShareMap.get(t.id)!;
      ts.shares.push({
        cost_item_id: item.id,
        position: item.position,
        label,
        schluessel: schluesselForLine,
        base_brutto_cents: bruttoCents,
        umlagefaehig_cents: amountCents,
        tenant_share_cents: 0,
        note: noteForLine,
      });
    }
    return;
  }

  const totalWeightTenants = weighting.tenantWeights.reduce(
    (s, w) => s + w.weight,
    0,
  );
  const totalWeight = totalWeightTenants + weighting.vacantWeight;

  if (totalWeight <= 0) {
    // Gar nichts zu verteilen → komplett in unallocated.
    unallocated[item.id] = (unallocated[item.id] ?? 0) + amountCents;
    for (const t of activeTenants) {
      const ts = tenantShareMap.get(t.id)!;
      ts.shares.push({
        cost_item_id: item.id,
        position: item.position,
        label,
        schluessel: schluesselForLine,
        base_brutto_cents: bruttoCents,
        umlagefaehig_cents: amountCents,
        tenant_share_cents: 0,
        note: noteForLine ?? "nicht verteilbar",
      });
    }
    return;
  }

  // Vermieter-Anteil (Leerstand) zuerst herausrechnen — Restcent geht zur
  // größten Mieter-Einheit, damit der Mieterbereich exakt summiert.
  const tenantPortionCents = roundCentsHalfUp(
    (amountCents * totalWeightTenants) / totalWeight,
  );
  const vacantPortionCents = amountCents - tenantPortionCents;

  if (vacantPortionCents !== 0) {
    unallocated[item.id] = (unallocated[item.id] ?? 0) + vacantPortionCents;
  }

  // Verteile tenantPortionCents auf die Mieter nach Gewichten.
  if (tenantPortionCents !== 0 && weighting.tenantWeights.length > 0) {
    const distMap = distributeWeighted(
      tenantPortionCents,
      weighting.tenantWeights.map((w) => ({
        key: w.tenant_id,
        weight: w.weight,
      })),
    );
    if (distMap === null) {
      unallocated[item.id] =
        (unallocated[item.id] ?? 0) + tenantPortionCents;
      for (const t of activeTenants) {
        const ts = tenantShareMap.get(t.id)!;
        ts.shares.push({
          cost_item_id: item.id,
          position: item.position,
          label,
          schluessel: schluesselForLine,
          base_brutto_cents: bruttoCents,
          umlagefaehig_cents: amountCents,
          tenant_share_cents: 0,
          note: noteForLine ?? "nicht verteilbar",
        });
      }
      return;
    }

    // Aggregiere: ein Mieter kann mehrere Gewichte beigesteuert haben (eine
    // Unit hat mehrere Mieter mit überlappenden Tagen wäre unüblich, aber
    // wir summieren defensiv trotzdem).
    for (const t of activeTenants) {
      const ts = tenantShareMap.get(t.id)!;
      const share = distMap.get(t.id) ?? 0;
      ts.shares.push({
        cost_item_id: item.id,
        position: item.position,
        label,
        schluessel: schluesselForLine,
        base_brutto_cents: bruttoCents,
        umlagefaehig_cents: amountCents,
        tenant_share_cents: share,
        note: noteForLine,
      });
      ts.total_share_cents += share;
    }
  } else {
    // Kein Mieter-Gewicht → nichts an Mieter; Eintrag mit 0 anlegen.
    for (const t of activeTenants) {
      const ts = tenantShareMap.get(t.id)!;
      ts.shares.push({
        cost_item_id: item.id,
        position: item.position,
        label,
        schluessel: schluesselForLine,
        base_brutto_cents: bruttoCents,
        umlagefaehig_cents: amountCents,
        tenant_share_cents: 0,
        note: noteForLine,
      });
    }
  }
}
