"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyDetail = {
  id: string;
  name: string;
  address: string | null;
};

type UnitRow = {
  id: string;
  label: string;
  area_sqm?: number | null;
};

type TenantRow = {
  id: string;
  first_name: string;
  last_name: string;
  status: "active" | "notice_given" | "ended";
  additional_costs_cents: number;
  payment_reference?: string | null;
  unit?: {
    id: string;
    label: string;
  } | null;
};

type PaymentMatchRow = {
  id: string;
  status: "auto_matched" | "confirmed" | "suggested" | "rejected";
  period_month?: string | null;
  tenant_id: string | null;
  unit_id: string | null;
};

type NkaPeriodRow = {
  id: string;
  property_id: string;
  tax_year: number;
  period_start: string;
  period_end: string;
  status: "draft" | "distributed" | "sent" | "closed";
};

function formatEuro(cents: number) {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function startOfYear(year: number) {
  return `01.01.${year}`;
}

function endOfYear(year: number) {
  return `31.12.${year}`;
}

export default function PropertyNkaYearPage() {
  const { id, year } = useParams<{ id: string; year: string }>();
  const taxYear = Number(year);

  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [paymentMatches, setPaymentMatches] = useState<PaymentMatchRow[]>([]);
  const [period, setPeriod] = useState<NkaPeriodRow | null>(null);
  const [creatingPeriod, setCreatingPeriod] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadYearWorkspace = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: propertyError } = await supabase
          .from("properties")
          .select("id, name, address")
          .eq("id", id)
          .single();

        if (propertyError) {
          throw new Error(propertyError.message);
        }

        setProperty(data as PropertyDetail);

        const [unitsRes, tenantsRes, matchesRes, periodsRes] = await Promise.all([
          fetch(`/api/units?property_id=${id}`),
          fetch(`/api/tenants?property_id=${id}`),
          fetch(`/api/payment-matches?property_id=${id}`),
          fetch(`/api/nka/periods?property_id=${id}`),
        ]);

        const [unitsJson, tenantsJson, matchesJson, periodsJson] = await Promise.all([
          unitsRes.json(),
          tenantsRes.json(),
          matchesRes.json(),
          periodsRes.json(),
        ]);

        if (!unitsRes.ok) {
          throw new Error(unitsJson.error ?? "Einheiten konnten nicht geladen werden.");
        }
        if (!tenantsRes.ok) {
          throw new Error(tenantsJson.error ?? "Mieter konnten nicht geladen werden.");
        }
        if (!matchesRes.ok) {
          throw new Error(matchesJson.error ?? "Zahlungszuordnungen konnten nicht geladen werden.");
        }
        if (!periodsRes.ok) {
          // Periode-Load-Fehler ist nicht-blockierend; Status-Seite weiterhin
          // anzeigen, "Periode anlegen"-Button bleibt verborgen.
          console.warn("[nka year]", periodsJson?.error ?? "Perioden konnten nicht geladen werden.");
        }

        setUnits((unitsJson ?? []) as UnitRow[]);
        setTenants((tenantsJson ?? []) as TenantRow[]);
        setPaymentMatches((matchesJson ?? []) as PaymentMatchRow[]);
        const matchedPeriod = ((periodsJson ?? []) as NkaPeriodRow[]).find(
          (p) => Number(p.tax_year) === taxYear,
        );
        setPeriod(matchedPeriod ?? null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Die Nebenkostenabrechnung konnte nicht geladen werden.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadYearWorkspace();
  }, [id, taxYear]);

  const createPeriod = async () => {
    setCreatingPeriod(true);
    setError(null);
    try {
      const res = await fetch("/api/nka/periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: id,
          tax_year: taxYear,
          period_start: `${taxYear}-01-01`,
          period_end: `${taxYear}-12-31`,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.error ?? "Periode konnte nicht angelegt werden.");
      }
      setPeriod(json as NkaPeriodRow);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Periode konnte nicht angelegt werden.");
    } finally {
      setCreatingPeriod(false);
    }
  };

  const activeTenants = useMemo(
    () => tenants.filter((tenant) => tenant.status === "active" || tenant.status === "notice_given"),
    [tenants],
  );

  const unitsWithArea = useMemo(
    () => units.filter((unit) => typeof unit.area_sqm === "number" && unit.area_sqm > 0),
    [units],
  );

  const tenantsWithAdvance = useMemo(
    () => activeTenants.filter((tenant) => Number(tenant.additional_costs_cents) > 0),
    [activeTenants],
  );

  const matchedPaymentsForYear = useMemo(
    () =>
      paymentMatches.filter(
        (match) =>
          (match.status === "confirmed" || match.status === "auto_matched") &&
          (match.period_month ?? "").startsWith(`${taxYear}-`),
      ),
    [paymentMatches, taxYear],
  );

  const suggestedPaymentsForYear = useMemo(
    () =>
      paymentMatches.filter(
        (match) =>
          match.status === "suggested" &&
          (match.period_month ?? "").startsWith(`${taxYear}-`),
      ),
    [paymentMatches, taxYear],
  );

  const monthlyAdvanceTotal = useMemo(
    () => activeTenants.reduce((sum, tenant) => sum + Number(tenant.additional_costs_cents || 0), 0),
    [activeTenants],
  );

  const yearlyAdvanceTarget = monthlyAdvanceTotal * 12;

  const blockers = useMemo(() => {
    const items: Array<{ title: string; href: string }> = [];

    if (units.length === 0 || unitsWithArea.length !== units.length) {
      items.push({
        title: "Einheiten oder Wohnflächen sind noch unvollständig.",
        href: `/dashboard/properties/${id}/units`,
      });
    }

    if (activeTenants.length === 0 || tenantsWithAdvance.length !== activeTenants.length) {
      items.push({
        title: "Bei Mietern fehlen aktive Verträge oder Nebenkostenvorauszahlungen.",
        href: `/dashboard/properties/${id}/tenants`,
      });
    }

    if (matchedPaymentsForYear.length === 0) {
      items.push({
        title: `Für ${taxYear} gibt es noch keine bestätigten Zahlungszuordnungen.`,
        href: `/dashboard/properties/${id}/payments`,
      });
    }

    return items;
  }, [
    activeTenants.length,
    id,
    matchedPaymentsForYear.length,
    taxYear,
    tenantsWithAdvance.length,
    units.length,
    unitsWithArea.length,
  ]);

  const isReady = blockers.length === 0;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-8 w-72 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-96 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : (
          <>
            <header className="space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nebenkosten / {property?.name} / {taxYear}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Nebenkostenabrechnung {taxYear}
              </h1>
              <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                Das ist dein jahresbezogener Arbeitsstand für die
                Nebenkostenabrechnung. Hier siehst du, ob die Vorbedingungen für
                den Zeitraum bereits belastbar genug sind.
              </p>
            </header>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                      isReady
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                        : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                    }`}
                  >
                    {isReady ? "Bereit zur Abrechnung" : "Vorbereitung noch offen"}
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Abrechnungszeitraum {startOfYear(taxYear)} bis {endOfYear(taxYear)}
                  </h2>
                  <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                    {isReady
                      ? "Die wichtigsten Grundlagen sind vorhanden. Du kannst jetzt mit der eigentlichen Abrechnung weiterarbeiten."
                      : "Bevor die Abrechnung fachlich belastbar ist, sollten die offenen Punkte unten noch sauber vorbereitet werden."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  {period ? (
                    <Link
                      href={`/dashboard/properties/${id}/nka/${taxYear}/edit`}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      Editor öffnen
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={createPeriod}
                      disabled={creatingPeriod}
                      className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                    >
                      {creatingPeriod ? "Lege an…" : "Periode anlegen"}
                    </button>
                  )}
                  <Link
                    href={`/dashboard/properties/${id}/nka`}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Zum Flow zurück
                  </Link>
                </div>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-4">
              <YearMetricCard label="Einheiten" value={units.length.toString()} helper={`${unitsWithArea.length} mit Fläche`} />
              <YearMetricCard label="Aktive Mieter" value={activeTenants.length.toString()} helper={`${tenantsWithAdvance.length} mit NK-Vorauszahlung`} />
              <YearMetricCard label={`Zahlungen ${taxYear}`} value={matchedPaymentsForYear.length.toString()} helper={`${suggestedPaymentsForYear.length} Vorschläge offen`} />
              <YearMetricCard label="Vorauszahlungen Soll" value={formatEuro(yearlyAdvanceTarget)} helper={`${formatEuro(monthlyAdvanceTotal)} pro Monat`} />
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Offene Punkte vor der Abrechnung
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Diese Seite soll nicht in andere Bereiche wegwerfen, sondern
                  klar zeigen, was für {taxYear} noch fehlt.
                </p>
              </div>

              {blockers.length === 0 ? (
                <div className="mt-5 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
                  Für {taxYear} sind die wichtigsten Vorbedingungen vorhanden:
                  Einheiten, Mieter/Vorauszahlungen und Zahlungszuordnungen sind
                  aus Sicht des aktuellen Flows bereit.
                </div>
              ) : (
                <div className="mt-5 space-y-3">
                  {blockers.map((blocker) => (
                    <div
                      key={blocker.title}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800 md:flex-row md:items-center md:justify-between"
                    >
                      <p className="text-sm text-slate-600 dark:text-slate-300">
                        {blocker.title}
                      </p>
                      <Link
                        href={blocker.href}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Öffnen
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Was du hier jetzt sehen solltest
              </h2>
              <div className="mt-3 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                <p>1. Ein klar ausgewähltes Abrechnungsjahr.</p>
                <p>2. Einen belastbaren Status, ob die Abrechnung für dieses Jahr vorbereitet ist.</p>
                <p>3. Eine Jahresansicht, die nicht zurück auf dieselbe Seite springt, sondern dir den Arbeitsstand für genau dieses Jahr zeigt.</p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function YearMetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {helper}
      </div>
    </div>
  );
}
