"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyDetail = {
  id: string;
  name: string;
  address: string | null;
  type: string | null;
};

type UnitRow = {
  id: string;
  label: string;
  area_sqm?: number | null;
  active_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    additional_costs_cents?: number | null;
  } | null;
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
  tenant_id: string | null;
  unit_id: string | null;
  period_month?: string | null;
};

type StepState = "missing" | "partial" | "ready";

type FlowStep = {
  key: string;
  title: string;
  description: string;
  state: StepState;
  href: string;
  cta: string;
  detail: string;
};

const STATUS_STYLE: Record<StepState, string> = {
  missing:
    "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  partial:
    "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  ready:
    "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
};

const STATUS_LABEL: Record<StepState, string> = {
  missing: "Fehlt",
  partial: "Teilweise",
  ready: "Bereit",
};

export default function PropertyNebenkostenPage() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [units, setUnits] = useState<UnitRow[]>([]);
  const [tenants, setTenants] = useState<TenantRow[]>([]);
  const [paymentMatches, setPaymentMatches] = useState<PaymentMatchRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear() - 1);

  useEffect(() => {
    const loadFlowData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: propertyError } = await supabase
          .from("properties")
          .select("id, name, address, type")
          .eq("id", id)
          .single();

        if (propertyError) {
          throw new Error(propertyError.message);
        }

        setProperty(data as PropertyDetail);

        const [unitsRes, tenantsRes, matchesRes] = await Promise.all([
          fetch(`/api/units?property_id=${id}`),
          fetch(`/api/tenants?property_id=${id}`),
          fetch(`/api/payment-matches?property_id=${id}`),
        ]);

        const [unitsJson, tenantsJson, matchesJson] = await Promise.all([
          unitsRes.json(),
          tenantsRes.json(),
          matchesRes.json(),
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

        setUnits((unitsJson ?? []) as UnitRow[]);
        setTenants((tenantsJson ?? []) as TenantRow[]);
        setPaymentMatches((matchesJson ?? []) as PaymentMatchRow[]);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Nebenkosten-Workflow konnte nicht geladen werden.",
        );
      } finally {
        setIsLoading(false);
      }
    };

    void loadFlowData();
  }, [id]);

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

  const tenantsWithReference = useMemo(
    () => activeTenants.filter((tenant) => (tenant.payment_reference ?? "").trim().length > 0),
    [activeTenants],
  );

  const matchedPayments = useMemo(
    () =>
      paymentMatches.filter(
        (match) => match.status === "confirmed" || match.status === "auto_matched",
      ),
    [paymentMatches],
  );

  const suggestedPayments = useMemo(
    () => paymentMatches.filter((match) => match.status === "suggested"),
    [paymentMatches],
  );

  const matchedPaymentsForSelectedYear = useMemo(
    () =>
      matchedPayments.filter((match) =>
        (match.period_month ?? "").startsWith(`${selectedYear}-`),
      ),
    [matchedPayments, selectedYear],
  );

  const suggestedPaymentsForSelectedYear = useMemo(
    () =>
      suggestedPayments.filter((match) =>
        (match.period_month ?? "").startsWith(`${selectedYear}-`),
      ),
    [selectedYear, suggestedPayments],
  );

  const availableYears = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => currentYear - 4 + index).reverse();
  }, []);

  const flowSteps = useMemo<FlowStep[]>(() => {
    const unitState: StepState =
      units.length === 0 ? "missing" : unitsWithArea.length === units.length ? "ready" : "partial";

    const tenantState: StepState =
      activeTenants.length === 0
        ? "missing"
        : tenantsWithAdvance.length === activeTenants.length &&
            tenantsWithReference.length === activeTenants.length
          ? "ready"
          : "partial";

    const paymentTargetCount = Math.max(activeTenants.length, 1);
    const paymentState: StepState =
      matchedPaymentsForSelectedYear.length === 0
        ? "missing"
        : matchedPaymentsForSelectedYear.length >= paymentTargetCount
          ? "ready"
          : "partial";

    return [
      {
        key: "units",
        title: "Einheiten und Flächen",
        description: "Wohnflächen und Einheiten sind die Grundlage für die Verteilung.",
        state: unitState,
        href: `/dashboard/properties/${id}/units`,
        cta: units.length === 0 ? "Einheiten anlegen" : "Einheiten prüfen",
        detail:
          units.length === 0
            ? "Noch keine Einheit vorhanden."
            : `${unitsWithArea.length} von ${units.length} Einheiten haben eine gepflegte Wohnfläche.`,
      },
      {
        key: "tenants",
        title: "Mieter und Vorauszahlungen",
        description: "Aktive Mietverhältnisse, Nebenkostenvorauszahlungen und Referenzen sollten stimmen.",
        state: tenantState,
        href: `/dashboard/properties/${id}/tenants`,
        cta: activeTenants.length === 0 ? "Mieter anlegen" : "Mieter prüfen",
        detail:
          activeTenants.length === 0
            ? "Noch kein aktives Mietverhältnis vorhanden."
            : `${tenantsWithAdvance.length} von ${activeTenants.length} aktiven Mietern haben Nebenkostenvorauszahlungen, ${tenantsWithReference.length} von ${activeTenants.length} eine Zahlungsreferenz.`,
      },
      {
        key: "payments",
        title: "Zahlungen zuordnen",
        description: "Zahlungseingänge sollten den richtigen Mietern und Monaten zugeordnet sein.",
        state: paymentState,
        href: `/dashboard/properties/${id}/payments`,
        cta:
          matchedPaymentsForSelectedYear.length === 0
            ? "Zahlungen zuordnen"
            : suggestedPaymentsForSelectedYear.length > 0
              ? "Vorschläge prüfen"
              : "Zahlungen prüfen",
        detail:
          matchedPaymentsForSelectedYear.length === 0
            ? `Für ${selectedYear} gibt es noch keine bestätigten oder automatisch erkannten Zuordnungen.`
            : `${matchedPaymentsForSelectedYear.length} Zahlungen sind für ${selectedYear} zugeordnet, ${suggestedPaymentsForSelectedYear.length} Vorschläge warten noch auf Prüfung.`,
      },
    ];
  }, [
    activeTenants.length,
    id,
    matchedPaymentsForSelectedYear.length,
    selectedYear,
    suggestedPaymentsForSelectedYear.length,
    tenantsWithAdvance.length,
    tenantsWithReference.length,
    units.length,
    unitsWithArea.length,
  ]);

  const nextStep = flowSteps.find((step) => step.state !== "ready") ?? flowSteps[2];
  const readySteps = flowSteps.filter((step) => step.state === "ready").length;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-8 w-72 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-96 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="grid gap-4 md:grid-cols-3">
              {[1, 2, 3].map((item) => (
                <div
                  key={item}
                  className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800"
                />
              ))}
            </div>
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : (
          <>
            <header className="space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nebenkosten / {property?.name}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Nebenkosten vorbereiten
              </h1>
              <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                Hier siehst du den tatsächlichen Vorbereitungsstand für die
                Nebenkostenabrechnung. Wir führen dich immer zuerst in den
                Bereich, der als Nächstes Aufmerksamkeit braucht.
              </p>
            </header>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-2">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Abrechnungsjahr wählen
                  </h2>
                  <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                    Wähle das Jahr aus, für das du die Nebenkostenabrechnung
                    vorbereiten oder erzeugen möchtest. Der Flow und die
                    Zahlungsprüfung richten sich dann auf genau dieses Jahr aus.
                  </p>
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <select
                    value={selectedYear}
                    onChange={(event) => setSelectedYear(Number(event.target.value))}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  >
                    {availableYears.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>

                  <Link
                    href={`/dashboard/properties/${id}/nka/${selectedYear}`}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    Abrechnung erzeugen
                  </Link>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-2">
                  <span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                    {readySteps} von {flowSteps.length} Schritten bereit
                  </span>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Nächster sinnvoller Schritt: {nextStep.title}
                  </h2>
                  <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                    {nextStep.detail}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Link
                    href={nextStep.href}
                    className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                  >
                    {nextStep.cta}
                  </Link>
                  <Link
                    href="/dashboard/nka"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Zur Objektübersicht
                  </Link>
                </div>
              </div>
            </section>

            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard
                label="Einheiten"
                value={units.length.toString()}
                helper={`${unitsWithArea.length} mit Wohnfläche`}
              />
              <MetricCard
                label="Aktive Mieter"
                value={activeTenants.length.toString()}
                helper={`${tenantsWithAdvance.length} mit NK-Vorauszahlung`}
              />
              <MetricCard
                label={`Zuordnungen ${selectedYear}`}
                value={matchedPaymentsForSelectedYear.length.toString()}
                helper={`${suggestedPaymentsForSelectedYear.length} offene Vorschläge`}
              />
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Vorbereitungsschritte
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Das ist der eigentliche Nebenkosten-Flow. Die Abrechnung ist
                  erst dann sinnvoll, wenn diese drei Punkte sauber vorbereitet
                  sind.
                </p>
              </div>

              <div className="mt-5 space-y-4">
                {flowSteps.map((step, index) => (
                  <div
                    key={step.key}
                    className="rounded-2xl border border-slate-200 p-5 dark:border-slate-800"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                            Schritt {index + 1}
                          </span>
                          <span
                            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_STYLE[step.state]}`}
                          >
                            {STATUS_LABEL[step.state]}
                          </span>
                        </div>
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                          {step.title}
                        </h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {step.description}
                        </p>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {step.detail}
                        </p>
                      </div>

                      <div className="shrink-0">
                        <Link
                          href={step.href}
                          className={`inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
                            step.key === nextStep.key
                              ? "bg-blue-600 text-white hover:bg-blue-700"
                              : "border border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          }`}
                        >
                          {step.cta}
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Was du hier sehen solltest
              </h2>
              <div className="mt-3 space-y-2 text-sm text-slate-500 dark:text-slate-400">
                <p>
                  1. Einen klaren Status, ob Einheiten, Mieter und Zahlungen
                  schon abrechnungsfähig vorbereitet sind.
                </p>
                <p>
                  2. Genau einen blauen Hauptbutton, der dich immer zum nächsten
                  offenen Schritt bringt statt im Kreis zu schicken.
                </p>
                <p>
                  3. Die anderen Bereiche nur noch als Nebenpfade, nicht mehr
                  als verwirrende Hauptnavigation innerhalb des Moduls.
                </p>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function MetricCard({
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
