"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { ANLAGE_V_CATEGORY_LABELS, type AnlageVCategory } from "@/lib/banking/categorizeTransaction";
import {
  loadCategoryLookup,
  getCategoryVariant as getCategoryVariantFromLookup,
  type CategoryLookup,
  type BadgeVariant,
} from "@/lib/banking/categoryLookup";

// ── Typen ─────────────────────────────────────────────────────────────────────

type Transaction = {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  counterpart: string | null;
  category: string | null;
  is_confirmed: boolean;
  is_tax_deductible: boolean | null;
  anlage_v_zeile: number | null;
  property_id: string | null;
  property?: { name: string } | null;
};

type Property = { id: string; name: string };

// ── Kategorie-Gruppen ─────────────────────────────────────────────────────────

const BADGE: Record<BadgeVariant, string> = {
  einnahmen:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  werbungskosten:  "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  nicht_absetzbar: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  unbekannt:       "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400",
};

// ── Formatierung ──────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

// ── Monatsliste aus Transaktionen ─────────────────────────────────────────────

function getMonthKey(iso: string) {
  return iso.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function BankingPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [properties, setProperties]     = useState<Property[]>([]);
  const [loading, setLoading]           = useState(true);
  const [catLookup, setCatLookup]       = useState<CategoryLookup | null>(null);

  // Filter-State
  const [filterMonth, setFilterMonth]       = useState<string>("");   // "YYYY-MM" oder ""
  const [filterCategory, setFilterCategory] = useState<string>("");
  const [filterProperty, setFilterProperty] = useState<string>("");
  const [search, setSearch]                 = useState<string>("");

  // ── Daten laden ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: txData }, { data: propData }] = await Promise.all([
        supabase
          .from("transactions")
          .select(
            "id, date, amount, description, counterpart, category, is_confirmed, " +
            "is_tax_deductible, anlage_v_zeile, property_id, property:properties(name)"
          )
          .eq("user_id", user.id)
          // Aufgeteilte Original-Transaktionen ausblenden (Kinder werden gezeigt)
          .or("category.is.null,category.neq.aufgeteilt")
          .order("date", { ascending: false })
          .limit(2000),
        supabase
          .from("properties")
          .select("id, name")
          .eq("user_id", user.id)
          .order("name"),
      ]);

      const txs = (txData as unknown as Transaction[]) ?? [];
      setTransactions(txs);
      setProperties(propData ?? []);

      // Kategorien aus DB laden
      try {
        const lookup = await loadCategoryLookup();
        setCatLookup(lookup);
      } catch { /* Fallback */ }

      // Standard: aktueller Monat vorauswählen
      const currentMonth = getMonthKey(new Date().toISOString());
      const hasCurrentMonth = txs.some((t) => getMonthKey(t.date) === currentMonth);
      if (hasCurrentMonth) setFilterMonth(currentMonth);
      else if (txs.length > 0) setFilterMonth(getMonthKey(txs[0].date));

      setLoading(false);
    };
    void load();
  }, []);

  // ── Verfügbare Monate (für Dropdown) ─────────────────────────────────────────
  const availableMonths = useMemo(() => {
    const keys = Array.from(new Set(transactions.map((t) => getMonthKey(t.date)))).sort(
      (a, b) => b.localeCompare(a),
    );
    return keys;
  }, [transactions]);

  // ── Kennzahlen: immer für den gewählten Monat ─────────────────────────────────
  const monthTxs = useMemo(() => {
    if (!filterMonth) return transactions;
    return transactions.filter((t) => getMonthKey(t.date) === filterMonth);
  }, [transactions, filterMonth]);

  const einnahmen  = useMemo(() => monthTxs.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0), [monthTxs]);
  const ausgaben   = useMemo(() => monthTxs.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0), [monthTxs]);
  const cashflow   = einnahmen + ausgaben;
  // "Offen" = keine Kategorie zugeordnet (unkategorisiert, braucht Aufmerksamkeit)
  // Bereits kategorisierte aber noch nicht manuell bestätigte Transaktionen
  // erscheinen nicht im Badge — sie sind inhaltlich verarbeitet.
  const openReview = useMemo(
    () => transactions.filter((t) => !t.category && t.category !== "aufgeteilt").length,
    [transactions],
  );

  // ── Gefilterte Transaktionen für Tabelle ─────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return transactions.filter((t) => {
      if (!t.category) return false; // unkategorisierte ausblenden
      if (filterMonth    && getMonthKey(t.date) !== filterMonth) return false;
      if (filterCategory && t.category !== filterCategory)        return false;
      if (filterProperty && t.property_id !== filterProperty)     return false;
      if (q) {
        const haystack = `${t.counterpart ?? ""} ${t.description ?? ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, filterMonth, filterCategory, filterProperty, search]);

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-6xl space-y-6">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Banking
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              Kategorisierte Transaktionen und Auswertung
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/dashboard/banking/review"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              {openReview > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-yellow-500 px-1 text-xs font-semibold text-white">
                  {openReview}
                </span>
              )}
              Transaktionen prüfen
            </Link>
            <Link
              href="/dashboard/banking/import"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              CSV importieren
            </Link>
          </div>
        </div>

        {/* ── Kennzahlen-Karten ─────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <KpiCard
            label="Einnahmen"
            sublabel={filterMonth ? monthLabel(filterMonth) : "Gesamt"}
            value={fmt(einnahmen)}
            valueClass="text-emerald-600 dark:text-emerald-400"
            loading={loading}
          />
          <KpiCard
            label="Ausgaben"
            sublabel={filterMonth ? monthLabel(filterMonth) : "Gesamt"}
            value={fmt(ausgaben)}
            valueClass="text-red-600 dark:text-red-400"
            loading={loading}
          />
          <KpiCard
            label="Cashflow"
            sublabel={filterMonth ? monthLabel(filterMonth) : "Gesamt"}
            value={fmt(cashflow)}
            valueClass={cashflow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}
            loading={loading}
          />
          <KpiCard
            label="Offen zum Review"
            sublabel="Alle Monate"
            value={String(openReview)}
            valueClass={openReview > 0 ? "text-yellow-600 dark:text-yellow-400" : "text-slate-400 dark:text-slate-500"}
            loading={loading}
            linkHref={openReview > 0 ? "/dashboard/banking/review" : undefined}
          />
        </div>

        {/* ── Filter ───────────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-3">
          {/* Suche */}
          <div className="relative">
            <svg xmlns="http://www.w3.org/2000/svg" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Empfänger oder Beschreibung…"
              className="w-64 rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Suche löschen"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
          {/* Monat */}
          <select
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Alle Monate</option>
            {availableMonths.map((m) => (
              <option key={m} value={m}>{monthLabel(m)}</option>
            ))}
          </select>

          {/* Kategorie */}
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          >
            <option value="">Alle Kategorien</option>
            {catLookup && catLookup.grouped.length > 0
              ? catLookup.grouped.map((g) => (
                  <optgroup key={g.gruppe} label={g.gruppe}>
                    {g.items.map((c) => (
                      <option key={c.id} value={c.label}>{c.icon} {c.label}</option>
                    ))}
                  </optgroup>
                ))
              : Object.entries(ANLAGE_V_CATEGORY_LABELS).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))
            }
          </select>

          {/* Immobilie */}
          {properties.length > 0 && (
            <select
              value={filterProperty}
              onChange={(e) => setFilterProperty(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              <option value="">Alle Immobilien</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}

          {/* Aktive Filter zurücksetzen */}
          {(filterCategory || filterProperty || search) && (
            <button
              type="button"
              onClick={() => { setFilterCategory(""); setFilterProperty(""); setSearch(""); }}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-500 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Filter zurücksetzen
            </button>
          )}

          <div className="ml-auto flex items-center text-sm text-slate-400 dark:text-slate-500">
            {filtered.length} Transaktion{filtered.length !== 1 ? "en" : ""}
          </div>
        </div>

        {/* ── Tabelle ───────────────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-300" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">Keine kategorisierten Transaktionen</p>
                <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
                  {openReview > 0
                    ? `${openReview} Transaktion${openReview !== 1 ? "en" : ""} warten auf Kategorisierung im Review`
                    : "Importiere einen Kontoauszug und kategorisiere die Transaktionen im Review"}
                </p>
              </div>
              {openReview > 0 && (
                <Link
                  href="/dashboard/banking/review"
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Zum Review
                </Link>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                    <th className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Datum
                    </th>
                    <th className="whitespace-nowrap px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Betrag
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Beschreibung
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Kategorie
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Immobilie
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map((tx) => {
                    const variant = getCategoryVariantFromLookup(tx.category, catLookup ?? undefined);
                    return (
                      <tr key={tx.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        {/* Datum */}
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {fmtDate(tx.date)}
                        </td>

                        {/* Betrag */}
                        <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums ${
                          Number(tx.amount) >= 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : "text-red-600 dark:text-red-400"
                        }`}>
                          {fmt(Number(tx.amount))}
                        </td>

                        {/* Beschreibung */}
                        <td className="max-w-[240px] px-4 py-3">
                          <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                            {tx.counterpart ?? <span className="text-slate-400">—</span>}
                          </p>
                          {tx.description && (
                            <p className="truncate text-xs text-slate-400 dark:text-slate-500">
                              {tx.description}
                            </p>
                          )}
                        </td>

                        {/* Kategorie */}
                        <td className="px-4 py-3">
                          {tx.category ? (
                            <div className="flex flex-col gap-0.5">
                              <span
                                title={tx.anlage_v_zeile ? `Anlage V · Z. ${tx.anlage_v_zeile}` : undefined}
                                className={`inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium ${BADGE[variant]}`}
                              >
                                {catLookup?.byLabel.get(tx.category!)
                                  ? `${catLookup.byLabel.get(tx.category!)!.icon} ${tx.category}`
                                  : (ANLAGE_V_CATEGORY_LABELS[tx.category as AnlageVCategory] ?? tx.category)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                          )}
                        </td>

                        {/* Immobilie */}
                        <td className="px-4 py-3">
                          {tx.property?.name
                            ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">{tx.property.name}</span>
                            : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                {/* Footer-Summe */}
                {filtered.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                      <td className="px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        Sichtbare Auswahl
                      </td>
                      <td className={`px-4 py-3 text-right text-sm font-semibold tabular-nums ${
                        filtered.reduce((s, t) => s + Number(t.amount), 0) >= 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-red-600 dark:text-red-400"
                      }`}>
                        {fmt(filtered.reduce((s, t) => s + Number(t.amount), 0))}
                      </td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>

      </section>
    </main>
  );
}

// ── KPI-Karte ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  sublabel,
  value,
  valueClass,
  loading,
  linkHref,
}: {
  label: string;
  sublabel: string;
  value: string;
  valueClass: string;
  loading: boolean;
  linkHref?: string;
}) {
  const inner = (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">{sublabel}</p>
      {loading ? (
        <div className="h-7 w-24 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
      ) : (
        <p className={`mt-1 text-xl font-semibold tabular-nums leading-none ${valueClass}`}>{value}</p>
      )}
    </div>
  );

  if (linkHref) {
    return <Link href={linkHref} className="block">{inner}</Link>;
  }
  return inner;
}
