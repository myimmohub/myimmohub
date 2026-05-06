"use client";

/**
 * NKA-Editor (Page).
 *
 * Konzeptuell laut Spec ein Server-Component, in dieser Codebase aber konsistent
 * zum Rest der Pages als Client-Component umgesetzt (alle anderen NKA-Seiten,
 * SonderWK-Editor etc. nutzen `useEffect`+`fetch`). Die eigentliche
 * Editor-Logik lebt in `components/nka/NkaEditor.tsx`.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import NkaEditor from "@/components/nka/NkaEditor";
import type {
  NkaEditorPeriod,
  NkaEditorCostItem,
  NkaEditorTenant,
  NkaEditorUnit,
} from "@/components/nka/NkaEditor";

type LoaderState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      period: NkaEditorPeriod;
      units: NkaEditorUnit[];
      tenants: NkaEditorTenant[];
      costItems: NkaEditorCostItem[];
    };

export default function NkaEditorPage() {
  const { id, year } = useParams<{ id: string; year: string }>();
  const taxYear = Number(year);
  const [state, setState] = useState<LoaderState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        // Erst die Periode finden — alles andere hängt an ihrer ID.
        const periodsRes = await fetch(`/api/nka/periods?property_id=${id}`);
        const periodsJson = await periodsRes.json();
        if (!periodsRes.ok) {
          throw new Error(periodsJson?.error ?? "Perioden konnten nicht geladen werden.");
        }
        const periodSummary = (periodsJson as Array<{
          id: string;
          tax_year: number;
          property_id: string;
          period_start: string;
          period_end: string;
          status: NkaEditorPeriod["status"];
        }>).find((p) => Number(p.tax_year) === taxYear);
        if (!periodSummary) {
          if (!cancelled) {
            setState({
              status: "error",
              message:
                "Für dieses Jahr existiert noch keine NKA-Periode. Bitte zuerst auf der Jahres-Seite anlegen.",
            });
          }
          return;
        }

        const [periodRes, unitsRes, tenantsRes] = await Promise.all([
          fetch(`/api/nka/periods/${periodSummary.id}`),
          fetch(`/api/units?property_id=${id}`),
          fetch(`/api/tenants?property_id=${id}`),
        ]);
        const [periodJson, unitsJson, tenantsJson] = await Promise.all([
          periodRes.json(),
          unitsRes.json(),
          tenantsRes.json(),
        ]);

        if (!periodRes.ok) throw new Error(periodJson?.error ?? "Periode konnte nicht geladen werden.");
        if (!unitsRes.ok) throw new Error(unitsJson?.error ?? "Einheiten konnten nicht geladen werden.");
        if (!tenantsRes.ok) throw new Error(tenantsJson?.error ?? "Mieter konnten nicht geladen werden.");

        const period: NkaEditorPeriod = {
          id: periodJson.id,
          tax_year: Number(periodJson.tax_year),
          period_start: periodJson.period_start,
          period_end: periodJson.period_end,
          status: periodJson.status,
        };
        const costItems = (periodJson.cost_items ?? []) as NkaEditorCostItem[];

        if (cancelled) return;
        setState({
          status: "ready",
          period,
          units: (unitsJson ?? []) as NkaEditorUnit[],
          tenants: (tenantsJson ?? []) as NkaEditorTenant[],
          costItems,
        });
      } catch (err) {
        if (cancelled) return;
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Editor konnte nicht geladen werden.",
        });
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [id, taxYear]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Nebenkosten-Editor / {taxYear}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              NKA-Editor {taxYear}
            </h1>
          </div>
          <Link
            href={`/dashboard/properties/${id}/nka/${taxYear}`}
            className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Zur Statusseite
          </Link>
        </header>

        {state.status === "loading" && (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
            Editor wird geladen…
          </div>
        )}
        {state.status === "error" && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {state.message}
          </div>
        )}
        {state.status === "ready" && (
          <NkaEditor
            propertyId={id}
            period={state.period}
            units={state.units}
            tenants={state.tenants}
            initialCostItems={state.costItems}
          />
        )}
      </section>
    </main>
  );
}
