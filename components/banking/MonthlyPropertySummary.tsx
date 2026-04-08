"use client";

import { useMemo } from "react";
import {
  ANLAGE_V_ZEILEN,
  type AnlageVCategory,
} from "@/lib/banking/categorizeTransaction";
import type { CategoryLookup } from "@/lib/banking/categoryLookup";

// ── Typen ─────────────────────────────────────────────────────────────────────

export type SummaryTransaction = {
  id: string;
  date: string;
  amount: number;
  category: string | null;
  is_confirmed: boolean;
  property_id: string | null;
};

type Props = {
  /** Anzuzeigende Transaktionen (bereits gefiltert auf Immobilie wenn gewünscht,
   *  oder alle — die Komponente filtert selbst nach propertyId) */
  transactions: SummaryTransaction[];
  /** Supabase-ID der Immobilie (null = alle Immobilien zusammen) */
  propertyId: string | null;
  /** Name der Immobilie für die Überschrift */
  propertyName: string;
  /** Monat als "YYYY-MM" */
  month: string;
  /** Ob ein Skeleton-Loader angezeigt werden soll */
  loading?: boolean;
  /** Kategorie-Lookup aus der DB (optional — Fallback auf alte Konstanten) */
  catLookup?: CategoryLookup | null;
};

// ── Kategorie-Gruppen ─────────────────────────────────────────────────────────

// Old slugs for backward compatibility
const OLD_EINNAHMEN_SET = new Set<string>([
  "miete_einnahmen_wohnen", "miete_einnahmen_gewerbe",
  "nebenkosten_einnahmen", "mietsicherheit_einnahme", "sonstige_einnahmen",
]);

function isEinnahme(cat: string, catLookup?: CategoryLookup | null): boolean {
  if (catLookup) {
    const dbCat = catLookup.byLabel.get(cat);
    if (dbCat) return dbCat.typ === "einnahme";
  }
  return OLD_EINNAHMEN_SET.has(cat);
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

const fmt = (n: number, showPlus = false) => {
  const s = new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(Math.abs(n));
  if (showPlus && n > 0) return `+${s}`;
  if (n < 0) return `−${s}`; // typografisches Minus
  return s;
};

function getMonthKey(iso: string) {
  return iso.slice(0, 7);
}

function prevMonthKey(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (m === 1) return `${y - 1}-12`;
  return `${y}-${String(m - 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

// ── Aggregations-Hook ─────────────────────────────────────────────────────────

function useSummary(transactions: SummaryTransaction[], propertyId: string | null, month: string, catLookup?: CategoryLookup | null) {
  return useMemo(() => {
    const inMonth = transactions.filter((t) => {
      if (propertyId && t.property_id !== propertyId) return false;
      return getMonthKey(t.date) === month;
    });

    const prev = prevMonthKey(month);
    const inPrev = transactions.filter((t) => {
      if (propertyId && t.property_id !== propertyId) return false;
      return getMonthKey(t.date) === prev;
    });

    function aggregate(txs: SummaryTransaction[]) {
      let einnahmen = 0;
      const ausgaben: Record<string, number> = {};
      let ausgabenTotal = 0;

      for (const tx of txs) {
        const cat = tx.category;
        const amount = Number(tx.amount);
        if (!cat) continue;
        if (isEinnahme(cat, catLookup)) {
          einnahmen += amount;
        } else {
          ausgaben[cat] = (ausgaben[cat] ?? 0) + Math.abs(amount);
          ausgabenTotal += Math.abs(amount);
        }
      }

      return { einnahmen, ausgaben, ausgabenTotal, cashflow: einnahmen - ausgabenTotal };
    }

    return {
      current: aggregate(inMonth),
      previous: aggregate(inPrev),
      txCount: inMonth.length,
      hasPrev: inPrev.length > 0,
    };
  }, [transactions, propertyId, month, catLookup]);
}

// ── Komponente ────────────────────────────────────────────────────────────────

export function MonthlyPropertySummary({
  transactions,
  propertyId,
  propertyName,
  month,
  loading = false,
  catLookup,
}: Props) {
  const { current, previous, hasPrev } = useSummary(transactions, propertyId, month, catLookup);

  const cashflowDelta = current.cashflow - previous.cashflow;
  const cashflowUp    = cashflowDelta > 0;
  const cashflowSame  = Math.abs(cashflowDelta) < 0.01;

  // Build ausgaben rows from actual data
  const ausgabenRows = Object.entries(current.ausgaben)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, amount]) => {
      const dbCat = catLookup?.byLabel.get(cat);
      const anlageV = dbCat?.anlage_v ?? (ANLAGE_V_ZEILEN[cat as AnlageVCategory] ? `Z. ${ANLAGE_V_ZEILEN[cat as AnlageVCategory]}` : null);
      const isDeductible = dbCat ? dbCat.typ === "ausgabe" : !["tilgung_kredit", "mietsicherheit_ausgabe", "sonstiges_nicht_absetzbar"].includes(cat);
      const label = dbCat ? `${dbCat.icon} ${dbCat.label}` : cat;
      return { key: cat, label, amount, anlageV, isDeductible };
    });

  if (loading) return <SummarySkeleton />;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">

      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100">{propertyName}</h3>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{monthLabel(month)}</p>
        </div>

        {/* Cashflow-Badge mit Vormonatsvergleich */}
        <div className="text-right">
          <p className={`text-lg font-bold tabular-nums ${
            current.cashflow >= 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-red-600 dark:text-red-400"
          }`}>
            {fmt(current.cashflow, true)}
          </p>
          {hasPrev && !cashflowSame && (
            <div className={`mt-0.5 flex items-center justify-end gap-0.5 text-xs font-medium ${
              cashflowUp ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
            }`}>
              {cashflowUp ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M14.707 10.293a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 12.586V5a1 1 0 012 0v7.586l2.293-2.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              )}
              <span>{fmt(Math.abs(cashflowDelta))} ggü. Vormonat</span>
            </div>
          )}
          {hasPrev && cashflowSame && (
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">= Vormonat</p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="divide-y divide-slate-100 dark:divide-slate-800">

        {/* Einnahmen-Block */}
        <div className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Einnahmen
          </p>
          {current.einnahmen === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Keine Einnahmen</p>
          ) : (
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-700 dark:text-slate-300">Mieteinnahmen gesamt</span>
              <span className="tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                {fmt(current.einnahmen)}
              </span>
            </div>
          )}
          {hasPrev && current.einnahmen !== 0 && (
            <PrevMonthDelta current={current.einnahmen} previous={previous.einnahmen} higherIsBetter />
          )}
        </div>

        {/* Ausgaben-Block */}
        <div className="px-5 py-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Ausgaben
          </p>
          {ausgabenRows.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500">Keine Ausgaben</p>
          ) : (
            <div className="space-y-2">
              {ausgabenRows.map(({ key, label, amount, anlageV, isDeductible }) => {
                const prevAmount = previous.ausgaben[key] ?? 0;

                return (
                  <div key={key}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-sm text-slate-700 dark:text-slate-300">{label}</span>
                        {anlageV && isDeductible && (
                          <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-500 dark:bg-blue-950/40 dark:text-blue-400">
                            {anlageV}
                          </span>
                        )}
                        {!isDeductible && (
                          <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                            nicht abs.
                          </span>
                        )}
                      </div>
                      <span className="shrink-0 tabular-nums text-sm font-medium text-red-600 dark:text-red-400">
                        {fmt(amount)}
                      </span>
                    </div>
                    {hasPrev && prevAmount > 0 && (
                      <PrevMonthDelta current={-amount} previous={-prevAmount} higherIsBetter={false} compact />
                    )}
                  </div>
                );
              })}

              {/* Ausgaben-Summe */}
              <div className="flex items-center justify-between border-t border-slate-100 pt-2 dark:border-slate-800">
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Gesamt Ausgaben</span>
                <span className="tabular-nums text-sm font-bold text-red-600 dark:text-red-400">
                  {fmt(current.ausgabenTotal)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Cashflow-Zeile */}
        <div className="flex items-center justify-between px-5 py-4">
          <div>
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Cashflow</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Einnahmen − Ausgaben</p>
          </div>
          <div className="text-right">
            <p className={`tabular-nums text-base font-bold ${
              current.cashflow >= 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}>
              {fmt(current.cashflow, true)}
            </p>
            {hasPrev && !cashflowSame && (
              <div className={`mt-0.5 flex items-center justify-end gap-0.5 text-xs ${
                cashflowUp ? "text-emerald-500" : "text-red-500"
              }`}>
                {cashflowUp ? "▲" : "▼"}{" "}
                {fmt(Math.abs(cashflowDelta))} vs. Vormonat
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}

// ── Vormonats-Delta ───────────────────────────────────────────────────────────

function PrevMonthDelta({
  current,
  previous,
  higherIsBetter,
  compact = false,
}: {
  current: number;
  previous: number;
  higherIsBetter: boolean;
  compact?: boolean;
}) {
  const delta = current - previous;
  if (Math.abs(delta) < 0.01) return null;

  const positive = delta > 0;
  const good     = higherIsBetter ? positive : !positive;

  return (
    <div className={`${compact ? "mt-0.5 text-right" : "mt-1"} flex ${compact ? "justify-end" : ""} items-center gap-1 text-[11px] font-medium ${
      good ? "text-emerald-500 dark:text-emerald-400" : "text-red-500 dark:text-red-400"
    }`}>
      <span>{positive ? "▲" : "▼"}</span>
      <span>
        {fmt(Math.abs(delta))} {positive ? "mehr" : "weniger"} als Vormonat
      </span>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SummarySkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="space-y-1.5">
          <div className="h-4 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="h-3 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
        <div className="h-7 w-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      {[1, 2, 3].map((i) => (
        <div key={i} className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          <div className="space-y-2">
            {Array.from({ length: i === 2 ? 4 : 1 }).map((_, j) => (
              <div key={j} className="flex justify-between">
                <div className="h-4 w-36 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                <div className="h-4 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
