"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type TenantStatus = "active" | "notice_given" | "ended";
type FilterType = "all" | "active" | "notice_given" | "ended";

interface Tenant {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  lease_start: string;
  lease_end?: string | null;
  cold_rent_cents: number;
  additional_costs_cents: number;
  status: TenantStatus;
  unit?: {
    id: string;
    label: string;
  } | null;
}

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

const STATUS_CONFIG: Record<
  TenantStatus,
  { label: string; className: string }
> = {
  active: {
    label: "Aktiv",
    className:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  },
  notice_given: {
    label: "Gekündigt",
    className:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
  },
  ended: {
    label: "Beendet",
    className:
      "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  },
};

const FILTER_LABELS: Record<FilterType, string> = {
  all: "Alle",
  active: "Aktiv",
  notice_given: "Gekündigt",
  ended: "Beendet",
};

export default function TenantsPage() {
  const { id } = useParams<{ id: string }>();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function loadTenants() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tenants?property_id=${id}`);
        if (!res.ok) throw new Error("Fehler beim Laden der Mieter");
        const data = await res.json();
        setTenants(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unbekannter Fehler");
      } finally {
        setLoading(false);
      }
    }
    void loadTenants();
  }, [id]);

  const filtered = useMemo(() => {
    return tenants.filter((t) => {
      const matchesFilter = filter === "all" || t.status === filter;
      const fullName = `${t.first_name} ${t.last_name}`.toLowerCase();
      const matchesSearch = search === "" || fullName.includes(search.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [tenants, filter, search]);

  const activeTenants = tenants.filter((t) => t.status === "active");
  const totalMonthlyIncome = activeTenants.reduce(
    (sum, t) => sum + t.cold_rent_cents + t.additional_costs_cents,
    0
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Summary */}
      <div className="mb-6 flex flex-wrap gap-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Aktive Mieter</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {activeTenants.length}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="text-xs text-slate-500 dark:text-slate-400">Monatliche Einnahmen</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
            {formatEur(totalMonthlyIncome)}
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900">
          {(["all", "active", "notice_given", "ended"] as FilterType[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                filter === f
                  ? "bg-blue-600 text-white"
                  : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {FILTER_LABELS[f]}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Name suchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="h-12 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {search || filter !== "all"
              ? "Keine Mieter gefunden."
              : "Noch keine Mieter vorhanden."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  {[
                    "Mieter",
                    "Einheit",
                    "Status",
                    "Mietbeginn",
                    "Mietende",
                    "Kaltmiete + NK",
                    "",
                  ].map((col) => (
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
                {filtered.map((tenant) => {
                  const statusCfg = STATUS_CONFIG[tenant.status];
                  return (
                    <tr
                      key={tenant.id}
                      className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {tenant.first_name} {tenant.last_name}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {tenant.unit?.label ?? "–"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusCfg.className}`}
                        >
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {formatDate(tenant.lease_start)}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {tenant.lease_end ? formatDate(tenant.lease_end) : "unbefristet"}
                      </td>
                      <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                        {formatEur(tenant.cold_rent_cents)} +{" "}
                        {formatEur(tenant.additional_costs_cents)}
                      </td>
                      <td className="px-4 py-3">
                        {tenant.unit && (
                          <Link
                            href={`/dashboard/properties/${id}/units/${tenant.unit.id}`}
                            className="text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                            title="Zur Einheit"
                          >
                            →
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
