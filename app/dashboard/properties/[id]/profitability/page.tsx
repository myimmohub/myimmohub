"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  calculateProfitability,
  type ProfitabilityTransaction,
} from "@/lib/calculations/profitability";

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
};

// ── Kategorien-Konfiguration für Tabellenspalten ───────────────────────────────

type ColDef = {
  key: string;
  label: string;
  hint?: string;
  categories: string[];
  deductible?: boolean;
};

const EINNAHMEN_CATS = [
  "miete_einnahmen_wohnen", "miete_einnahmen_gewerbe",
  "nebenkosten_einnahmen", "mietsicherheit_einnahme", "sonstige_einnahmen",
];

// Fixe Ausgaben-Spalten — werden nur angezeigt wenn mindestens ein Monat Daten hat
const AUSGABEN_COLS: ColDef[] = [
  { key: "schuldzinsen",      label: "Schuldzinsen",    hint: "Z. 35",  categories: ["schuldzinsen"],           deductible: true  },
  { key: "instandhaltung",    label: "Instandhaltung",  hint: "Z. 40",  categories: ["erhaltungsaufwand"],      deductible: true  },
  { key: "betriebskosten",    label: "Betriebskosten",  hint: "Z. 48",  categories: ["betriebskosten"],         deductible: true  },
  { key: "versicherungen",    label: "Versicherung",    hint: "Z. 45",  categories: ["versicherungen"],         deductible: true  },
  { key: "grundsteuer",       label: "Grundsteuer",     hint: "Z. 47",  categories: ["grundsteuer"],            deductible: true  },
  { key: "verwaltung",        label: "Verwaltung",      hint: "Z. 46",  categories: ["verwaltungskosten"],      deductible: true  },
  { key: "tilgung",           label: "Tilgung",                         categories: ["tilgung_kredit"],         deductible: false },
  { key: "sonstiges",         label: "Sonstiges",
    categories: [
      "geldbeschaffungskosten", "reinigung", "maklerkosten", "fahrtkosten",
      "rechtskosten", "sonstiges_werbungskosten", "mietsicherheit_ausgabe",
      "sonstiges_nicht_absetzbar",
    ],
  },
];

const AUFGETEILT_CATS = new Set(["aufgeteilt"]);
const EINNAHMEN_SET   = new Set(EINNAHMEN_CATS);

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

function monthRange(year: number, month: number) {
  const von = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = new Date(year, month, 0).getDate();
  const bis = `${year}-${String(month).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
  return { von, bis };
}

function sumByCategories(txs: ProfitabilityTransaction[], cats: string[]): number {
  const set = new Set(cats);
  return txs.reduce((s, t) => {
    if (t.category && set.has(t.category)) {
      return s + Math.abs(Number(t.amount));
    }
    return s;
  }, 0);
}

function sumEinnahmen(txs: ProfitabilityTransaction[]): number {
  return txs.reduce((s, t) => {
    if (t.category && EINNAHMEN_SET.has(t.category)) {
      return s + Number(t.amount);
    }
    return s;
  }, 0);
}

function filterMonth(txs: ProfitabilityTransaction[], von: string, bis: string) {
  return txs.filter((t) => t.date >= von && t.date <= bis && !AUFGETEILT_CATS.has(t.category ?? ""));
}

const MONTH_NAMES = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function ProfitabilityPage() {
  const { id } = useParams<{ id: string }>();

  const [property, setProperty]       = useState<Property | null>(null);
  const [transactions, setTransactions] = useState<ProfitabilityTransaction[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [year, setYear]               = useState(new Date().getFullYear());

  // ── Daten laden ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prop, error: propErr }, { data: txData, error: txErr }] =
        await Promise.all([
          supabase
            .from("properties")
            .select("id, name, address, kaufpreis, kaufdatum, baujahr, afa_satz, afa_jahresbetrag")
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

  // ── Verfügbare Jahre ────────────────────────────────────────────────────────
  const availableYears = useMemo(() => {
    const years = new Set(transactions.map((t) => new Date(t.date).getFullYear()));
    years.add(new Date().getFullYear());
    return Array.from(years).sort((a, b) => b - a);
  }, [transactions]);

  // ── AfA-Werte ───────────────────────────────────────────────────────────────
  // afa_satz in DB = dezimal (0.02), profitability.ts erwartet Prozentwert (2.0)
  const propertyInput = useMemo(() => ({
    kaufpreis:    property?.kaufpreis ?? 0,
    afa_satz:     (property?.afa_satz ?? 0) * 100,
    kaufdatum:    property?.kaufdatum ?? null,
  }), [property]);

  const afaMonat = propertyInput.kaufpreis > 0
    ? (propertyInput.kaufpreis * propertyInput.afa_satz / 100) / 12
    : (property?.afa_jahresbetrag ?? 0) / 12;

  // ── Monatsdaten berechnen ────────────────────────────────────────────────────
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1;
      const { von, bis } = monthRange(year, m);
      const txs = filterMonth(transactions, von, bis);

      const einnahmen = sumEinnahmen(txs);
      const colValues = Object.fromEntries(
        AUSGABEN_COLS.map(({ key, categories }) => [key, sumByCategories(txs, categories)]),
      );
      const ausgabenTotal = AUSGABEN_COLS.reduce((s, col) => s + (colValues[col.key] ?? 0), 0);
      const cashflow = einnahmen - ausgabenTotal;

      return { m, label: MONTH_NAMES[i], einnahmen, colValues, ausgabenTotal, cashflow, hasTx: txs.length > 0 };
    });
  }, [transactions, year]);

  // ── Jahressummen ─────────────────────────────────────────────────────────────
  const yearTotals = useMemo(() => {
    const einnahmen    = months.reduce((s, m) => s + m.einnahmen, 0);
    const ausgaben     = months.reduce((s, m) => s + m.ausgabenTotal, 0);
    const cashflow     = einnahmen - ausgaben;
    const afaJahr      = afaMonat * 12;
    const colTotals    = Object.fromEntries(
      AUSGABEN_COLS.map(({ key }) => [key, months.reduce((s, m) => s + (m.colValues[key] ?? 0), 0)]),
    );

    const { steuerlicher_gewinn_verlust, zinsen } = calculateProfitability(
      transactions, propertyInput,
      { von: `${year}-01-01`, bis: `${year}-12-31` },
    );

    return { einnahmen, ausgaben, cashflow, afaJahr, colTotals, steuerlicher_gewinn_verlust, zinsen };
  }, [months, afaMonat, transactions, propertyInput, year]);

  // ── Sichtbare Ausgaben-Spalten ───────────────────────────────────────────────
  const visibleCols = useMemo(
    () => AUSGABEN_COLS.filter(({ key }) => (yearTotals.colTotals[key] ?? 0) > 0),
    [yearTotals.colTotals],
  );

  // ── Render ────────────────────────────────────────────────────────────────────
  if (loading) return <PageSkeleton />;
  if (error || !property) return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <p className="text-center text-sm text-red-600 dark:text-red-400">{error ?? "Fehler"}</p>
    </main>
  );

  const colSpanTotal = 2 + visibleCols.length + 4; // Monat + Einnahmen + Ausgaben + Gesamt + CF + AfA + Steuer

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
            {/* Jahr-Selektor */}
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

        {/* ── Kennzahlen oben ───────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard label="Einnahmen" value={fmtEur(yearTotals.einnahmen)} color="emerald" />
          <SummaryCard label="Ausgaben" value={fmtEur(yearTotals.ausgaben)} color="red" />
          <SummaryCard
            label="Cashflow"
            value={fmtEur(yearTotals.cashflow, true)}
            color={yearTotals.cashflow >= 0 ? "emerald" : "red"}
          />
          <SummaryCard
            label="Steuerl. Ergebnis"
            value={fmtEur(yearTotals.steuerlicher_gewinn_verlust, true)}
            color={yearTotals.steuerlicher_gewinn_verlust <= 0 ? "emerald" : "slate"}
            hint={yearTotals.steuerlicher_gewinn_verlust < 0 ? "Steuervorteil" : undefined}
          />
        </div>

        {/* ── Monatstabelle ─────────────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                {/* Gruppen-Header */}
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
                  {/* Einnahmen */}
                  <th className="border-l border-slate-100 whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Gesamt
                  </th>
                  {/* Ausgaben-Spalten */}
                  {visibleCols.map((col) => (
                    <th key={col.key} className="border-l border-slate-100 whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                      {col.label}
                      {col.hint && (
                        <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">{col.hint}</span>
                      )}
                    </th>
                  ))}
                  {/* Ausgaben-Gesamt */}
                  <th className="border-l border-slate-100 whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    Gesamt
                  </th>
                  {/* Cashflow + AfA */}
                  <th className="border-l border-slate-200 whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-600 dark:border-slate-700 dark:text-slate-300">
                    Cashflow
                  </th>
                  <th className="whitespace-nowrap px-4 py-2 text-right text-xs font-medium text-slate-500 dark:text-slate-400">
                    AfA (Monat)
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {months.map(({ m, label, einnahmen, colValues, ausgabenTotal, cashflow, hasTx }) => (
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
                    {/* Einnahmen */}
                    <td className="border-l border-slate-100 px-4 py-2.5 text-right text-sm tabular-nums dark:border-slate-800">
                      <span className={einnahmen > 0 ? "font-medium text-emerald-600 dark:text-emerald-400" : "text-slate-300 dark:text-slate-600"}>
                        {einnahmen > 0 ? fmtEur(einnahmen) : "—"}
                      </span>
                    </td>
                    {/* Ausgaben-Spalten */}
                    {visibleCols.map((col) => {
                      const v = colValues[col.key] ?? 0;
                      return (
                        <td key={col.key} className="border-l border-slate-100 px-4 py-2.5 text-right text-sm tabular-nums text-slate-600 dark:border-slate-800 dark:text-slate-400">
                          {fmtEur(v, false, true)}
                        </td>
                      );
                    })}
                    {/* Ausgaben Gesamt */}
                    <td className="border-l border-slate-100 px-4 py-2.5 text-right text-sm tabular-nums dark:border-slate-800">
                      <span className={ausgabenTotal > 0 ? "font-medium text-red-600 dark:text-red-400" : "text-slate-300 dark:text-slate-600"}>
                        {ausgabenTotal > 0 ? fmtEur(ausgabenTotal) : "—"}
                      </span>
                    </td>
                    {/* Cashflow */}
                    <td className={`border-l border-slate-200 px-4 py-2.5 text-right text-sm font-semibold tabular-nums dark:border-slate-700 ${
                      !hasTx        ? "text-slate-300 dark:text-slate-600"
                      : cashflow > 0  ? "text-emerald-600 dark:text-emerald-400"
                      : cashflow < 0  ? "text-red-600 dark:text-red-400"
                      :                 "text-slate-400 dark:text-slate-500"
                    }`}>
                      {hasTx ? fmtEur(cashflow, true) : "—"}
                    </td>
                    {/* AfA */}
                    <td className="px-4 py-2.5 text-right text-sm tabular-nums text-slate-400 dark:text-slate-500">
                      {afaMonat > 0 ? fmtEur(afaMonat) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* ── Jahressummen ───────────────────────────────────────────── */}
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold dark:border-slate-700 dark:bg-slate-800/60">
                  <td className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Gesamt {year}
                  </td>
                  {/* Einnahmen */}
                  <td className="border-l border-slate-200 px-4 py-3 text-right text-sm font-bold tabular-nums text-emerald-600 dark:border-slate-700 dark:text-emerald-400">
                    {fmtEur(yearTotals.einnahmen)}
                  </td>
                  {/* Ausgaben-Spalten */}
                  {visibleCols.map(({ key }) => (
                    <td key={key} className="border-l border-slate-200 px-4 py-3 text-right text-sm tabular-nums text-slate-600 dark:border-slate-700 dark:text-slate-300">
                      {yearTotals.colTotals[key] > 0 ? fmtEur(yearTotals.colTotals[key]) : "—"}
                    </td>
                  ))}
                  {/* Ausgaben Gesamt */}
                  <td className="border-l border-slate-200 px-4 py-3 text-right text-sm font-bold tabular-nums text-red-600 dark:border-slate-700 dark:text-red-400">
                    {fmtEur(yearTotals.ausgaben)}
                  </td>
                  {/* Cashflow */}
                  <td className={`border-l border-slate-300 px-4 py-3 text-right text-sm font-bold tabular-nums dark:border-slate-600 ${
                    yearTotals.cashflow >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
                  }`}>
                    {fmtEur(yearTotals.cashflow, true)}
                  </td>
                  {/* AfA */}
                  <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-500 dark:text-slate-400">
                    {afaMonat > 0 ? fmtEur(afaMonat * 12) : "—"}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* ── Steuerliches Gesamtergebnis ───────────────────────────────────── */}
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
            <TaxRow label="Werbungskosten gesamt (Zeilen 35–53)" value={fmtEur(yearTotals.ausgaben - (yearTotals.colTotals["tilgung"] ?? 0))} valueClass="text-red-600 dark:text-red-400" hint="ohne Tilgung" />
            <TaxRow label="davon Schuldzinsen (Zeile 35)" value={fmtEur(yearTotals.zinsen)} indent />
            <TaxRow
              label="AfA nach § 7 EStG"
              value={afaMonat > 0 ? fmtEur(afaMonat * 12) : "—"}
              valueClass="text-red-600 dark:text-red-400"
              hint={propertyInput.afa_satz > 0 ? `${propertyInput.afa_satz} % von ${fmtEur(propertyInput.kaufpreis)}` : undefined}
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
              ⚠ Vereinfachte Darstellung. Tilgungsanteile ({fmtEur(yearTotals.colTotals["tilgung"] ?? 0)}) sind steuerlich nicht absetzbar und wurden nicht berücksichtigt. Bitte mit einem Steuerberater abstimmen.
            </p>
          </div>
        </div>

        {/* ── AfA-Info ──────────────────────────────────────────────────────── */}
        {propertyInput.kaufpreis > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-3 text-sm font-semibold text-slate-700 dark:text-slate-300">AfA-Grundlagen</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm sm:grid-cols-4">
              <AfAItem label="Kaufpreis" value={fmtEur(propertyInput.kaufpreis)} />
              <AfAItem label="AfA-Satz" value={propertyInput.afa_satz > 0 ? `${propertyInput.afa_satz} %` : "—"} />
              <AfAItem label="Jahresbetrag" value={afaMonat > 0 ? fmtEur(afaMonat * 12) : "—"} />
              <AfAItem label="Monatsbetrag" value={afaMonat > 0 ? fmtEur(afaMonat) : "—"} />
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
