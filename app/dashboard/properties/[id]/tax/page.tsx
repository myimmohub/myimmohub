"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { calculateTaxTotals } from "@/lib/tax/gbrTaxReport";
import type { TaxData } from "@/types/tax";

type Property = { id: string; name: string; address: string | null };
type GbrSettingsSummary = { id?: string; feststellungserklaerung: boolean; gbr_partner: { id: string; anteil: number }[] };

const fmtEur = (n: number | null) =>
  n == null ? "—" : n.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export default function TaxOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [entries, setEntries] = useState<TaxData[]>([]);
  const [gbrSettings, setGbrSettings] = useState<GbrSettingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [calculating, setCalculating] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prop }, taxRes, gbrRes] = await Promise.all([
        supabase.from("properties").select("id, name, address").eq("id", id).eq("user_id", user.id).single(),
        fetch(`/api/tax?property_id=${id}`),
        fetch(`/api/settings/gbr?property_id=${id}`),
      ]);

      setProperty(prop as Property | null);
      if (taxRes.ok) setEntries(await taxRes.json());
      if (gbrRes.ok) {
        const gbr = await gbrRes.json() as GbrSettingsSummary;
        if (gbr.id) setGbrSettings(gbr);
      }
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

  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async (entryId: string) => {
    setDeleting(true);
    const res = await fetch(`/api/tax/${entryId}`, { method: "DELETE" });
    if (res.ok) {
      setEntries((prev) => prev.filter((e) => e.id !== entryId));
    }
    setDeleting(false);
    setDeleteConfirm(null);
  };

  const currentYear = new Date().getFullYear();
  const existingYears = new Set(entries.map((e) => e.tax_year));
  const availableYears = Array.from({ length: 10 }, (_, i) => currentYear - 1 - i).filter((y) => !existingYears.has(y));
  const [calcYear, setCalcYear] = useState<number>(availableYears[0] ?? currentYear - 1);

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
                Steuererklärung {gbrSettings ? "(Anlage V + FE/FB)" : "(Anlage V)"}
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

        {/* Calculate from transactions */}
        {availableYears.length > 0 && (
          <div className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-5 transition dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Steuerjahr aus Transaktionen berechnen
            </p>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              Werte werden automatisch aus kategorisierten Buchungen ermittelt
            </p>
            <div className="mt-3 flex items-center gap-3">
              <select
                value={calcYear}
                onChange={(e) => setCalcYear(Number(e.target.value))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
              >
                {availableYears.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => void handleCalculate(calcYear)}
                disabled={calculating}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {calculating ? "Berechne…" : "Berechnen"}
              </button>
            </div>
          </div>
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
              const totals = calculateTaxTotals(entry);
              const einnahmen = totals.totalIncome;
              const wk = totals.totalExpenses;
              const afa = totals.depreciationTotal;
              const ergebnis = totals.result;

              const sourceLabel = entry.import_source === "pdf_import" ? "PDF-Import"
                : entry.import_source === "calculated" ? "Berechnet"
                : entry.import_source === "manual" ? "Manuell" : "—";

              return (
                <div key={entry.id} className="rounded-xl border border-slate-200 bg-white transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700">
                  <div className="flex items-center justify-between px-5 py-4">
                    <Link href={`/dashboard/properties/${id}/tax/${entry.tax_year}`} className="flex-1">
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{entry.tax_year}</p>
                      <div className="mt-1 flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>Einnahmen: {fmtEur(einnahmen)}</span>
                        <span>WK: {fmtEur(wk)}</span>
                        <span>AfA: {fmtEur(afa)}</span>
                        {gbrSettings && <span>FE/FB bereit</span>}
                      </div>
                    </Link>
                    <div className="flex items-center gap-3">
                      {gbrSettings && (
                        <Link
                          href={`/dashboard/properties/${id}/tax/${entry.tax_year}/gbr`}
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                        >
                          FE/FB
                        </Link>
                      )}
                      <div className="text-right">
                        <p className={`text-sm font-semibold tabular-nums ${ergebnis < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}`}>
                          {fmtEur(ergebnis)}
                        </p>
                        <span className="mt-0.5 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                          {sourceLabel}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); setDeleteConfirm(entry.id); }}
                        className="rounded-lg p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                        title="Löschen"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                          <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022.841 10.518A2.75 2.75 0 007.596 19h4.807a2.75 2.75 0 002.742-2.53l.841-10.52.149.023a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 00-1.5.06l.3 7.5a.75.75 0 101.5-.06l-.3-7.5zm4.34.06a.75.75 0 10-1.5-.06l-.3 7.5a.75.75 0 101.5.06l.3-7.5z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Steuerdaten löschen?</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Alle Daten für dieses Steuerjahr werden unwiderruflich gelöscht.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete(deleteConfirm)}
                  disabled={deleting}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Lösche…" : "Endgültig löschen"}
                </button>
              </div>
            </div>
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
