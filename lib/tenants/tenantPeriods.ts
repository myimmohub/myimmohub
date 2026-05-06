/**
 * Pure Function für aktive Mieter-Segmente in einer Periode.
 *
 * Wird von `lib/nka/distribute.ts` und Tax-Pipelines verwendet, um
 * pro-rata Mieterwechsel sauber zu unterstützen.
 *
 * Inklusiv: Ein Mieter ist „aktiv in der Periode", wenn
 *   lease_start <= periodEnd  UND  (lease_end == null || lease_end >= periodStart).
 *
 * `start` / `end` sind die Schnittpunkte mit der Periode (clamp).
 * `days` ist die inklusive Tagesanzahl.
 */

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function assertIso(value: string, name: string) {
  if (!ISO_DATE_RE.test(value)) {
    throw new Error(`${name} muss ISO YYYY-MM-DD sein, war: ${value}`);
  }
}

function parseIso(iso: string): number {
  assertIso(iso, "iso");
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function isoFromMs(ms: number): string {
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export type TenantSegment = {
  tenant_id: string;
  unit_id: string;
  start: string; // ISO, max(lease_start, periodStart)
  end: string; // ISO, min(lease_end ?? periodEnd, periodEnd)
  days: number; // inklusiv
};

export type TenantPeriodsTenantInput = {
  id: string;
  unit_id: string;
  lease_start: string;
  lease_end: string | null;
  status: "active" | "notice_given" | "ended";
};

export function getActiveTenantSegments(args: {
  tenants: TenantPeriodsTenantInput[];
  unitId?: string;
  periodStart: string;
  periodEnd: string;
}): TenantSegment[] {
  assertIso(args.periodStart, "periodStart");
  assertIso(args.periodEnd, "periodEnd");
  const periodStartMs = parseIso(args.periodStart);
  const periodEndMs = parseIso(args.periodEnd);
  if (periodEndMs < periodStartMs) {
    throw new Error(
      `periodEnd (${args.periodEnd}) liegt vor periodStart (${args.periodStart}).`,
    );
  }

  const out: TenantSegment[] = [];
  for (const t of args.tenants) {
    if (args.unitId && t.unit_id !== args.unitId) continue;
    assertIso(t.lease_start, "tenant.lease_start");
    if (t.lease_end != null) assertIso(t.lease_end, "tenant.lease_end");

    const leaseStartMs = parseIso(t.lease_start);
    const leaseEndMs = t.lease_end == null ? periodEndMs : parseIso(t.lease_end);

    // Inklusiv-Filter
    if (leaseStartMs > periodEndMs) continue;
    if (leaseEndMs < periodStartMs) continue;

    const startMs = Math.max(periodStartMs, leaseStartMs);
    const endMs = Math.min(periodEndMs, leaseEndMs);
    const days = Math.round((endMs - startMs) / MS_PER_DAY) + 1;

    out.push({
      tenant_id: t.id,
      unit_id: t.unit_id,
      start: isoFromMs(startMs),
      end: isoFromMs(endMs),
      days,
    });
  }

  // Determinismus: stabile Reihenfolge (unit_id, start, tenant_id)
  out.sort((a, b) => {
    if (a.unit_id !== b.unit_id) return a.unit_id < b.unit_id ? -1 : 1;
    if (a.start !== b.start) return a.start < b.start ? -1 : 1;
    return a.tenant_id < b.tenant_id ? -1 : a.tenant_id > b.tenant_id ? 1 : 0;
  });
  return out;
}
