"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Cell,
} from "recharts";
import {
  calculateProfitability,
  type ProfitabilityTransaction,
  type PropertyInput,
} from "@/lib/calculations/profitability";

// ── Props ─────────────────────────────────────────────────────────────────────

type Props = {
  /** Alle Transaktionen der Immobilie (ungefiltert — Komponente filtert selbst) */
  transactions: ProfitabilityTransaction[];
  /** Kaufpreis und AfA-Satz aus dem Immobilien-Steckbrief */
  property: PropertyInput;
  /** Aktuelles Referenzdatum (Standard: heute) */
  today?: Date;
  loading?: boolean;
};

// ── Formatierung ──────────────────────────────────────────────────────────────

const fmtEur = (n: number, showSign = false) => {
  const abs = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.abs(n));
  if (showSign && n > 0) return `+${abs}`;
  if (n < 0) return `−${abs}`;
  return abs;
};

const fmtPct = (n: number) =>
  new Intl.NumberFormat("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n) + " %";

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function firstDayOfMonth(key: string) {
  return `${key}-01`;
}

function lastDayOfMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${key}-${String(last).padStart(2, "0")}`;
}

function prevMonths(referenceKey: string, count: number): string[] {
  const [y, m] = referenceKey.split("-").map(Number);
  const result: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    result.push(getMonthKey(d));
  }
  return result;
}

function shortMonthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", {
    month: "short",
  });
}

// ── Spekulationssteuer-Berechnung ─────────────────────────────────────────────

type SpekulationStatus = "entfallen" | "bald" | "zukunft";

function getSpekulationsInfo(kaufdatum: string, today: Date): {
  status: SpekulationStatus;
  freiDatum: Date;
  monate: number;
} {
  const kauf    = new Date(kaufdatum);
  const freiDatum = new Date(kauf);
  freiDatum.setFullYear(freiDatum.getFullYear() + 10);

  const diffMs     = freiDatum.getTime() - today.getTime();
  const monate     = Math.ceil(diffMs / (1000 * 60 * 60 * 24 * 30.44));

  const status: SpekulationStatus =
    diffMs <= 0   ? "entfallen" :
    monate <= 12  ? "bald"      : "zukunft";

  return { status, freiDatum, monate };
}

// ── Custom Tooltip ────────────────────────────────────────────────────────────

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${
        value >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
      }`}>
        {fmtEur(value, true)}
      </p>
    </div>
  );
}

// ── Kennzahl-Zeile ────────────────────────────────────────────────────────────

function KpiRow({
  label,
  value,
  sub,
  valueClass = "text-slate-900 dark:text-slate-100",
  hint,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
  hint?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-slate-600 dark:text-slate-400">{label}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
      </div>
      <div className="text-right shrink-0">
        <p className={`text-sm font-semibold tabular-nums ${valueClass}`}>{value}</p>
        {sub && <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
      </div>
    </div>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export function ProfitabilityCard({ transactions, property, today = new Date(), loading = false }: Props) {
  const currentMonthKey = getMonthKey(today);
  const currentYear     = today.getFullYear();
  const afaBasis = (property.gebaeudewert != null && property.gebaeudewert > 0)
    ? property.gebaeudewert : property.kaufpreis;

  // ── Berechnungen ────────────────────────────────────────────────────────────
  const thisMonth = useMemo(() => calculateProfitability(
    transactions, property,
    { von: firstDayOfMonth(currentMonthKey), bis: lastDayOfMonth(currentMonthKey) },
  ), [transactions, property, currentMonthKey]);

  const thisYear = useMemo(() => calculateProfitability(
    transactions, property,
    { von: `${currentYear}-01-01`, bis: `${currentYear}-12-31` },
  ), [transactions, property, currentYear]);

  // ── Trenddaten: letzte 12 Monate ────────────────────────────────────────────
  const chartData = useMemo(() => {
    const months = prevMonths(currentMonthKey, 12);
    return months.map((key) => {
      const res = calculateProfitability(
        transactions, property,
        { von: firstDayOfMonth(key), bis: lastDayOfMonth(key) },
      );
      return {
        monat: shortMonthLabel(key),
        cashflow: Math.round(res.cashflow_brutto * 100) / 100,
      };
    });
  }, [transactions, property, currentMonthKey]);

  if (loading) return <ProfitabilitySkeleton />;

  const noData = transactions.filter(
    (t) => t.category !== null && t.category !== "aufgeteilt",
  ).length === 0;

  const cfMonthClass = thisMonth.cashflow_brutto >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  const cfYearClass = thisYear.cashflow_brutto >= 0
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-red-600 dark:text-red-400";

  const taxClass = thisYear.steuerlicher_gewinn_verlust >= 0
    ? "text-slate-900 dark:text-slate-100"
    : "text-emerald-700 dark:text-emerald-400"; // Verlust = Steuervorteil → grün

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

      {/* Header */}
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100">Rentabilität</h3>
        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
          Auf Basis kategorisierter Transaktionen · AfA {fmtEur(afaBasis * property.afa_satz / 100)} p. a.
          {property.gebaeudewert ? " (Gebäudewert)" : ""}
        </p>
      </div>

      {noData ? (
        <div className="flex flex-col items-center justify-center gap-2 px-5 py-12 text-center">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-sm text-slate-400 dark:text-slate-500">Keine kategorisierten Transaktionen</p>
        </div>
      ) : (
        <>
          {/* ── Kennzahlen ──────────────────────────────────────────────────── */}
          <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">

            {/* Cashflow */}
            <div>
              <p className="pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Cashflow
              </p>
              <KpiRow
                label="Diesen Monat"
                value={fmtEur(thisMonth.cashflow_brutto, true)}
                sub={`${fmtEur(thisMonth.einnahmen)} Einnahmen · ${fmtEur(thisMonth.ausgaben)} Ausgaben`}
                valueClass={cfMonthClass}
              />
              <KpiRow
                label="Dieses Jahr"
                value={fmtEur(thisYear.cashflow_brutto, true)}
                sub={`${fmtEur(thisYear.einnahmen)} Einnahmen · ${fmtEur(thisYear.ausgaben)} Ausgaben`}
                valueClass={cfYearClass}
              />
            </div>

            {/* AfA */}
            <div>
              <p className="pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                AfA (§ 7 EStG)
              </p>
              <KpiRow
                label="Monatsanteil"
                value={fmtEur(thisMonth.afa_periodenanteil)}
                hint={`${property.afa_satz} % von ${fmtEur(afaBasis)}${property.gebaeudewert ? " (Gebäudewert)" : ""}`}
              />
              <KpiRow
                label="Jahresbetrag"
                value={fmtEur(thisYear.afa_jahresbetrag)}
              />
            </div>

            {/* Steuerliches Ergebnis */}
            <div>
              <p className="pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Steuerliches Ergebnis (Jahr)
              </p>
              <KpiRow
                label="Schuldzinsen"
                value={fmtEur(thisYear.zinsen)}
                hint="Werbungskosten Z. 35"
              />
              <KpiRow
                label="Gewinn / Verlust"
                value={fmtEur(thisYear.steuerlicher_gewinn_verlust, true)}
                sub="Cashflow − AfA"
                valueClass={taxClass}
                hint={thisYear.steuerlicher_gewinn_verlust < 0 ? "Steuerlicher Verlust — reduziert Einkommensteuer" : undefined}
              />
            </div>

            {/* Rendite */}
            <div className="pb-2">
              <p className="pt-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Rendite (annualisiert)
              </p>
              <KpiRow
                label="Brutto-Mietrendite"
                value={fmtPct(thisYear.rendite_brutto)}
                hint="Mieteinnahmen / Kaufpreis"
              />
              <KpiRow
                label="Netto-Cashflow-Rendite"
                value={fmtPct(thisYear.rendite_netto)}
                hint="Cashflow / Kaufpreis"
                valueClass={thisYear.rendite_netto >= 0
                  ? "text-slate-900 dark:text-slate-100"
                  : "text-red-600 dark:text-red-400"}
              />
            </div>
          </div>

          {/* ── Trend-Diagramm ───────────────────────────────────────────────── */}
          <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Cashflow · letzte 12 Monate
            </p>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid
                    vertical={false}
                    stroke="currentColor"
                    className="text-slate-100 dark:text-slate-800"
                  />
                  <XAxis
                    dataKey="monat"
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    className="text-slate-400 dark:text-slate-500"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "currentColor" }}
                    className="text-slate-400 dark:text-slate-500"
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: number) =>
                      Math.abs(v) >= 1000
                        ? `${(v / 1000).toFixed(0)}k`
                        : String(v)
                    }
                    width={36}
                  />
                  <ReferenceLine y={0} stroke="currentColor" className="text-slate-300 dark:text-slate-700" strokeWidth={1} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: "transparent" }} />
                  <Bar dataKey="cashflow" radius={[3, 3, 0, 0]} maxBarSize={40}>
                    {chartData.map((entry, index) => (
                      <Cell
                        key={index}
                        fill={entry.cashflow >= 0 ? "#10b981" : "#ef4444"}
                        opacity={entry.monat === shortMonthLabel(currentMonthKey) ? 1 : 0.65}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[11px] text-slate-400 dark:text-slate-500">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-emerald-500" /> Positiv
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-sm bg-red-500" /> Negativ
              </span>
              <span className="ml-auto">Aktueller Monat = volle Deckkraft</span>
            </div>
          </div>

          {/* ── Spekulationssteuer ──────────────────────────────────────────── */}
          {property.kaufdatum && (() => {
            const { status, freiDatum, monate } = getSpekulationsInfo(property.kaufdatum!, today);
            const datumFormatiert = freiDatum.toLocaleDateString("de-DE", {
              day: "2-digit", month: "2-digit", year: "numeric",
            });

            if (status === "entfallen") {
              return (
                <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-lg bg-emerald-50 px-3.5 py-3 dark:bg-emerald-950/30">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                      Spekulationssteuer bereits entfallen
                    </p>
                    <p className="mt-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                      10-Jahres-Frist abgelaufen seit {datumFormatiert} (§ 23 EStG)
                    </p>
                  </div>
                </div>
              );
            }

            if (status === "bald") {
              return (
                <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-lg bg-yellow-50 px-3.5 py-3 dark:bg-yellow-950/30">
                  <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                      Spekulationssteuer entfällt in {monate} Monat{monate !== 1 ? "en" : ""}
                    </p>
                    <p className="mt-0.5 text-xs text-yellow-700 dark:text-yellow-400">
                      Steuerfrei ab {datumFormatiert} — Verkauf vorher löst § 23 EStG aus
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div className="mx-5 mb-5 flex items-start gap-2.5 rounded-lg bg-slate-50 px-3.5 py-3 dark:bg-slate-800/50">
                <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Spekulationssteuer entfällt ab {datumFormatiert}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Noch {monate} Monate Haltefrist (§ 23 EStG)
                  </p>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function ProfitabilitySkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="h-4 w-28 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="mt-1.5 h-3 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="space-y-3 px-5 py-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex justify-between">
            <div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-4 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-5 pb-5 pt-4 dark:border-slate-800">
        <div className="mb-3 h-3 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-40 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}
