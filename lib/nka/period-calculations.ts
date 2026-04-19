import type {
  NkaCostItem,
  NkaPeriod,
  NkaPropertySummary,
  NkaTenantShare,
  NkaTenantSummary,
  NkaUmlageschluessel,
} from "@/types/nka";

const DAY_MS = 24 * 60 * 60 * 1000;

// Parse at UTC noon so day-diff math is not affected by local DST transitions.
function asDate(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

function formatLocalDate(date: Date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function daysInclusive(start: Date, end: Date) {
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / DAY_MS) + 1);
}

function overlapDays(periodFrom: string, periodTo: string, leaseStart: string, leaseEnd?: string | null) {
  const periodStart = asDate(periodFrom);
  const periodEnd = asDate(periodTo);
  const tenantStart = asDate(leaseStart);
  const tenantEnd = asDate(leaseEnd ?? periodTo);

  const start = periodStart > tenantStart ? periodStart : tenantStart;
  const end = periodEnd < tenantEnd ? periodEnd : tenantEnd;
  if (start > end) return null;

  return {
    bewohnt_von: formatLocalDate(start),
    bewohnt_bis: formatLocalDate(end),
    tage_anteil: daysInclusive(start, end),
  };
}

function defaultShareKey(item: NkaCostItem): NkaUmlageschluessel {
  return item.umlageschluessel ?? "wohnflaeche";
}

function monthlyAdvanceForDays(additionalCostsCents: number | null | undefined, days: number) {
  const monthly = Math.max(0, Number(additionalCostsCents ?? 0)) / 100;
  return round2(monthly * (days / 30.4167));
}

export function computeTenantShares(args: {
  period: Pick<NkaPeriod, "id" | "zeitraum_von" | "zeitraum_bis">;
  property: Pick<NkaPropertySummary, "wohnflaeche_gesamt_m2" | "anzahl_einheiten">;
  tenants: NkaTenantSummary[];
  costItems: NkaCostItem[];
  actualAdvancesByTenant?: Record<string, number>;
}): Array<Omit<NkaTenantShare, "id" | "created_at">> {
  const { period, property, tenants, costItems, actualAdvancesByTenant } = args;
  const periodDays = daysInclusive(asDate(period.zeitraum_von), asDate(period.zeitraum_bis));
  const totalArea = Math.max(
    Number(property.wohnflaeche_gesamt_m2 ?? 0),
    tenants.reduce((sum, tenant) => sum + Number(tenant.anteil_wohnflaeche_m2 ?? tenant.unit?.area_sqm ?? 0), 0),
  );
  const totalPersons = Math.max(1, tenants.reduce((sum, tenant) => sum + Math.max(1, Number(tenant.personen_anzahl ?? 1)), 0));
  const totalUnits = Math.max(1, Number((property.anzahl_einheiten ?? tenants.length) || 1));

  const relevantTenants = tenants
    .map((tenant) => {
      const overlap = overlapDays(period.zeitraum_von, period.zeitraum_bis, tenant.lease_start, tenant.lease_end);
      if (!overlap) return null;
      return {
        tenant,
        ...overlap,
      };
    })
    .filter((value): value is NonNullable<typeof value> => Boolean(value));

  return relevantTenants.map(({ tenant, bewohnt_von, bewohnt_bis, tage_anteil }) => {
    const area = Number(tenant.anteil_wohnflaeche_m2 ?? tenant.unit?.area_sqm ?? 0);
    const persons = Math.max(1, Number(tenant.personen_anzahl ?? 1));

    const summeAnteile = costItems
      .filter((item) => item.ist_umlagefaehig)
      .reduce((sum, item) => {
        const timeShare = tage_anteil / periodDays;
        const gross = Number(item.betrag_brutto ?? 0);
        if (gross <= 0) return sum;

        const key = defaultShareKey(item);
        let baseShare = 0;
        if (key === "wohnflaeche") baseShare = totalArea > 0 ? area / totalArea : 0;
        else if (key === "personen") baseShare = persons / totalPersons;
        else if (key === "einheiten") baseShare = 1 / totalUnits;
        else baseShare = totalArea > 0 ? area / totalArea : 1 / Math.max(1, relevantTenants.length);

        return sum + gross * baseShare * timeShare;
      }, 0);

    return {
      nka_periode_id: period.id,
      mieter_id: tenant.id,
      mietvertrag_id: tenant.id,
      bewohnt_von,
      bewohnt_bis,
      tage_anteil,
      personen_anzahl: persons,
      anteil_wohnflaeche_m2: area || null,
      summe_anteile: round2(summeAnteile),
      summe_vorauszahlungen: round2(actualAdvancesByTenant?.[tenant.id] ?? monthlyAdvanceForDays(tenant.additional_costs_cents, tage_anteil)),
      anpassung_vorauszahlung_neu: null,
      faelligkeit_nachzahlung: null,
      versandt_an_email: tenant.email ?? null,
      versandt_am: null,
      postmark_message_id: null,
    };
  });
}

export function summarizePeriod(costItems: NkaCostItem[]) {
  const umlagefaehig = round2(costItems.filter((item) => item.ist_umlagefaehig).reduce((sum, item) => sum + Number(item.betrag_brutto ?? 0), 0));
  const nichtUmlagefaehig = round2(costItems.filter((item) => !item.ist_umlagefaehig).reduce((sum, item) => sum + Number(item.betrag_brutto ?? 0), 0));
  return {
    gesamtkosten_umlagefaehig: umlagefaehig,
    gesamtkosten_nicht_umlagefaehig: nichtUmlagefaehig,
  };
}

export function determineDeadlineStatus(period: Pick<NkaPeriod, "status" | "deadline_abrechnung">) {
  if (!period.deadline_abrechnung) return "neutral";
  const today = new Date();
  const deadline = asDate(period.deadline_abrechnung);
  const diffDays = Math.floor((deadline.getTime() - today.getTime()) / DAY_MS);
  if (period.status === "abgeschlossen") return "done";
  if (diffDays < 0) return "critical";
  if (diffDays <= 30) return "warning";
  if (diffDays <= 90) return "attention";
  return "ok";
}
