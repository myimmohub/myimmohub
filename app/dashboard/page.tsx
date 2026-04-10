"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type PropertyRecord = {
  id: string;
  name: string;
  address: string;
};

type TransactionRecord = {
  id: string;
  date: string;
  amount: number;
  property_id: string | null;
};

const fmtEur = (value: number) =>
  value.toLocaleString("de-DE", { style: "currency", currency: "EUR" });

const monthKey = new Date().toISOString().slice(0, 7);
const yearKey = new Date().getFullYear().toString();

export default function DashboardPage() {
  const [displayName, setDisplayName] = useState("—");
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [profitMode, setProfitMode] = useState<"month" | "year">("month");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const nameFromMetadata =
        (user.user_metadata?.full_name as string | undefined) ??
        (user.user_metadata?.name as string | undefined) ??
        user.email?.split("@")[0] ??
        "—";
      setDisplayName(nameFromMetadata);

      const [{ data: propertyData, error: propertyError }, { data: txData, error: txError }] = await Promise.all([
        supabase
          .from("properties")
          .select("id, name, address")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("transactions")
          .select("id, date, amount, property_id")
          .eq("user_id", user.id)
          .or("category.is.null,category.neq.aufgeteilt"),
      ]);

      if (propertyError || txError) {
        setError(propertyError?.message ?? txError?.message ?? "Dashboard konnte nicht geladen werden.");
      }

      setProperties((propertyData ?? []) as PropertyRecord[]);
      setTransactions((txData ?? []) as TransactionRecord[]);
      setIsLoading(false);
    };

    void load();
  }, []);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Guten Morgen";
    if (hour < 18) return "Guten Tag";
    return "Guten Abend";
  }, []);

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("de-DE", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    [],
  );

  const monthTransactions = useMemo(
    () => transactions.filter((tx) => tx.date.slice(0, 7) === monthKey),
    [transactions],
  );

  const monthIncome = monthTransactions
    .filter((tx) => Number(tx.amount) > 0)
    .reduce((sum, tx) => sum + Number(tx.amount), 0);
  const monthExpenses = monthTransactions
    .filter((tx) => Number(tx.amount) < 0)
    .reduce((sum, tx) => sum + Math.abs(Number(tx.amount)), 0);
  const monthCashflow = monthIncome - monthExpenses;

  const propertyCashflows = useMemo(() => {
    const byProperty = new Map<string, number>();
    for (const tx of monthTransactions) {
      if (!tx.property_id) continue;
      byProperty.set(tx.property_id, (byProperty.get(tx.property_id) ?? 0) + Number(tx.amount));
    }
    return byProperty;
  }, [monthTransactions]);

  const chartData = useMemo(() => {
    return properties.map((property) => {
      const annualTransactions = transactions.filter(
        (tx) => tx.property_id === property.id && tx.date.startsWith(yearKey),
      );
      const annualCashflow = annualTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0);
      return {
        name: property.name,
        cashflow: Math.round(annualCashflow * 100) / 100,
      };
    });
  }, [properties, transactions]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-6xl space-y-8">
        <header className="space-y-2">
          {isLoading ? (
            <>
              <div className="h-8 w-72 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
              <div className="h-4 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            </>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {greeting}, {displayName}
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">{todayLabel}</p>
            </>
          )}
        </header>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <KpiCard label="Einnahmen" value={monthIncome} tone={monthIncome === 0 ? "neutral" : "positive"} />
          <KpiCard label="Ausgaben" value={monthExpenses} tone={monthExpenses === 0 ? "neutral" : "negative"} />
          <KpiCard label="Cashflow" value={monthCashflow} tone={monthCashflow === 0 ? "neutral" : monthCashflow > 0 ? "positive" : "negative"} />
        </div>

        <section className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Deine Immobilien</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Direkter Einstieg in Steckbrief, Dokumente und Steuerdaten.</p>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              <PlusIcon className="h-4 w-4" />
              Hinzufügen
            </Link>
          </div>

          {isLoading ? (
            <div className="grid gap-3 md:grid-cols-2">
              {[1, 2].map((item) => (
                <div key={item} className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
              ))}
            </div>
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <BuildingIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">Noch keine Immobilie angelegt</p>
                <p className="mt-1 text-sm text-slate-500">Lege dein erstes Objekt an und starte mit Dokumenten, Banking und Steuerdaten.</p>
              </div>
              <Link
                href="/onboarding"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                <PlusIcon className="h-4 w-4" />
                Erste Immobilie anlegen
              </Link>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {properties.map((property) => {
                const cashflow = propertyCashflows.get(property.id) ?? 0;
                const toneClass = cashflow === 0
                  ? "text-slate-400 dark:text-slate-500"
                  : cashflow > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400";

                return (
                  <Link
                    key={property.id}
                    href={`/dashboard/properties/${property.id}/overview`}
                    className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div>
                      <p className="font-medium text-slate-900 dark:text-slate-100">{property.name}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{property.address || "—"}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-semibold tabular-nums ${toneClass}`}>
                        {cashflow === 0 ? "—" : fmtEur(cashflow)}
                      </p>
                      <p className="text-xs text-slate-400">Cashflow Apr</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Profitabilität</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Monatsübersicht oder Jahresvergleich deiner Objekte.</p>
            </div>
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 p-1 dark:border-slate-800 dark:bg-slate-800/50">
              {(["month", "year"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setProfitMode(mode)}
                  className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                    profitMode === mode
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {mode === "month" ? "Monat" : "Jahr"}
                </button>
              ))}
            </div>
          </div>

          {profitMode === "month" ? (
            <div className="mt-6 rounded-lg bg-slate-50 px-4 py-5 dark:bg-slate-800/50">
              <p className="text-sm text-slate-500 dark:text-slate-400">Die Chart-Ansicht ist im Jahresmodus verfügbar.</p>
            </div>
          ) : isLoading ? (
            <div className="mt-6 h-72 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          ) : chartData.length === 0 ? (
            <div className="mt-6 flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <ChartIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">Noch keine Jahresdaten vorhanden</p>
                <p className="mt-1 text-sm text-slate-500">Sobald Buchungen vorliegen, erscheint hier dein Jahresvergleich.</p>
              </div>
            </div>
          ) : (
            <div className="mt-6 h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(value) => `${Math.round(value)} €`} tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(148, 163, 184, 0.08)" }}
                    formatter={(value) => fmtEur(Number(value ?? 0))}
                    contentStyle={{ borderRadius: 12, borderColor: "#e2e8f0" }}
                  />
                  <Bar dataKey="cashflow" radius={[8, 8, 0, 0]} fill="#2563eb" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function KpiCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "positive" | "negative" | "neutral";
}) {
  const toneClass = tone === "positive"
    ? "text-emerald-600 dark:text-emerald-400"
    : tone === "negative"
      ? "text-red-600 dark:text-red-400"
      : "text-slate-400 dark:text-slate-500";

  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Aktueller Monat · {label}</p>
      <p className={`mt-1 text-xl font-semibold tabular-nums ${toneClass}`}>
        {value === 0 ? "0,00 €" : fmtEur(value)}
      </p>
    </div>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 18h14a1 1 0 100-2h-1V4a2 2 0 00-2-2H6a2 2 0 00-2 2v12H3a1 1 0 100 2zm3-4h2v2H6v-2zm0-4h2v2H6v-2zm0-4h2v2H6V6zm6 8h2v2h-2v-2zm0-4h2v2h-2v-2zm0-4h2v2h-2V6z" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  );
}
