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
  onClose: () => void;
  onSuccess: () => void;
};

function AssignModal({
  propertyId,
  units,
  transactions,
  preselectedUnitId,
  preselectedMonth,
  preselectedTransactionId,
  onClose,
  onSuccess,
}: AssignModalProps) {
  const months = getLast6Months();
  const [unitId, setUnitId] = useState(preselectedUnitId ?? "");
  const [month, setMonth] = useState(preselectedMonth ?? months[months.length - 1]);
  const [transactionId, setTransactionId] = useState(preselectedTransactionId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      onSuccess();
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
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Einheit
            </label>
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
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Monat (Mietperiode)
            </label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className={inputClass}
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {fmtMonthLabel(m)} ({m})
                </option>
              ))}
            </select>
          </div>

          {/* Transaction picker */}
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600 dark:text-slate-400">
              Transaktion
            </label>
            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
              {transactions.length === 0 ? (
                <p className="px-3 py-3 text-sm text-slate-500">Keine Transaktionen vorhanden.</p>
              ) : (
                transactions.map((tx) => (
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
  } | null>(null);

  const months = useMemo(() => getLast6Months(), []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [unitsRes, matchesRes] = await Promise.all([
        fetch(`/api/units?property_id=${propertyId}`),
        fetch(`/api/payment-matches?property_id=${propertyId}`),
      ]);

      if (!unitsRes.ok || !matchesRes.ok) {
        throw new Error("Fehler beim Laden der Daten");
      }

      const [unitsData, matchesData] = await Promise.all([
        unitsRes.json(),
        matchesRes.json(),
      ]);

      setUnits(unitsData as Unit[]);
      setMatches(matchesData as PaymentMatch[]);

      // Load recent income transactions via supabase client
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("id, amount, date, counterpart, description, property_id")
        .eq("property_id", propertyId)
        .gt("amount", 0)
        .order("date", { ascending: false })
        .limit(60);

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

  type CellData =
    | { kind: "matched"; match: PaymentMatch }
    | { kind: "missing"; expectedEur: number }
    | { kind: "no_tenant" };

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

  const unmatchedTransactions = useMemo(
    () => transactions.filter((tx) => !confirmedTxIds.has(tx.id)),
    [transactions, confirmedTxIds],
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
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Mietzahlungen & Rückstände
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Übersicht der letzten 6 Monate
          </p>
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
            Status pro Einheit und Monat
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
            Eingehende Zahlungen ohne bestätigte Zuordnung
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
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {["Datum", "Gegenseite", "Betrag", "Verwendungszweck", ""].map((col, i) => (
                    <th
                      key={i}
                      className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {unmatchedTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                      {fmtDate(tx.date)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
                      {tx.counterpart ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold text-emerald-600 dark:text-emerald-400">
                      {fmtEur(tx.amount)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-[200px] truncate">
                      {tx.description ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() =>
                          setAssignModal({ preTxId: tx.id })
                        }
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-blue-300 hover:text-blue-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-blue-700 dark:hover:text-blue-400"
                      >
                        Zuordnen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Assign modal */}
      {assignModal && (
        <AssignModal
          propertyId={propertyId}
          units={units}
          transactions={transactions}
          preselectedUnitId={assignModal.preUnitId}
          preselectedMonth={assignModal.preMonth}
          preselectedTransactionId={assignModal.preTxId}
          onClose={() => setAssignModal(null)}
          onSuccess={async () => {
            setAssignModal(null);
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
