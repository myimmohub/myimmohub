"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  calculateProfitability,
  type ProfitabilityTransaction,
  type ProfitabilityDbCategory,
} from "@/lib/calculations/profitability";
import {
  loadCategoryLookup,
  type CategoryLookup,
} from "@/lib/banking/categoryLookup";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

// ── Typen ─────────────────────────────────────────────────────────────────────

type Property = {
  id: string;
  name: string;
  address: string | null;
  kaufpreis: number | null;
  kaufdatum: string | null;
  baujahr: number | null;
  afa_satz: number | null;        // dezimal, z. B. 0.02
  afa_jahresbetrag: number | null;
  gebaeudewert: number | null;
  grundwert: number | null;
  inventarwert: number | null;
  kaufpreis_split_quelle: string | null;
};

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

const fmtEur = (n: number, showSign = false, dash = false) => {
  if (dash && n === 0) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  const abs = new Intl.NumberFormat("de-DE", {
    style: "currency", currency: "EUR", maximumFractionDigits: 0,
  }).format(Math.abs(n));
  if (showSign && n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
};

const fmtEurStr = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Math.abs(n));

function monthRange(year: number, month: number) {
  const von = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const bis = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { von, bis };
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
  "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
];
const MONTH_NAMES_FULL = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// Old slugs for backward compat
const OLD_EINNAHMEN = new Set([
  "miete_einnahmen_wohnen", "miete_einnahmen_gewerbe",
  "nebenkosten_einnahmen", "mietsicherheit_einnahme", "sonstige_einnahmen",
]);

// Old slugs that are nicht-absetzbar (e.g. Tilgung, Kaution)
const OLD_NICHT_ABSETZBAR_SET = new Set([
  "tilgung_kredit", "mietsicherheit_ausgabe", "sonstiges_nicht_absetzbar",
]);

function isEinnahmeCat(cat: string, catLookup?: CategoryLookup | null): boolean {
  if (catLookup) {
    const db = catLookup.byLabel.get(cat);
    if (db) return db.typ === "einnahme";
  }
  return OLD_EINNAHMEN.has(cat);
}

function filterMonth(txs: ProfitabilityTransaction[], von: string, bis: string) {
  return txs.filter((t) => t.date >= von && t.date <= bis && t.category !== "aufgeteilt");
}

// ── Pie chart colors ──────────────────────────────────────────────────────────

const PIE_COLORS = [
  "#3b82f6", "#ef4444", "#f59e0b", "#10b981", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1", "#14b8a6",
  "#e11d48", "#84cc16",
];

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function ProfitabilityPage() {
  const { id } = useParams<{ id: string }>();

  const [property, setProperty]       = useState<Property | null>(null);
  const [transactions, setTransactions] = useState<ProfitabilityTransaction[]>([]);
  const [catLookup, setCatLookup]     = useState<CategoryLookup | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [year, setYear]               = useState(new Date().getFullYear());
  const [hideNichtAbsetzbar, setHideNichtAbsetzbar] = useState(false);

  // ── Daten laden ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);

      const [lookupResult] = await Promise.all([loadCategoryLookup()]);
      setCatLookup(lookupResult);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prop, error: propErr }, { data: txData, error: txErr }] =
        await Promise.all([
          supabase
            .from("properties")
            .select("id, name, address, kaufpreis, kaufdatum, baujahr, afa_satz, afa_jahresbetrag, gebaeudewert, grundwert, inventarwert, kaufpreis_split_quelle")
            .eq("id", id)
            .eq("user_id", user.id)
            .single(),
          supabase
            .from("transactions")
            .select("id, date, amount, category")
            .eq("property_id", id)
            .eq("user_id", user.id)
            .or("category.is.null,category.neq.aufgeteilt")
            .order("date", { ascending: true }),
        ]);

      if (propErr || !prop) { setError("Immobilie nicht gefunden."); setLoading(false); return; }
      if (txErr) { setError(`Transaktionen konnten nicht geladen werden: ${txErr.message}`); setLoading(false); return; }

      setProperty(prop as Property);
      setTransactions((txData ?? []) as ProfitabilityTransaction[]);
      setLoading(false);
    };
    void load();
  }, [id]);

  // ── DB categories for profitability calc ────────────────────────────────────
  const dbCategories: ProfitabilityDbCategory[] | undefined = useMemo(() => {
    if (!catLookup) return undefined;
    return catLookup.categories.map((c) => ({
      label: c.label, typ: c.typ, anlage_v: c.anlage_v, gruppe: c.gruppe,
    }));
  }, [catLookup]);

  // ── Verfügbare Jahre ────────────────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const years = new Set(transactions.map((t) => new Date(t.date).getFullYear()));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  // ── AfA-Werte ───────────────────────────────────────────────────────────────
  // AfA-Basis: Gebäudewert wenn vorhanden, sonst Kaufpreis (konservativ)
  const kaufpreis = property?.kaufpreis ?? 0;
  const gebaeudewert = property?.gebaeudewert ?? null;
  const grundwert = property?.grundwert ?? null;
  const inventarwert = property?.inventarwert ?? null;
  const afaBasis = (gebaeudewert != null && gebaeudewert > 0) ? gebaeudewert : kaufpreis;
  const hasSplit = gebaeudewert != null && gebaeudewert > 0;

  const propertyInput = useMemo(() => ({
    kaufpreis,
    gebaeudewert,
    afa_satz:     (property?.afa_satz ?? 0) * 100,
    kaufdatum:    property?.kaufdatum ?? null,
  }), [property, kaufpreis, gebaeudewert]);

  const afaMonat = afaBasis > 0 && propertyInput.afa_satz > 0
    ? (afaBasis * propertyInput.afa_satz / 100) / 12
    : (property?.afa_jahresbetrag ?? 0) / 12;

  // ── Dynamic expense columns from DB ─────────────────────────────────────────
  const ausgabenCols = useMemo(() => {
    if (!catLookup) return [];
    // Group ausgabe categories, collapse into columns by gruppe
    const gruppenMap = new Map<string, { labels: string[]; hint: string | null; gruppe: string }>();
    for (const cat of catLookup.categories) {
      if (cat.typ !== "ausgabe") continue;
      const key = cat.gruppe;
      if (!gruppenMap.has(key)) {
        gruppenMap.set(key, { labels: [], hint: cat.anlage_v, gruppe: key });
      }
      gruppenMap.get(key)!.labels.push(cat.label);
    }
    return Array.from(gruppenMap.values()).map((g) => {
      // A column is nicht-absetzbar if ALL its categories are nicht-absetzbar
      const isNichtAbsetzbar = g.labels.every((label) => {
        const dbCat = catLookup.byLabel.get(label);
        if (dbCat) return dbCat.anlage_v === "nicht absetzbar";
        return OLD_NICHT_ABSETZBAR_SET.has(label);
      });
      return {
        key: g.gruppe,
        label: g.gruppe,
        hint: g.hint,
        categories: g.labels,
        isNichtAbsetzbar,
      };
    });
  }, [catLookup]);

  // ── Monatsdaten berechnen ────────────────────────────────────────────────────
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const { von, bis } = monthRange(year, m);
      const txs = filterMonth(transactions, von, bis);

      let einnahmen = 0;
      const catAmounts: Record<string, number> = {};

      for (const tx of txs) {
        const cat = tx.category;
        if (!cat) continue;
        const amount = Number(tx.amount);
        if (isEinnahmeCat(cat, catLookup)) {
          einnahmen += amount;
        } else {
          catAmounts[cat] = (catAmounts[cat] ?? 0) + Math.abs(amount);
        }
      }

      // Aggregate into columns
      const colValues: Record<string, number> = {};
      for (const col of ausgabenCols) {
        colValues[col.key] = col.categories.reduce((s, c) => s + (catAmounts[c] ?? 0), 0);
      }
      // Also count uncategorized ausgaben (old slugs not in any column)
      const colTotal = Object.values(colValues).reduce((s, v) => s + v, 0);
      const rawTotal = Object.values(catAmounts).reduce((s, v) => s + v, 0);
      const sonstigesExtra = rawTotal - colTotal;
      if (sonstigesExtra > 0.01) {
        colValues["_sonstiges"] = (colValues["_sonstiges"] ?? 0) + sonstigesExtra;
      }

      const ausgabenTotal = rawTotal;
      const cashflow = einnahmen - ausgabenTotal;

      // Filtered: exclude nicht-absetzbar categories
      const ausgabenFiltered = Object.entries(catAmounts).reduce((s, [cat, v]) => {
        const dbCat = catLookup?.byLabel.get(cat);
        const isNA = dbCat ? dbCat.anlage_v === "nicht absetzbar" : OLD_NICHT_ABSETZBAR_SET.has(cat);
        return isNA ? s : s + v;
      }, 0);
      const cashflowFiltered = einnahmen - ausgabenFiltered;

      return { m, label: MONTH_NAMES_FULL[i], einnahmen, colValues, ausgabenTotal, cashflow, ausgabenFiltered, cashflowFiltered, hasTx: txs.length > 0, catAmounts };
    });
  }, [transactions, year, catLookup, ausgabenCols]);

  // ── Visible columns (only show if year has data) ────────────────────────────
  const allCols = useMemo(() => {
    const cols = [...ausgabenCols];
    // Check if there are uncategorized ausgaben
    const hasSonstiges = months.some((m) => (m.colValues["_sonstiges"] ?? 0) > 0.01);
    if (hasSonstiges) {
      cols.push({ key: "_sonstiges", label: "Sonstige (alt)", hint: null, categories: [], isNichtAbsetzbar: false });
    }
    return cols;
  }, [ausgabenCols, months]);

  const visibleCols = useMemo(
    () => allCols.filter(({ key, isNichtAbsetzbar }) =>
      months.some((m) => (m.colValues[key] ?? 0) > 0) &&
      (!hideNichtAbsetzbar || !isNichtAbsetzbar)
    ),
    [allCols, months, hideNichtAbsetzbar],
  );

  // ── Jahressummen ─────────────────────────────────────────────────────────────
  const yearTotals = useMemo(() => {
    const einnahmen         = months.reduce((s, m) => s + m.einnahmen, 0);
    const ausgaben          = months.reduce((s, m) => s + m.ausgabenTotal, 0);
    const ausgabenFiltered  = months.reduce((s, m) => s + m.ausgabenFiltered, 0);
    const cashflow          = einnahmen - ausgaben;
    const cashflowFiltered  = einnahmen - ausgabenFiltered;
    const colTotals: Record<string, number> = {};
    for (const col of allCols) {
      colTotals[col.key] = months.reduce((s, m) => s + (m.colValues[col.key] ?? 0), 0);
    }

    const calcResult = calculateProfitability(
      transactions, propertyInput,
      { von: `${year}-01-01`, bis: `${year}-12-31` },
      dbCategories,
    );

    return { einnahmen, ausgaben, ausgabenFiltered, cashflow, cashflowFiltered, colTotals, steuerlicher_gewinn_verlust: calcResult.steuerlicher_gewinn_verlust, zinsen: calcResult.zinsen };
  }, [months, transactions, propertyInput, year, dbCategories, allCols]);

  // ── Pie chart data (Ausgaben by category) ────────────────────────────────────
  const pieDataAll = useMemo(() => {
    const catTotals = new Map<string, number>();
    for (const m of months) {
      for (const [cat, amount] of Object.entries(m.catAmounts)) {
        catTotals.set(cat, (catTotals.get(cat) ?? 0) + amount);
      }
    }
    return Array.from(catTotals.entries())
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([cat, value]) => {
        const dbCat = catLookup?.byLabel.get(cat);
        const name = dbCat ? `${dbCat.icon} ${dbCat.label}` : cat;
        // Absetzbar: DB-Kategorie typ=ausgabe, oder alte Slugs die nicht in der nicht-absetzbar-Liste sind
        const isDeductible = dbCat
          ? dbCat.typ === "ausgabe" && dbCat.anlage_v !== "nicht absetzbar"
          : !OLD_NICHT_ABSETZBAR_SET.has(cat);
        return { name, value, isDeductible };
      });
  }, [months, catLookup]);

  const pieData = useMemo(() => {
    if (!hideNichtAbsetzbar) return pieDataAll;
    return pieDataAll.filter((d) => d.isDeductible);
  }, [pieDataAll, hideNichtAbsetzbar]);

  const hasNichtAbsetzbar = pieDataAll.some((d) => !d.isDeductible);

  // ── Bar chart data (monthly cashflow) ────────────────────────────────────────
  const barData = useMemo(() => {
    return months.map((m) => ({
      name: MONTH_NAMES[m.m - 1],
      Einnahmen: Math.round(m.einnahmen),
      Ausgaben: Math.round(hideNichtAbsetzbar ? -m.ausgabenFiltered : -m.ausgabenTotal),
      Cashflow: Math.round(hideNichtAbsetzbar ? m.cashflowFiltered : m.cashflow),
    }));
  }, [months, hideNichtAbsetzbar]);

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return <PageSkeleton />;
  if (error || !property) return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <p className="text-center text-sm text-red-600 dark:text-red-400">{error ?? "Fehler"}</p>
    </main>
  );

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-7xl space-y-6">

        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Profitabilität
              </h1>
              <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                {property.name}{property.address ? ` · ${property.address}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {hasNichtAbsetzbar && (
                <label className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
                  <input
                    type="checkbox"
                    checked={hideNichtAbsetzbar}
                    onChange={(e) => setHideNichtAbsetzbar(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-800"
                  />
                  Nicht absetzbare ausblenden
                </label>
              )}
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="w-fit rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-900 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            >
              {availableYears.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            </div>
          </div>
        </div>

        {/* ── Kennzahlen ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Einnahmen" value={fmtEur(yearTotals.einnahmen)} color="emerald" />
          <SummaryCard
            label={hideNichtAbsetzbar ? "Ausgaben (absetzbar)" : "Ausgaben"}
            value={fmtEur(hideNichtAbsetzbar ? yearTotals.ausgabenFiltered : yearTotals.ausgaben)}
            color="red"
          />
          <SummaryCard
            label="Cashflow"
            value={fmtEur(hideNichtAbsetzbar ? yearTotals.cashflowFiltered : yearTotals.cashflow, true)}
            color={(hideNichtAbsetzbar ? yearTotals.cashflowFiltered : yearTotals.cashflow) >= 0 ? "emerald" : "red"}
          />
          <SummaryCard
            label="Steuerl. Ergebnis"
            value={fmtEur(yearTotals.steuerlicher_gewinn_verlust, true)}
            color={yearTotals.steuerlicher_gewinn_verlust <= 0 ? "emerald" : "slate"}
            hint={yearTotals.steuerlicher_gewinn_verlust < 0 ? "Steuervorteil" : undefined}
          />
        </div>

        {/* ── Charts ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Cashflow Bar Chart */}
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-sm font-semibold text-slate-700 dark:text-slate-300">
              Monatlicher Cashflow {year}
            </h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={barData} margin={{ top: 5, right: 5, bottom: 5, left: 5 }}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value, name) => [fmtEurStr(Number(value)), String(name)]}
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Einnahmen" fill="#10b981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Ausgaben" fill="#ef4444" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Ausgaben Pie Chart */}
          {pieDataAll.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-4">
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  Ausgaben nach Kategorie {year}
                </h2>
              </div>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={95}
                    innerRadius={50}
                    paddingAngle={2}
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => fmtEurStr(Number(value))}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5">
                {pieData.map((entry, i) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
                    <span
                      className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                    <span>{entry.name}</span>
                    <span className="tabular-nums text-slate-400 dark:text-slate-500">
                      {fmtEurStr(entry.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Monatstabelle ─────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-semibold text-slate-400 dark:text-slate-500" rowSpan={2}>
                    Monat
                  </th>
                  <th className="border-l border-slate-100 px-4 py-2 text-center text-xs font-semibold text-emerald-600 dark:border-slate-800 dark:text-emerald-400">
                    Einnahmen
                  </th>
                  {visibleCols.length > 0 && (
                    <th
                      colSpan={visibleCols.length + 1}
                      className="border-l border-slate-100 px-4 py-2 text-center text-xs font-semibold text-red-500 dark:border-slate-800 dark:text-red-400"
                    >
                      Ausgaben
                    </th>
                  )}
                  <th className="border-l border-slate-100 px-4 py-2 text-center text-xs font-semibold text-slate-600 dark:border-slate-800 dark:text-slate-300" colSpan={2}>
                    Ergebnis
                  </th>
                </tr>
                <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60">
                  <th className="border-l border-slate-100 whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Gesamt
                  </th>
                  {visibleCols.map((col) => (
                    <th key={col.key} className="border-l border-slate-100 whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      {col.label}
                      {col.hint && (
                        <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">{col.hint}</span>
                      )}
                    </th>
                  ))}
                  <th className="border-l border-slate-100 whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Gesamt
                  </th>
                  <th className="border-l border-slate-200 whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    Cashflow
                  </th>
                  <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                    AfA (Monat)
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {months.map(({ m, label, einnahmen, colValues, ausgabenTotal, cashflow, ausgabenFiltered, cashflowFiltered, hasTx }) => {
                  const dispAusgaben = hideNichtAbsetzbar ? ausgabenFiltered : ausgabenTotal;
                  const dispCashflow = hideNichtAbsetzbar ? cashflowFiltered : cashflow;
                  return (
                  <tr
                    key={m}
                    className={`transition ${
                      hasTx
                        ? "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                        : "opacity-40"
                    }`}
                  >
                    <td className="whitespace-nowrap px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300">
                      {label}
                    </td>
                    <td className="border-l border-slate-100 px-4 py-2.5 text-right text-sm tabular-nums dark:border-slate-800">
                      <span className={einnahmen > 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"}>
                        {einnahmen > 0 ? fmtEur(einnahmen) : "—"}
                      </span>
                    </td>
                    {visibleCols.map((col) => {
                      const v = colValues[col.key] ?? 0;
                      return (
                        <td key={col.key} className="border-l border-slate-100 px-4 py-2.5 text-right text-sm tabular-nums text-slate-600 dark:border-slate-800 dark:text-slate-400">
                          {fmtEur(v, false, true)}
                        </td>
                      );
                    })}
                    <td className="border-l border-slate-100 px-4 py-2.5 text-right text-sm tabular-nums dark:border-slate-800">
                      <span className={dispAusgaben > 0 ? "font-medium text-red-600 dark:text-red-400" : "text-slate-300 dark:text-slate-600"}>
                        {dispAusgaben > 0 ? fmtEur(dispAusgaben) : "—"}
                      </span>
                    </td>
                    <td className={`border-l border-slate-200 px-4 py-2.5 text-right text-sm font-semibold tabular-nums dark:border-slate-700 ${
                      !hasTx          ? "text-slate-300 dark:text-slate-600"
                      : dispCashflow > 0  ? "text-emerald-600 dark:text-emerald-400"
                      : dispCashflow < 0  ? "text-red-600 dark:text-red-400"
                      :                     "text-slate-400 dark:text-slate-500"
                    }`}>
                      {hasTx ? fmtEur(dispCashflow, true) : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-400 dark:text-slate-500">
                      {afaMonat > 0 ? fmtEur(afaMonat) : "—"}
                    </td>
                  </tr>
                );})}
              </tbody>

              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-800/60">
                  <td className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Gesamt {year}
                  </td>
                  <td className="border-l border-slate-200 px-4 py-3 text-right text-sm font-bold tabular-nums text-emerald-600 dark:border-slate-700 dark:text-emerald-400">
                    {fmtEur(yearTotals.einnahmen)}
                  </td>
                  {visibleCols.map(({ key }) => (
                    <td key={key} className="border-l border-slate-200 px-4 py-3 text-right text-sm tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      {(yearTotals.colTotals[key] ?? 0) > 0 ? fmtEur(yearTotals.colTotals[key]) : "—"}
                    </td>
                  ))}
                  <td className="border-l border-slate-200 px-4 py-3 text-right text-sm font-bold tabular-nums text-red-600 dark:border-slate-700 dark:text-red-400">
                    {fmtEur(hideNichtAbsetzbar ? yearTotals.ausgabenFiltered : yearTotals.ausgaben)}
                  </td>
                  <td className={`border-l border-slate-300 px-4 py-3 text-right text-sm font-bold tabular-nums dark:border-slate-600 ${
                    (hideNichtAbsetzbar ? yearTotals.cashflowFiltered : yearTotals.cashflow) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {fmtEur(hideNichtAbsetzbar ? yearTotals.cashflowFiltered : yearTotals.cashflow, true)}
                  </td>
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {afaMonat > 0 ? fmtEur(afaMonat * 12) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Steuerliches Gesamtergebnis ───────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100">
              Steuerliches Gesamtergebnis {year}
            </h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              Vereinfachte Anlage-V-Berechnung · keine Steuerberatung
            </p>
          </div>
          <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
            <TaxRow label="Einnahmen (Zeilen 9–17)" value={fmtEur(yearTotals.einnahmen)} valueClass="text-emerald-600 dark:text-emerald-400" />
            <TaxRow label="Werbungskosten gesamt (Zeilen 35–53)" value={fmtEur(yearTotals.ausgaben)} valueClass="text-red-600 dark:text-red-400" />
            <TaxRow label="davon Schuldzinsen (Zeile 35)" value={fmtEur(yearTotals.zinsen)} indent />
            <TaxRow
              label="AfA nach § 7 EStG"
              value={afaMonat > 0 ? fmtEur(afaMonat * 12) : "—"}
              valueClass="text-red-600 dark:text-red-400"
              hint={propertyInput.afa_satz > 0 ? `${propertyInput.afa_satz} % von ${fmtEur(afaBasis)}${hasSplit ? " (Gebäudewert)" : ""}` : undefined}
            />
            <div className="flex items-start justify-between gap-4 py-3">
              <div>
                <p className="font-semibold text-slate-800 dark:text-slate-200">
                  Überschuss / Werbungskostenüberschuss
                </p>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  Einnahmen − Werbungskosten − AfA
                </p>
              </div>
              <div className="text-right">
                <p className={`text-base font-bold tabular-nums ${
                  yearTotals.steuerlicher_gewinn_verlust < 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-slate-900 dark:text-slate-100"
                }`}>
                  {fmtEur(yearTotals.steuerlicher_gewinn_verlust, true)}
                </p>
                {yearTotals.steuerlicher_gewinn_verlust < 0 && (
                  <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                    Werbungskostenüberschuss → senkt Einkommensteuer
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-b-xl bg-slate-50 px-5 py-3 dark:bg-slate-800/50">
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Vereinfachte Darstellung. Bitte mit einem Steuerberater abstimmen.
            </p>
          </div>
        </div>

        {/* ── AfA-Info & Kaufpreisaufteilung ────────────────────────────── */}
        {kaufpreis > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">AfA-Grundlagen & Kaufpreisaufteilung</h2>

            {/* Kaufpreisaufteilung */}
            <div className="mb-4">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                <AfAItem label="Kaufpreis gesamt" value={fmtEur(kaufpreis)} />
                <AfAItem label="Gebäudewert (AfA-Basis)" value={hasSplit ? fmtEur(gebaeudewert!) : "—"} />
                <AfAItem label="Grundstückswert" value={grundwert != null && grundwert > 0 ? fmtEur(grundwert) : "—"} />
                <AfAItem label="Inventar" value={inventarwert != null && inventarwert > 0 ? fmtEur(inventarwert) : "—"} />
              </div>
              {hasSplit && (
                <div className="mt-3">
                  <div className="flex h-3 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    {gebaeudewert! > 0 && (
                      <div
                        className="bg-blue-500 transition-all"
                        style={{ width: `${(gebaeudewert! / kaufpreis) * 100}%` }}
                        title={`Gebäude: ${((gebaeudewert! / kaufpreis) * 100).toFixed(1)}%`}
                      />
                    )}
                    {grundwert != null && grundwert > 0 && (
                      <div
                        className="bg-amber-400 transition-all"
                        style={{ width: `${(grundwert / kaufpreis) * 100}%` }}
                        title={`Grund: ${((grundwert / kaufpreis) * 100).toFixed(1)}%`}
                      />
                    )}
                    {inventarwert != null && inventarwert > 0 && (
                      <div
                        className="bg-emerald-400 transition-all"
                        style={{ width: `${(inventarwert / kaufpreis) * 100}%` }}
                        title={`Inventar: ${((inventarwert / kaufpreis) * 100).toFixed(1)}%`}
                      />
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                      <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                      Gebäude {((gebaeudewert! / kaufpreis) * 100).toFixed(1)}% (AfA-fähig)
                    </span>
                    {grundwert != null && grundwert > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                        Grund {((grundwert / kaufpreis) * 100).toFixed(1)}% (nicht abschreibbar)
                      </span>
                    )}
                    {inventarwert != null && inventarwert > 0 && (
                      <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                        Inventar {((inventarwert / kaufpreis) * 100).toFixed(1)}%
                      </span>
                    )}
                  </div>
                  {property?.kaufpreis_split_quelle && (
                    <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      Quelle: {property.kaufpreis_split_quelle === "ki_extraktion" ? "KI-Extraktion" : property.kaufpreis_split_quelle === "bmf_schaetzung" ? "BMF-Schätzung" : "Manuell"}
                    </p>
                  )}
                </div>
              )}
              {!hasSplit && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  Keine Kaufpreisaufteilung hinterlegt — der gesamte Kaufpreis wird als AfA-Basis verwendet. Für eine korrekte Berechnung bitte Gebäudewert in den Immobilien-Einstellungen hinterlegen.
                </p>
              )}
            </div>

            {/* AfA-Berechnung */}
            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
              <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
                <AfAItem label="AfA-Basis" value={fmtEur(afaBasis)} />
                <AfAItem label="AfA-Satz" value={propertyInput.afa_satz > 0 ? `${propertyInput.afa_satz} %` : "—"} />
                <AfAItem label="Jahresbetrag" value={afaMonat > 0 ? fmtEur(afaMonat * 12) : "—"} />
                <AfAItem label="Monatsbetrag" value={afaMonat > 0 ? fmtEur(afaMonat) : "—"} />
              </div>
            </div>
          </div>
        )}

      </section>
    </main>
  );
}

// ── Hilfskomponenten ──────────────────────────────────────────────────────────

function SummaryCard({
  label, value, color, hint,
}: {
  label: string;
  value: React.ReactNode;
  color: "emerald" | "red" | "slate";
  hint?: string;
}) {
  const colors = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    red:     "text-red-600 dark:text-red-400",
    slate:    "text-slate-900 dark:text-slate-100",
  };
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-1.5 text-lg font-bold tabular-nums ${colors[color]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

function TaxRow({
  label, value, valueClass = "text-slate-700 dark:text-slate-300", hint, indent,
}: {
  label: string; value: React.ReactNode; valueClass?: string; hint?: string; indent?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 py-2.5 ${indent ? "pl-4" : ""}`}>
      <div>
        <p className={`text-sm ${indent ? "text-slate-500 dark:text-slate-400" : "text-slate-700 dark:text-slate-300"}`}>{label}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      </div>
      <p className={`shrink-0 text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

function AfAItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="py-1">
      <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium text-slate-800 dark:text-slate-200">{value}</p>
    </div>
  );
}

function PageSkeleton() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-7xl space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="grid grid-cols-4 gap-3">
          {[1,2,3,4].map((i) => <div key={i} className="h-20 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
        </div>
        <div className="h-96 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
      </section>
    </main>
  );
}
