"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ActiveTenant = {
  id: string;
  first_name: string;
  last_name: string;
  cold_rent_cents: number;
  additional_costs_cents: number;
  payment_reference: string | null;
  status: string;
};

type Unit = {
  id: string;
  label: string;
  unit_type: string;
  active_tenant: ActiveTenant | null;
};

type PaymentMatch = {
  id: string;
  transaction_id: string;
  unit_id: string | null;
  tenant_id: string | null;
  status: "auto_matched" | "confirmed" | "suggested" | "rejected";
  period_month: string | null; // YYYY-MM-01
  match_confidence: number;
  match_method: string;
  transactions: {
    id: string;
    amount: number;
    date: string;
    counterpart: string | null;
    description: string | null;
  } | null;
  tenants: {
    id: string;
    first_name: string;
    last_name: string;
    cold_rent_cents: number;
    additional_costs_cents: number;
    payment_reference: string | null;
  } | null;
  units: {
    id: string;
    label: string;
    unit_type: string;
  } | null;
};

type Transaction = {
  id: string;
  amount: number;
  date: string;
  counterpart: string | null;
  description: string | null;
  property_id: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const fmtEur = (eur: number) =>
  eur.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const fmtEurCents = (cents: number) =>
  (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });

function getLast6Months(): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

function getMonthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  let y = fy, m = fm;
  while (y < ty || (y === ty && m <= tm)) {
    result.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
    if (result.length > 36) break; // safety cap at 3 years
  }
  return result;
}

function getAvailableYears(): number[] {
  const cur = new Date().getFullYear();
  return Array.from({ length: 6 }, (_, i) => cur - 4 + i).reverse();
}

type PeriodMode = "month" | "year" | "custom";

/** Generates the last N months (oldest first), always including preselectedMonth. */
function getModalMonths(preselectedMonth?: string, count = 24): string[] {
  const result: string[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    result.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  if (preselectedMonth && !result.includes(preselectedMonth)) {
    // Insert in chronological order
    const idx = result.findIndex((m) => m > preselectedMonth);
    if (idx === -1) result.push(preselectedMonth);
    else result.splice(idx, 0, preselectedMonth);
  }
  return result;
}

// ── Saved mappings (counterpart → unit_id, persisted in localStorage) ────────

function mappingKey(propertyId: string) {
  return `immohub:payment_mapping:${propertyId}`;
}

function loadSavedMappings(propertyId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(mappingKey(propertyId));
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

function saveMapping(propertyId: string, counterpart: string | null | undefined, unitId: string) {
  if (typeof window === "undefined" || !counterpart?.trim()) return;
  try {
    const mappings = loadSavedMappings(propertyId);
    mappings[counterpart.toLowerCase().trim()] = unitId;
    localStorage.setItem(mappingKey(propertyId), JSON.stringify(mappings));
  } catch { /* ignore storage errors */ }
}

type MatchResult = { unitId: string; source: "saved" | "reference" | "name" | "" };

/** Find best unit for a transaction. Saved manual mappings have highest priority. */
function findBestMatchingUnit(
  tx: { counterpart: string | null; description: string | null },
  units: Unit[],
  savedMappings: Record<string, string> = {},
): MatchResult {
  const haystack = `${tx.counterpart ?? ""} ${tx.description ?? ""}`.toLowerCase();
  const counterpartNorm = (tx.counterpart ?? "").toLowerCase().trim();

  // Priority 0: exact saved mapping (learned from previous manual assignments)
  if (counterpartNorm && savedMappings[counterpartNorm]) {
    const unitId = savedMappings[counterpartNorm];
    if (units.some((u) => u.id === unitId)) return { unitId, source: "saved" };
  }

  if (!haystack.trim()) return { unitId: "", source: "" };

  // Priority 1: payment_reference exact substring
  for (const unit of units) {
    const ref = unit.active_tenant?.payment_reference?.toLowerCase();
    if (ref && ref.length > 3 && haystack.includes(ref)) return { unitId: unit.id, source: "reference" };
  }

  // Priority 2: last_name
  for (const unit of units) {
    const lastName = unit.active_tenant?.last_name?.toLowerCase();
    if (lastName && lastName.length > 2 && haystack.includes(lastName)) return { unitId: unit.id, source: "name" };
  }

  // Priority 3: first_name (weaker signal)
  for (const unit of units) {
    const firstName = unit.active_tenant?.first_name?.toLowerCase();
    if (firstName && firstName.length > 2 && haystack.includes(firstName)) return { unitId: unit.id, source: "name" };
  }

  return { unitId: "", source: "" };
}

function fmtMonthLabel(ym: string): string {
  const [year, month] = ym.split("-");
  const d = new Date(parseInt(year), parseInt(month) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}

function fmtDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Assign Modal
// ---------------------------------------------------------------------------

type AssignModalProps = {
  propertyId: string;
  units: Unit[];
  transactions: Transaction[];
  preselectedUnitId?: string;
  preselectedMonth?: string; // YYYY-MM
  preselectedTransactionId?: string;
  unitSuggestionSource?: "saved" | "reference" | "name" | "";
  onClose: () => void;
  onSuccess: (assignedCounterpart: string | null, assignedUnitId: string) => void;
};

function AssignModal({
  propertyId,
  units,
  transactions,
  preselectedUnitId,
  preselectedMonth,
  preselectedTransactionId,
  unitSuggestionSource,
  onClose,
  onSuccess,
}: AssignModalProps) {
  const months = getModalMonths(preselectedMonth);
  const defaultMonth = preselectedMonth ?? months[months.length - 1];
  const [unitId, setUnitId] = useState(preselectedUnitId ?? "");
  const [month, setMonth] = useState(defaultMonth);
  const [transactionId, setTransactionId] = useState(preselectedTransactionId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Transaction search + sort
  const [txSearch, setTxSearch] = useState("");
  const [txSort, setTxSort] = useState<"date" | "amount">("date");

  const filteredSortedTx = useMemo(() => {
    let list = [...transactions];
    if (txSearch.trim()) {
      const q = txSearch.toLowerCase();
      list = list.filter(
        (tx) =>
          (tx.counterpart ?? "").toLowerCase().includes(q) ||
          (tx.description ?? "").toLowerCase().includes(q) ||
          tx.date.includes(q),
      );
    }
    list.sort((a, b) =>
      txSort === "amount" ? b.amount - a.amount : b.date.localeCompare(a.date),
    );
    return list;
  }, [transactions, txSearch, txSort]);

  // Derive tenantId from selected unit
  const selectedUnit = units.find((u) => u.id === unitId);
  const tenantId = selectedUnit?.active_tenant?.id ?? "";

  async function handleAssign() {
    if (!unitId || !month || !transactionId || !tenantId) {
      setError("Bitte alle Felder ausfüllen.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/payment-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          transaction_id: transactionId,
          unit_id: unitId,
          tenant_id: tenantId,
          period_month: month,
          property_id: propertyId,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "Fehler beim Speichern.");
      }
      // Pass counterpart + unitId back so caller can save the mapping
      const assignedTx = transactions.find((t) => t.id === transactionId);
      onSuccess(assignedTx?.counterpart ?? null, unitId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Zahlung zuordnen
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Unit picker */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Einheit / Mieter
              </label>
              {preselectedUnitId && unitId === preselectedUnitId && unitSuggestionSource && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                  unitSuggestionSource === "saved"
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                }`}>
                  {unitSuggestionSource === "saved" ? "✓ Gelernte Zuordnung" : "Vorschlag"}
                </span>
              )}
            </div>
            <select
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className={inputClass}
            >
              <option value="">Bitte wählen…</option>
              {units
                .filter((u) => u.active_tenant)
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.label} — {u.active_tenant!.first_name} {u.active_tenant!.last_name}
                  </option>
                ))}
            </select>
          </div>

          {/* Month picker */}
          <div>
            <div className="mb-1.5 flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Monat (Mietperiode)
              </label>
              {preselectedMonth && month === preselectedMonth && (
                <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  Aus Transaktionsdatum
                </span>
              )}
            </div>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={inputClass}
            >
              {[...months].reverse().map((m) => (
                <option key={m} value={m}>
                  {fmtMonthLabel(m)} ({m})
                </option>
              ))}
            </select>
          </div>

          {/* Transaction picker */}
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Transaktion
              </label>
              <div className="flex rounded-md border border-slate-200 bg-slate-50 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                {(["date", "amount"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setTxSort(s)}
                    className={`rounded px-2 py-0.5 text-[10px] font-medium transition ${
                      txSort === s
                        ? "bg-white text-slate-800 shadow-sm dark:bg-slate-700 dark:text-slate-100"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400"
                    }`}
                  >
                    {s === "date" ? "Datum" : "Betrag"}
                  </button>
                ))}
              </div>
            </div>
            {/* Search */}
            <input
              type="text"
              placeholder="Name, Datum oder Beschreibung suchen…"
              value={txSearch}
              onChange={(e) => setTxSearch(e.target.value)}
              className="mb-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {transactions.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500">Keine Transaktionen vorhanden.</p>
              ) : filteredSortedTx.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500">Keine Treffer für „{txSearch}".</p>
              ) : (
                filteredSortedTx.map((tx) => (
                  <label
                    key={tx.id}
                    className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50 ${
                      transactionId === tx.id ? "bg-blue-50 dark:bg-blue-950/20" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="transaction"
                      value={tx.id}
                      checked={transactionId === tx.id}
                      onChange={() => setTransactionId(tx.id)}
                      className="accent-blue-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                          {tx.counterpart ?? tx.description ?? "—"}
                        </span>
                        <span className="shrink-0 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                          {fmtEur(tx.amount)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500">{fmtDate(tx.date)}</p>
                      {tx.description && tx.counterpart && (
                        <p className="truncate text-[10px] text-slate-400">{tx.description}</p>
                      )}
                    </div>
                  </label>
                ))
              )}
            </div>
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Abbrechen
          </button>
          <button
            onClick={handleAssign}
            disabled={saving || !unitId || !month || !transactionId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Speichern…" : "Zuordnen"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk Assign Modal
// ---------------------------------------------------------------------------

type BulkAssignModalProps = {
  propertyId: string;
  units: Unit[];
  transactionIds: string[];
  allTransactions: Transaction[]; // full list so we can show previews
  onClose: () => void;
  onSuccess: () => void;
  onSaveMapping: (counterpart: string | null, unitId: string) => void;
};

function BulkAssignModal({ propertyId, units, transactionIds, allTransactions, onClose, onSuccess, onSaveMapping }: BulkAssignModalProps) {
  const modalMonths = getModalMonths(undefined);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

  const [unitId, setUnitId] = useState("");
  const [autoMonth, setAutoMonth] = useState(true); // use each tx's own date as period month
  const [overrideMonth, setOverrideMonth] = useState(currentMonth);
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const selectedUnit = units.find((u) => u.id === unitId);
  const tenantId = selectedUnit?.active_tenant?.id ?? "";

  // Build preview rows: tx + resolved month
  const batchTxs = useMemo(
    () => allTransactions.filter((tx) => transactionIds.includes(tx.id))
      .sort((a, b) => a.date.localeCompare(b.date)),
    [allTransactions, transactionIds],
  );

  const rows = useMemo(
    () => batchTxs.map((tx) => ({
      tx,
      resolvedMonth: autoMonth ? tx.date.slice(0, 7) : overrideMonth,
    })),
    [batchTxs, autoMonth, overrideMonth],
  );

  // Detect month conflicts (same month appears more than once → only one can be "the" rent payment)
  const monthCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const { resolvedMonth } of rows) {
      counts[resolvedMonth] = (counts[resolvedMonth] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const conflictMonths = useMemo(
    () => new Set(Object.entries(monthCounts).filter(([, v]) => v > 1).map(([k]) => k)),
    [monthCounts],
  );

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

  async function handleBulkAssign() {
    if (!unitId || !tenantId) { setError("Bitte eine Einheit wählen."); return; }
    setSaving(true);
    setError(null);
    let failed = 0;
    for (let i = 0; i < rows.length; i++) {
      setProgress(i + 1);
      const { tx, resolvedMonth } = rows[i];
      const res = await fetch("/api/payment-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "assign",
          transaction_id: tx.id,
          unit_id: unitId,
          tenant_id: tenantId,
          period_month: resolvedMonth,
          property_id: propertyId,
        }),
      });
      if (!res.ok) failed++;
    }
    setSaving(false);
    if (failed > 0) {
      setError(`${failed} von ${rows.length} Zuordnungen fehlgeschlagen.`);
    } else {
      // Save all counterpart→unit mappings learned from this batch
      for (const { tx } of rows) {
        onSaveMapping(tx.counterpart, unitId);
      }
      onSuccess();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-900">
        {/* Header */}
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {transactionIds.length} Zahlungen zuordnen
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Wähle Einheit und Mietperiodenlogik
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <XIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Unit picker */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Einheit / Mieter
            </label>
            <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={inputClass}>
              <option value="">Bitte wählen…</option>
              {units.filter((u) => u.active_tenant).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label} — {u.active_tenant!.first_name} {u.active_tenant!.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* Month mode toggle */}
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={autoMonth}
                onChange={(e) => setAutoMonth(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
              />
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Monat automatisch aus Transaktionsdatum
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Jede Zahlung wird dem Monat zugeordnet, in dem sie eingegangen ist
                </p>
              </div>
            </label>
            {!autoMonth && (
              <div className="mt-3 border-t border-slate-100 pt-3 dark:border-slate-800">
                <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
                  Fixer Monat für alle
                </label>
                <select value={overrideMonth} onChange={(e) => setOverrideMonth(e.target.value)} className={inputClass}>
                  {[...modalMonths].reverse().map((m) => (
                    <option key={m} value={m}>{fmtMonthLabel(m)} ({m})</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Preview table */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              Vorschau Zuordnung
              {conflictMonths.size > 0 && (
                <span className="ml-2 text-amber-600 dark:text-amber-400">
                  ⚠ {conflictMonths.size} Monat{conflictMonths.size !== 1 ? "e" : ""} doppelt belegt
                </span>
              )}
            </p>
            <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {rows.map(({ tx, resolvedMonth }) => {
                const isConflict = conflictMonths.has(resolvedMonth);
                return (
                  <div
                    key={tx.id}
                    className={`flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-0 dark:border-slate-800 ${
                      isConflict ? "bg-amber-50 dark:bg-amber-950/20" : ""
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                        {tx.counterpart ?? tx.description ?? "—"}
                      </p>
                      <p className="text-[10px] text-slate-400">{fmtDate(tx.date)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        {fmtEur(tx.amount)}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        isConflict
                          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                      }`}>
                        {isConflict && "⚠ "}
                        {fmtMonthLabel(resolvedMonth)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            {conflictMonths.size > 0 && (
              <p className="mt-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                Mehrere Zahlungen im selben Monat — sie werden trotzdem gespeichert, du kannst danach korrigieren.
              </p>
            )}
          </div>

          {/* Progress */}
          {saving && (
            <div className="rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-950/30">
              <div className="mb-1 flex justify-between text-xs text-blue-700 dark:text-blue-300">
                <span>Wird zugeordnet…</span>
                <span>{progress} / {rows.length}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-200 dark:bg-blue-900">
                <div
                  className="h-full rounded-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${(progress / rows.length) * 100}%` }}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            Abbrechen
          </button>
          <button
            onClick={() => void handleBulkAssign()}
            disabled={saving || !unitId}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            {saving ? "Läuft…" : `${rows.length} zuordnen`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PaymentsPage() {
  const { id: propertyId } = useParams<{ id: string }>();

  const [units, setUnits] = useState<Unit[]>([]);
  const [matches, setMatches] = useState<PaymentMatch[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningMatch, setRunningMatch] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Assign modal state
  const [assignModal, setAssignModal] = useState<{
    preUnitId?: string;
    preMonth?: string;
    preTxId?: string;
    suggestionSource?: "saved" | "reference" | "name" | "";
  } | null>(null);

  // Multi-select for unmatched transactions
  const [selectedUnmatched, setSelectedUnmatched] = useState<Set<string>>(new Set());
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false);

  function toggleUnmatched(id: string) {
    setSelectedUnmatched((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Saved counterpart→unit mappings (from localStorage)
  const [savedMappings, setSavedMappings] = useState<Record<string, string>>({});
  useEffect(() => {
    setSavedMappings(loadSavedMappings(propertyId));
  }, [propertyId]);

  function persistMapping(counterpart: string | null, unitId: string) {
    saveMapping(propertyId, counterpart, unitId);
    setSavedMappings((prev) => {
      if (!counterpart?.trim()) return prev;
      return { ...prev, [counterpart.toLowerCase().trim()]: unitId };
    });
  }

  // ── Period picker ──────────────────────────────────────────────────────────
  const [periodMode, setPeriodMode] = useState<PeriodMode>("month");
  const [periodYear, setPeriodYear] = useState(() => new Date().getFullYear());
  const [periodMonthNum, setPeriodMonthNum] = useState(() => new Date().getMonth() + 1);
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    const from = new Date(d.getFullYear(), d.getMonth() - 5, 1);
    return `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}`;
  });
  const [customTo, setCustomTo] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const months = useMemo(() => {
    if (periodMode === "year") {
      return Array.from({ length: 12 }, (_, i) =>
        `${periodYear}-${String(i + 1).padStart(2, "0")}`,
      );
    }
    if (periodMode === "month") {
      return [`${periodYear}-${String(periodMonthNum).padStart(2, "0")}`];
    }
    // custom
    if (customFrom && customTo && customFrom <= customTo) {
      return getMonthsBetween(customFrom, customTo);
    }
    return getLast6Months();
  }, [periodMode, periodYear, periodMonthNum, customFrom, customTo]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [unitsRes, matchesRes] = await Promise.all([
        fetch(`/api/units?property_id=${propertyId}`),
        fetch(`/api/payment-matches?property_id=${propertyId}`),
      ]);

      const [unitsData, matchesData] = await Promise.all([
        unitsRes.json(),
        matchesRes.json(),
      ]);

      if (!unitsRes.ok) {
        throw new Error(`Einheiten: ${unitsData?.error ?? unitsRes.statusText}`);
      }
      if (!matchesRes.ok) {
        throw new Error(`Zahlungen: ${matchesData?.error ?? matchesRes.statusText}`);
      }

      setUnits(unitsData as Unit[]);
      setMatches(matchesData as PaymentMatch[]);

      // Load income transactions (broad window so any period selection works)
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("id, amount, date, counterpart, description, property_id")
        .eq("property_id", propertyId)
        .gt("amount", 0)
        .order("date", { ascending: false })
        .limit(500);

      if (txError) throw new Error(txError.message);
      setTransactions((txData ?? []) as Transaction[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // ---------------------------------------------------------------------------
  // Matrix data
  // ---------------------------------------------------------------------------

  const unitsWithTenant = useMemo(
    () => units.filter((u) => u.active_tenant !== null),
    [units],
  );

  const matrix = useMemo<Array<{ unit: Unit; cells: Array<{ month: string; cell: CellData }> }>>(() => {
    return unitsWithTenant.map((unit) => {
      const cells = months.map((ym) => {
        const match = matches.find(
          (m) =>
            m.unit_id === unit.id &&
            m.period_month?.startsWith(ym) &&
            m.status !== "rejected",
        );

        if (match) {
          return { month: ym, cell: { kind: "matched" as const, match } };
        }

        const tenant = unit.active_tenant!;
        const expectedEur = (tenant.cold_rent_cents + (tenant.additional_costs_cents ?? 0)) / 100;
        return { month: ym, cell: { kind: "missing" as const, expectedEur } };
      });

      return { unit, cells };
    });
  }, [unitsWithTenant, months, matches]);

  // ---------------------------------------------------------------------------
  // Unmatched transactions (no confirmed/auto_matched match)
  // ---------------------------------------------------------------------------

  const confirmedTxIds = useMemo(
    () =>
      new Set(
        matches
          .filter((m) => m.status === "confirmed" || m.status === "auto_matched")
          .map((m) => m.transaction_id),
      ),
    [matches],
  );

  // Date range for the currently selected period
  const periodDateRange = useMemo(() => {
    if (months.length === 0) return { from: "", to: "" };
    const firstMonth = months[0];
    const lastMonth = months[months.length - 1];
    const [ly, lm] = lastMonth.split("-").map(Number);
    const lastDay = new Date(ly, lm, 0).getDate();
    return {
      from: `${firstMonth}-01`,
      to: `${lastMonth}-${String(lastDay).padStart(2, "0")}`,
    };
  }, [months]);

  const unmatchedTransactions = useMemo(
    () =>
      transactions.filter(
        (tx) =>
          !confirmedTxIds.has(tx.id) &&
          tx.date >= periodDateRange.from &&
          tx.date <= periodDateRange.to,
      ),
    [transactions, confirmedTxIds, periodDateRange],
  );

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  async function handleRunMatching() {
    setRunningMatch(true);
    try {
      const res = await fetch("/api/payment-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "run_matching", property_id: propertyId }),
      });
      if (!res.ok) throw new Error("Matching fehlgeschlagen");
      await loadData();
    } catch {
      alert("Matching fehlgeschlagen");
    } finally {
      setRunningMatch(false);
    }
  }

  async function handleStatusUpdate(matchId: string, status: "confirmed" | "rejected") {
    setActionLoading(matchId);
    try {
      await fetch("/api/payment-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_status", match_id: matchId, status }),
      });
      await loadData();
    } catch {
      alert("Aktion fehlgeschlagen");
    } finally {
      setActionLoading(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Mietzahlungen & Rückstände
          </h1>
          {/* Period picker */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Mode tabs */}
            <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
              {(["month", "year", "custom"] as PeriodMode[]).map((m) => (
                <button
                  key={m}
                  onClick={() => setPeriodMode(m)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    periodMode === m
                      ? "bg-blue-600 text-white"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  {m === "month" ? "Monat" : m === "year" ? "Jahr" : "Eigener Zeitraum"}
                </button>
              ))}
            </div>

            {/* Month mode */}
            {periodMode === "month" && (
              <>
                <select
                  value={periodMonthNum}
                  onChange={(e) => setPeriodMonthNum(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {["Januar","Februar","März","April","Mai","Juni","Juli","August","September","Oktober","November","Dezember"].map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
                <select
                  value={periodYear}
                  onChange={(e) => setPeriodYear(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {getAvailableYears().map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </>
            )}

            {/* Year mode */}
            {periodMode === "year" && (
              <select
                value={periodYear}
                onChange={(e) => setPeriodYear(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
              >
                {getAvailableYears().map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}

            {/* Custom mode */}
            {periodMode === "custom" && (
              <div className="flex items-center gap-2">
                <input
                  type="month"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
                <span className="text-sm text-slate-400">–</span>
                <input
                  type="month"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        </div>
        <button
          onClick={handleRunMatching}
          disabled={runningMatch}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {runningMatch ? (
            <>
              <SpinnerIcon className="h-4 w-4 animate-spin" />
              Matching läuft…
            </>
          ) : (
            <>
              <PlayIcon className="h-4 w-4" />
              Matching ausführen
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400">
          {error}
        </div>
      )}

      {/* Section 1: Matrix */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Mietrückstandsübersicht
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {months.length === 1
              ? `${fmtMonthLabel(months[0])} — Status pro Einheit`
              : `${fmtMonthLabel(months[0])} – ${fmtMonthLabel(months[months.length - 1])} · ${months.length} Monate`}
          </p>
        </div>

        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : unitsWithTenant.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
            Keine aktiven Mietverhältnisse gefunden.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 min-w-[200px]">
                    Einheit / Mieter
                  </th>
                  {months.map((m) => (
                    <th
                      key={m}
                      className="px-3 py-3 text-center text-xs font-medium text-slate-500 dark:text-slate-400 min-w-[120px]"
                    >
                      {fmtMonthLabel(m)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {matrix.map(({ unit, cells }) => (
                  <tr key={unit.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <HomeIcon className="h-4 w-4 shrink-0 text-slate-400" />
                        <div>
                          <p className="font-medium text-slate-900 dark:text-slate-100">
                            {unit.label}
                          </p>
                          <p className="text-xs text-slate-500">
                            {unit.active_tenant!.first_name} {unit.active_tenant!.last_name}
                          </p>
                        </div>
                      </div>
                    </td>
                    {cells.map(({ month, cell }) => (
                      <td key={month} className="px-3 py-3 text-center">
                        <MatrixCell
                          cell={cell}
                          month={month}
                          unit={unit}
                          actionLoading={actionLoading}
                          onConfirm={(matchId) => handleStatusUpdate(matchId, "confirmed")}
                          onReject={(matchId) => handleStatusUpdate(matchId, "rejected")}
                          onAssign={() =>
                            setAssignModal({ preUnitId: unit.id, preMonth: month })
                          }
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Section 2: Unmatched transactions */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Nicht zugeordnete Eingänge
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Eingehende Zahlungen im gewählten Zeitraum ohne bestätigte Zuordnung
          </p>
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
            ))}
          </div>
        ) : unmatchedTransactions.length === 0 ? (
          <div className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            Alle Eingänge sind zugeordnet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  {/* Select-all checkbox */}
                  <th className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-slate-300 text-blue-600 dark:border-slate-600"
                      checked={
                        unmatchedTransactions.length > 0 &&
                        unmatchedTransactions.every((tx) => selectedUnmatched.has(tx.id))
                      }
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedUnmatched(new Set(unmatchedTransactions.map((tx) => tx.id)));
                        } else {
                          setSelectedUnmatched(new Set());
                        }
                      }}
                    />
                  </th>
                  {["Datum", "Gegenseite", "Betrag", "Verwendungszweck", ""].map((col, i) => (
                    <th key={i} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {unmatchedTransactions.map((tx) => {
                  const isSelected = selectedUnmatched.has(tx.id);
                  // Find other transactions with the same counterpart for "select similar"
                  const similarCount = unmatchedTransactions.filter(
                    (t) => t.id !== tx.id && t.counterpart && t.counterpart === tx.counterpart,
                  ).length;

                  return (
                    <tr
                      key={tx.id}
                      className={`transition ${isSelected ? "bg-blue-50/60 dark:bg-blue-950/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/30"}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-blue-600 dark:border-slate-600"
                          checked={isSelected}
                          onChange={() => toggleUnmatched(tx.id)}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                        {fmtDate(tx.date)}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {tx.counterpart ?? "—"}
                        </p>
                        {similarCount > 0 && (
                          <button
                            onClick={() => {
                              // Select all with same counterpart
                              setSelectedUnmatched((prev) => {
                                const next = new Set(prev);
                                unmatchedTransactions
                                  .filter((t) => t.counterpart === tx.counterpart)
                                  .forEach((t) => next.add(t.id));
                                return next;
                              });
                            }}
                            className="mt-0.5 text-[10px] text-blue-500 underline-offset-2 hover:underline dark:text-blue-400"
                          >
                            + {similarCount} ähnliche auswählen
                          </button>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                        {fmtEur(tx.amount)}
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                        {tx.description ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => {
                            const preMonth = tx.date.slice(0, 7);
                            const match = findBestMatchingUnit(tx, unitsWithTenant, savedMappings);
                            setAssignModal({ preTxId: tx.id, preMonth, preUnitId: match.unitId || undefined, suggestionSource: match.source });
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-700 dark:hover:text-blue-400"
                        >
                          Zuordnen
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Sticky bulk action bar */}
      {selectedUnmatched.size > 0 && (
        <div className="sticky bottom-4 z-20 rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-lg dark:border-blue-800/50 dark:bg-blue-950/80">
          <div className="flex flex-wrap items-center gap-3">
            <span className="rounded-full bg-blue-200 px-2.5 py-0.5 text-sm font-bold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
              {selectedUnmatched.size}
            </span>
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Zahlung{selectedUnmatched.size !== 1 ? "en" : ""} ausgewählt
            </span>
            <button
              onClick={() => setSelectedUnmatched(new Set())}
              className="text-xs text-blue-500 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
            >
              Auswahl aufheben
            </button>
            <div className="ml-auto">
              <button
                onClick={() => setBulkAssignOpen(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Alle zuordnen…
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assignModal && (
        <AssignModal
          propertyId={propertyId}
          units={units}
          transactions={transactions}
          preselectedUnitId={assignModal.preUnitId}
          preselectedMonth={assignModal.preMonth}
          preselectedTransactionId={assignModal.preTxId}
          unitSuggestionSource={assignModal.suggestionSource}
          onClose={() => setAssignModal(null)}
          onSuccess={async (counterpart, unitId) => {
            persistMapping(counterpart, unitId);
            setAssignModal(null);
            await loadData();
          }}
        />
      )}

      {/* Bulk assign modal */}
      {bulkAssignOpen && (
        <BulkAssignModal
          propertyId={propertyId}
          units={units}
          transactionIds={Array.from(selectedUnmatched)}
          allTransactions={transactions}
          onClose={() => setBulkAssignOpen(false)}
          onSaveMapping={persistMapping}
          onSuccess={async () => {
            setBulkAssignOpen(false);
            setSelectedUnmatched(new Set());
            await loadData();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Matrix cell
// ---------------------------------------------------------------------------

type CellData =
  | { kind: "matched"; match: PaymentMatch }
  | { kind: "missing"; expectedEur: number }
  | { kind: "no_tenant" };

function MatrixCell({
  cell,
  unit,
  month,
  actionLoading,
  onConfirm,
  onReject,
  onAssign,
}: {
  cell: CellData;
  unit: Unit;
  month: string;
  actionLoading: string | null;
  onConfirm: (matchId: string) => void;
  onReject: (matchId: string) => void;
  onAssign: () => void;
}) {
  void unit; // used by parent caller context
  void month;

  if (cell.kind === "no_tenant") {
    return <span className="text-xs text-slate-300 dark:text-slate-700">—</span>;
  }

  if (cell.kind === "missing") {
    return (
      <button
        onClick={onAssign}
        title="Zahlung manuell zuordnen"
        className="inline-flex flex-col items-center gap-0.5 rounded-lg bg-red-100 px-2 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
      >
        <span>✗ {(cell.expectedEur).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</span>
        <span className="text-[10px] font-normal opacity-75">fehlt</span>
      </button>
    );
  }

  const { match } = cell;
  const amountEur = match.transactions?.amount ?? 0;

  if (match.status === "confirmed" || match.status === "auto_matched") {
    return (
      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        ✓ {fmtEur(amountEur)}
      </span>
    );
  }

  if (match.status === "suggested") {
    return (
      <div className="flex flex-col items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-lg bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
          ⚠ {fmtEur(amountEur)}
        </span>
        <div className="flex gap-1">
          <button
            disabled={actionLoading === match.id}
            onClick={() => onConfirm(match.id)}
            className="rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            ✓
          </button>
          <button
            disabled={actionLoading === match.id}
            onClick={() => onReject(match.id)}
            className="rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ✗
          </button>
        </div>
      </div>
    );
  }

  return <span className="text-xs text-slate-400">—</span>;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}

function PlayIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
    </svg>
  );
}

function SpinnerIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

// suppress unused import warning
void fmtEurCents;
