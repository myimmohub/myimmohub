"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { determineDeadlineStatus } from "@/lib/nka/period-calculations";
import type { NkaOverviewRow } from "@/types/nka";

function statusColor(status: ReturnType<typeof determineDeadlineStatus>) {
  if (status === "critical") return "bg-red-100 text-red-700";
  if (status === "warning") return "bg-orange-100 text-orange-700";
  if (status === "attention") return "bg-amber-100 text-amber-700";
  if (status === "done") return "bg-emerald-100 text-emerald-700";
  return "bg-slate-100 text-slate-700";
}

export default function NkaOverviewPage() {
  const [rows, setRows] = useState<NkaOverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [yearFilter, setYearFilter] = useState("");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (yearFilter) params.set("year", yearFilter);
      const res = await fetch(`/api/nka/periods?${params.toString()}`);
      const data = await res.json().catch(() => []);
      setRows(res.ok ? data : []);
      setLoading(false);
    };
    void load();
  }, [statusFilter, yearFilter]);

  const criticalRows = useMemo(() => rows.filter((row) => determineDeadlineStatus(row) !== "done"), [rows]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Nebenkostenabrechnung</h1>
            <p className="mt-1 text-sm text-slate-500">Perioden, Fristenmonitor und Abrechnungsstatus je Objekt.</p>
          </div>
          <Link href="/dashboard/nka/neu" className="inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
            Neue NKA
          </Link>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          {criticalRows.slice(0, 3).map((row) => {
            const deadlineState = determineDeadlineStatus(row);
            return (
              <Link key={row.id} href={`/dashboard/nka/${row.id}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-300">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-slate-900">{row.property?.name ?? "Objekt"}</p>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColor(deadlineState)}`}>
                    {row.deadline_abrechnung ?? "keine Frist"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">
                  {row.zeitraum_von} bis {row.zeitraum_bis}
                </p>
              </Link>
            );
          })}
          {criticalRows.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500">
              Keine offenen Fristen. Neue Periode anlegen, um mit der Abrechnung zu starten.
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <option value="">Alle Status</option>
            <option value="offen">Offen</option>
            <option value="in_bearbeitung">In Bearbeitung</option>
            <option value="versandt">Versandt</option>
            <option value="abgeschlossen">Abgeschlossen</option>
          </select>
          <input
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            placeholder="Jahr, z. B. 2025"
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Objekt</th>
                <th className="px-4 py-3">Zeitraum</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Deadline</th>
                <th className="px-4 py-3">Umlagefähig</th>
                <th className="px-4 py-3">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>Lade NKA-Perioden…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>Noch keine Perioden vorhanden.</td></tr>
              ) : rows.map((row) => {
                const deadlineState = determineDeadlineStatus(row);
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{row.property?.name ?? "Objekt"}</div>
                      <div className="text-slate-500">{row.property?.address ?? ""}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{row.zeitraum_von} bis {row.zeitraum_bis}</td>
                    <td className="px-4 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{row.status}</span></td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-medium ${statusColor(deadlineState)}`}>{row.deadline_abrechnung ?? "—"}</span></td>
                    <td className="px-4 py-3 text-slate-700">{Number(row.gesamtkosten_umlagefaehig ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <Link href={`/dashboard/nka/${row.id}`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          Öffnen
                        </Link>
                        <Link href={`/dashboard/nka/${row.id}/pdf`} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                          PDF
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
