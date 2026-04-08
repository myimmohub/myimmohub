"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { TaxData } from "@/types/tax";

type Property = { id: string; name: string; address: string | null };

const fmtEur = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function TaxOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [entries, setEntries] = useState<TaxData[]>([]);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prop }, taxRes] = await Promise.all([
        supabase.from("properties").select("id, name, address").eq("id", id).eq("user_id", user.id).single(),
        fetch(`/api/tax?property_id=${id}`),
      ]);

      setProperty(prop as Property | null);
      if (taxRes.ok) setEntries(await taxRes.json());
      setLoading(false);
    };
    void load();
  }, [id]);

  const handleCalculate = async (year: number) => {
    setCalculating(true);
    const res = await fetch("/api/tax/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: id, tax_year: year }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.tax_year === year);
        if (idx >= 0) return [...prev.slice(0, idx), updated, ...prev.slice(idx + 1)];
        return [updated, ...prev].sort((a, b) => b.tax_year - a.tax_year);
      });
    }
    setCalculating(false);
  };

  const currentYear = new Date().getFullYear();
  const existingYears = new Set(entries.map((e) => e.tax_year));

  if (loading) return <Skeleton />;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        {/* Header */}
        <div>
          <nav className="mb-4 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Link href="/dashboard" className="hover:text-slate-900 dark:hover:text-slate-100">Dashboard</Link>
            <span>/</span>
            <Link href={`/dashboard/properties/${id}/overview`} className="hover:text-slate-900 dark:hover:text-slate-100">
              {property?.name ?? "Immobilie"}
            </Link>
            <span>/</span>
            <span className="text-slate-900 dark:text-slate-100">Steuerdaten</span>
          </nav>
          <div className="flex items-end justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Steuererklärung (Anlage V)
              </h1>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {property?.name}{property?.address ? ` · ${property.address}` : ""}
              </p>
            </div>
            <Link
              href={`/dashboard/properties/${id}/tax/import`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              PDF importieren
            </Link>
          </div>
        </div>

        {/* Quick-Calculate for current/last year */}
        {!existingYears.has(currentYear - 1) && (
          <button
            type="button"
            onClick={() => void handleCalculate(currentYear - 1)}
            disabled={calculating}
            className="w-full rounded-xl border-2 border-dashed border-slate-300 bg-white p-6 text-center transition hover:border-blue-400 hover:bg-blue-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-blue-600"
          >
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {calculating ? "Berechne…" : `Steuerjahr ${currentYear - 1} aus Transaktionen berechnen`}
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Werte werden automatisch aus kategorisierten Buchungen ermittelt
            </p>
          </button>
        )}

        {/* Entries */}
        {entries.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Noch keine Steuerdaten vorhanden
            </p>
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Lade einen Steuerbescheid als PDF hoch oder berechne die Werte aus Transaktionen.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {entries.map((entry) => {
              const einnahmen = (entry.rent_income ?? 0) + (entry.operating_costs_income ?? 0) + (entry.other_income ?? 0) + (entry.deposits_received ?? 0);
              const wk = (entry.loan_interest ?? 0) + (entry.property_tax ?? 0) + (entry.hoa_fees ?? 0) + (entry.insurance ?? 0) + (entry.maintenance_costs ?? 0) + (entry.property_management ?? 0) + (entry.bank_fees ?? 0) + (entry.other_expenses ?? 0) + (entry.water_sewage ?? 0) + (entry.waste_disposal ?? 0);
              const afa = (entry.depreciation_building ?? 0) + (entry.depreciation_outdoor ?? 0) + (entry.depreciation_fixtures ?? 0);
              const ergebnis = einnahmen - wk - afa;

              const sourceLabel = entry.import_source === "pdf_import" ? "PDF-Import"
                : entry.import_source === "calculated" ? "Berechnet"
                : entry.import_source === "manual" ? "Manuell" : "—";

              return (
                <Link
                  key={entry.id}
                  href={`/dashboard/properties/${id}/tax/${entry.tax_year}`}
                  className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-5 py-4 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
                >
                  <div>
                    <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{entry.tax_year}</p>
                    <div className="mt-1 flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                      <span>Einnahmen: {fmtEur(einnahmen)}</span>
                      <span>WK: {fmtEur(wk)}</span>
                      <span>AfA: {fmtEur(afa)}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold tabular-nums ${ergebnis < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}`}>
                      {fmtEur(ergebnis)}
                    </p>
                    <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {sourceLabel}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}

function Skeleton() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        {[1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
      </section>
    </main>
  );
}
