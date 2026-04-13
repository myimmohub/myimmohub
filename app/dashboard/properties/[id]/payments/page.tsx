"use client";

import { useEffect, useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type MatchStatus = "auto_matched" | "suggested" | "rejected" | "no_match" | "confirmed";

interface PaymentMatch {
  id: string;
  transaction_id: string;
  status: MatchStatus;
  period_month?: string | null;
  amount_cents: number;
  value_date: string;
  tenant?: {
    id: string;
    first_name: string;
    last_name: string;
  } | null;
  unit?: {
    id: string;
    label: string;
  } | null;
  counterparty_name?: string | null;
}

interface Transaction {
  id: string;
  amount_cents: number;
  value_date: string;
  counterparty_name?: string | null;
}

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleDateString("de-DE", {
    month: "long",
    year: "numeric",
  });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function PaymentsPage() {
  const { id } = useParams<{ id: string }>();
  const [matches, setMatches] = useState<PaymentMatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [runningMatch, setRunningMatch] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // For summary: active tenant expected rent
  const [expectedRent, setExpectedRent] = useState(0);

  useEffect(() => {
    void loadData();
  }, [id]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [matchRes] = await Promise.all([
        fetch(`/api/payment-matches?property_id=${id}`),
      ]);
      if (!matchRes.ok) throw new Error("Fehler beim Laden der Zahlungen");
      const matchData = await matchRes.json();
      setMatches(matchData);

      // Load expected rent from active tenants via supabase
      const { data: tenants } = await supabase
        .from("tenants")
        .select("cold_rent_cents, additional_costs_cents, units!inner(property_id)")
        .eq("units.property_id", id)
        .eq("status", "active");
      if (tenants) {
        const total = tenants.reduce(
          (sum: number, t: { cold_rent_cents: number; additional_costs_cents: number }) =>
            sum + t.cold_rent_cents + t.additional_costs_cents,
          0
        );
        setExpectedRent(total);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleRunMatching() {
    setRunningMatch(true);
    try {
      // Load recent unmatched transactions
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: transactions } = await supabase
        .from("transactions")
        .select("id")
        .eq("property_id", id)
        .gt("amount_cents", 0)
        .gte("value_date", ninetyDaysAgo.toISOString().split("T")[0]);

      const transactionIds = (transactions ?? []).map((t: { id: string }) => t.id);

      await fetch("/api/payment-matches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "run_matching",
          property_id: id,
          transaction_ids: transactionIds,
        }),
      });
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
        body: JSON.stringify({ match_id: matchId, status }),
      });
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, status } : m))
      );
    } catch {
      alert("Aktion fehlgeschlagen");
    } finally {
      setActionLoading(null);
    }
  }

  // Group by period_month
  const grouped = useMemo(() => {
    const map = new Map<string, PaymentMatch[]>();
    for (const match of matches) {
      const key = match.period_month ?? "Unbekannt";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(match);
    }
    // Sort descending
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [matches]);

  // Current month summary
  const currentMonth = new Date().toISOString().slice(0, 7);
  const currentMonthMatches = matches.filter(
    (m) => m.period_month === currentMonth && m.status !== "rejected"
  );
  const incomingThisMonth = currentMonthMatches.reduce((sum, m) => sum + m.amount_cents, 0);

  function renderMatchTag(match: PaymentMatch) {
    const tenantName = match.tenant
      ? `${match.tenant.first_name} ${match.tenant.last_name}`
      : null;
    const unitLabel = match.unit?.label;
    const period = match.period_month ? formatMonth(match.period_month) : null;

    switch (match.status) {
      case "auto_matched":
      case "confirmed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
            ✓ {tenantName}{unitLabel ? ` · ${unitLabel}` : ""}{period ? ` · ${period}` : ""}
          </span>
        );
      case "suggested":
        return (
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400">
              ? Vorschlag: {tenantName}?
            </span>
            <button
              disabled={actionLoading === match.id}
              onClick={() => handleStatusUpdate(match.id, "confirmed")}
              className="rounded-md bg-green-600 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-green-700 disabled:opacity-60"
            >
              Bestätigen
            </button>
            <button
              disabled={actionLoading === match.id}
              onClick={() => handleStatusUpdate(match.id, "rejected")}
              className="rounded-md border border-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-60"
            >
              Ablehnen
            </button>
          </div>
        );
      case "rejected":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-400 line-through dark:bg-slate-800 dark:text-slate-500">
            {tenantName ?? match.counterparty_name ?? "Unbekannt"}
          </span>
        );
      case "no_match":
      default:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
            Nicht zugeordnet
          </span>
        );
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Summary */}
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-wrap gap-4">
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Eingang diesen Monat
            </div>
            <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {formatEur(incomingThisMonth)}
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">Soll (Monat)</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {formatEur(expectedRent)}
            </div>
          </div>
          {expectedRent > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
              <div className="text-xs text-slate-500 dark:text-slate-400">Erfüllungsgrad</div>
              <div
                className={`mt-1 text-xl font-semibold ${
                  incomingThisMonth >= expectedRent
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              >
                {Math.round((incomingThisMonth / expectedRent) * 100)} %
              </div>
            </div>
          )}
        </div>
        <button
          onClick={handleRunMatching}
          disabled={runningMatch}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {runningMatch ? "Matching läuft…" : "Matching ausführen"}
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Noch keine Zahlungen vorhanden.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([month, monthMatches]) => (
            <div key={month}>
              <h2 className="mb-3 text-sm font-semibold text-slate-500 dark:text-slate-400">
                {month === "Unbekannt" ? "Unbekannt" : formatMonth(month)}
              </h2>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      {["Datum", "Gegenseite", "Betrag", "Zuordnung"].map((col) => (
                        <th
                          key={col}
                          className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {monthMatches.map((match) => (
                      <tr
                        key={match.id}
                        className={`transition hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                          match.status === "rejected" ? "opacity-50" : ""
                        }`}
                      >
                        <td className="whitespace-nowrap px-4 py-3 text-slate-600 dark:text-slate-400">
                          {formatDate(match.value_date)}
                        </td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                          {match.counterparty_name ?? "–"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {formatEur(match.amount_cents)}
                        </td>
                        <td className="px-4 py-3">{renderMatchTag(match)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
