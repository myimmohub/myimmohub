/**
 * classifyArrears (pure Function).
 *
 * Klassifiziert Mietrückstände eines Mieters pro Monat und liefert die
 * Liste der zu erzeugenden `rent_arrears_events` zurück.
 *
 * Levels:
 *   0 = Erinnerung
 *   1 = 1. Mahnung
 *   2 = 2. Mahnung
 *   3 = letztmalige Mahnung
 *
 * Default-Schwellen (Tage Verzug, gemessen ab dem 1. des Monats):
 *   reminder = 10, mahnung1 = 30, mahnung2 = 60, mahnung3 = 90.
 *
 * Logik:
 *   Pro Mieter pro Monat (zwischen lease_start und min(lease_end, asOfDate)):
 *     soll  = effektive Kalt + NK zum Monatsbeginn
 *     ist   = Σ payments für diesen Monat
 *     wenn ist >= soll → ausgeglichen, kein Event
 *     sonst:           level = max( i ∈ {0,1,2,3} | daysOverdue ≥ thresh[i] )
 *                      wenn level existiert UND noch kein event mit
 *                      (tenant, month, level) in `existing_events` → emit.
 *   Eskalation aufwärts (ein höheres Level inkludiert die niedrigeren).
 *
 * Keine Side-Effects, deterministisch.
 */

import { effectiveRentAt, type RentAdjustment } from "@/lib/tenants/effectiveRent";

export type ArrearsLevel = 0 | 1 | 2 | 3;

export type ArrearsTenant = {
  id: string;
  property_id: string;
  cold_rent_cents: number;
  additional_costs_cents: number;
  lease_start: string; // ISO yyyy-mm-dd
  lease_end: string | null; // ISO yyyy-mm-dd | null
  status: "active" | "notice_given" | "ended";
};

export type ArrearsPayment = {
  tenant_id: string;
  period_month: string; // yyyy-mm
  amount_cents: number;
};

export type ArrearsExistingEvent = {
  tenant_id: string;
  arrear_month: string; // yyyy-mm
  level: number;
  status: string;
};

export type ArrearsThresholds = {
  reminder: number;
  mahnung1: number;
  mahnung2: number;
  mahnung3: number;
};

export type ArrearsClassifyInput = {
  tenants: ArrearsTenant[];
  payments: ArrearsPayment[];
  existing_events: ArrearsExistingEvent[];
  asOfDate: string; // ISO yyyy-mm-dd
  thresholds?: ArrearsThresholds;
  /**
   * Optional: rent_adjustments je tenant. Wird benutzt, um die historisch
   * korrekte Soll-Miete pro Monat zu ermitteln (effectiveRentAt).
   */
  rent_adjustments?: Record<string, RentAdjustment[]>;
};

export type ArrearsEventToCreate = {
  tenant_id: string;
  property_id: string;
  arrear_month: string;
  arrear_amount_cents: number;
  level: ArrearsLevel;
  reason: string;
};

export type ArrearsClassifySkipped = {
  tenant_id: string;
  arrear_month: string;
  level: number;
  reason: string;
};

export type ArrearsClassifyResult = {
  events_to_create: ArrearsEventToCreate[];
  skipped: ArrearsClassifySkipped[];
};

const DEFAULT_THRESHOLDS: ArrearsThresholds = {
  reminder: 10,
  mahnung1: 30,
  mahnung2: 60,
  mahnung3: 90,
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, name: string) {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`${name} muss ISO YYYY-MM-DD sein, war: ${value}`);
  }
}

/** yyyy-mm aus yyyy-mm-dd. */
function toMonth(iso: string): string {
  return iso.slice(0, 7);
}

/** Erster des Monats. */
function firstOfMonth(month: string): string {
  return `${month}-01`;
}

/** Liste aller Monate von startMonth bis endMonth (inkl.), beide yyyy-mm. */
function monthsBetween(startMonth: string, endMonth: string): string[] {
  if (startMonth > endMonth) return [];
  const out: string[] = [];
  const [sy, sm] = startMonth.split("-").map(Number);
  const [ey, em] = endMonth.split("-").map(Number);
  let y = sy;
  let m = sm;
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y.toString().padStart(4, "0")}-${m.toString().padStart(2, "0")}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** Tage zwischen zwei ISO-Daten (UTC, ganzzahlig). */
function daysBetween(fromIso: string, toIso: string): number {
  const f = Date.UTC(
    Number(fromIso.slice(0, 4)),
    Number(fromIso.slice(5, 7)) - 1,
    Number(fromIso.slice(8, 10)),
  );
  const t = Date.UTC(
    Number(toIso.slice(0, 4)),
    Number(toIso.slice(5, 7)) - 1,
    Number(toIso.slice(8, 10)),
  );
  return Math.floor((t - f) / 86_400_000);
}

function levelForOverdue(
  daysOverdue: number,
  thresholds: ArrearsThresholds,
): ArrearsLevel | null {
  if (daysOverdue >= thresholds.mahnung3) return 3;
  if (daysOverdue >= thresholds.mahnung2) return 2;
  if (daysOverdue >= thresholds.mahnung1) return 1;
  if (daysOverdue >= thresholds.reminder) return 0;
  return null;
}

export function classifyArrears(
  input: ArrearsClassifyInput,
): ArrearsClassifyResult {
  assertIsoDate(input.asOfDate, "asOfDate");
  const thresholds = input.thresholds ?? DEFAULT_THRESHOLDS;

  // Index: tenant_id → existing levels per month.
  const existingByTenant = new Map<string, Map<string, Set<number>>>();
  for (const ev of input.existing_events) {
    const months = existingByTenant.get(ev.tenant_id) ?? new Map<string, Set<number>>();
    const set = months.get(ev.arrear_month) ?? new Set<number>();
    set.add(ev.level);
    months.set(ev.arrear_month, set);
    existingByTenant.set(ev.tenant_id, months);
  }

  // Index: tenant_id → month → paid_cents
  const paymentsByTenantMonth = new Map<string, Map<string, number>>();
  for (const p of input.payments) {
    const months = paymentsByTenantMonth.get(p.tenant_id) ?? new Map<string, number>();
    const cur = months.get(p.period_month) ?? 0;
    months.set(p.period_month, cur + p.amount_cents);
    paymentsByTenantMonth.set(p.tenant_id, months);
  }

  const eventsToCreate: ArrearsEventToCreate[] = [];
  const skipped: ArrearsClassifySkipped[] = [];

  for (const tenant of input.tenants) {
    if (tenant.status === "ended") continue;
    assertIsoDate(tenant.lease_start, `tenant[${tenant.id}].lease_start`);
    if (tenant.lease_end) {
      assertIsoDate(tenant.lease_end, `tenant[${tenant.id}].lease_end`);
    }

    const startMonth = toMonth(tenant.lease_start);
    const effectiveEndIso =
      tenant.lease_end && tenant.lease_end < input.asOfDate
        ? tenant.lease_end
        : input.asOfDate;
    const endMonth = toMonth(effectiveEndIso);

    const months = monthsBetween(startMonth, endMonth);
    const adjustments = input.rent_adjustments?.[tenant.id] ?? [];
    const existingMonths = existingByTenant.get(tenant.id);

    for (const month of months) {
      const monthFirst = firstOfMonth(month);
      // Effektive Soll-Miete zu Monatsbeginn
      const eff = effectiveRentAt(
        {
          id: tenant.id,
          cold_rent_cents: tenant.cold_rent_cents,
          additional_costs_cents: tenant.additional_costs_cents,
          lease_start: tenant.lease_start,
        },
        adjustments,
        monthFirst,
      );
      const sollCents = eff.cold_rent_cents + eff.additional_costs_cents;
      if (sollCents <= 0) continue;

      const istCents = paymentsByTenantMonth.get(tenant.id)?.get(month) ?? 0;
      if (istCents >= sollCents) continue;

      const arrearAmount = sollCents - istCents;
      const daysOverdue = daysBetween(monthFirst, input.asOfDate);
      const level = levelForOverdue(daysOverdue, thresholds);
      if (level === null) continue;

      const existingLevels = existingMonths?.get(month) ?? new Set<number>();
      // Nur Eskalation aufwärts: wenn bereits gleiches oder höheres Level
      // existiert → skip.
      const maxExisting = existingLevels.size
        ? Math.max(...existingLevels)
        : -1;
      if (level <= maxExisting) {
        skipped.push({
          tenant_id: tenant.id,
          arrear_month: month,
          level,
          reason:
            level === maxExisting
              ? "already_emitted_same_level"
              : "already_emitted_higher_level",
        });
        continue;
      }

      eventsToCreate.push({
        tenant_id: tenant.id,
        property_id: tenant.property_id,
        arrear_month: month,
        arrear_amount_cents: arrearAmount,
        level,
        reason: levelReason(level, daysOverdue),
      });
    }
  }

  // Deterministisch sortieren (tenant_id, arrear_month, level)
  eventsToCreate.sort((a, b) => {
    if (a.tenant_id !== b.tenant_id) return a.tenant_id < b.tenant_id ? -1 : 1;
    if (a.arrear_month !== b.arrear_month)
      return a.arrear_month < b.arrear_month ? -1 : 1;
    return a.level - b.level;
  });

  return { events_to_create: eventsToCreate, skipped };
}

function levelReason(level: ArrearsLevel, daysOverdue: number): string {
  switch (level) {
    case 0:
      return `reminder (${daysOverdue}d overdue)`;
    case 1:
      return `mahnung_1 (${daysOverdue}d overdue)`;
    case 2:
      return `mahnung_2 (${daysOverdue}d overdue)`;
    case 3:
      return `mahnung_3_letztmalig (${daysOverdue}d overdue)`;
  }
}
