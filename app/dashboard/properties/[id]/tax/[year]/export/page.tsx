"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { TAX_FIELDS, TAX_FIELD_GROUPS } from "@/lib/tax/fieldMeta";
import type { TaxData } from "@/types/tax";

type Property = { id: string; name: string; address: string | null };

export default function TaxExportPage() {
  const { id, year: yearParam } = useParams<{ id: string; year: string }>();
  const taxYear = Number(yearParam);

  const [property, setProperty] = useState<Property | null>(null);
  const [taxData, setTaxData] = useState<TaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [{ data: prop }, { data: entries }] = await Promise.all([
        supabase.from("properties").select("id, name, address").eq("id", id).eq("user_id", user.id).single(),
        supabase.from("tax_data").select("*").eq("property_id", id).eq("tax_year", taxYear).limit(1),
      ]);
      setProperty(prop as Property | null);
      if (entries && entries.length > 0) setTaxData(entries[0] as TaxData);
      setLoading(false);
    };
    void load();
  }, [id, taxYear]);

  const handleCopy = async (key: string, value: unknown) => {
    if (value == null) return;
    const text = typeof value === "number" ? value.toFixed(2).replace(".", ",") : String(value);
    await navigator.clipboard.writeText(text);
    setCopiedField(key);
    setTimeout(() => setCopiedField(null), 1500);
  };

  const fmtVal = (val: unknown, type: string) => {
    if (val == null) return null;
    if (type === "numeric") return Number(val).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";
    if (type === "date") return new Date(val as string).toLocaleDateString("de-DE");
    if (type === "integer") return String(val);
    return String(val);
  };

  const filledCount = taxData
    ? TAX_FIELDS.filter((f) => (taxData as unknown as Record<string, unknown>)[f.key] != null).length
    : 0;

  if (loading) return <Skeleton />;

  if (!taxData) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Keine Daten für {taxYear}.{" "}
          <Link href={`/dashboard/properties/${id}/tax/${taxYear}`} className="text-blue-600 hover:underline">
            Zuerst berechnen oder importieren.
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        {/* Header */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href={`/dashboard/properties/${id}/tax`} className="hover:text-slate-900 dark:hover:text-slate-100">
            Steuerdaten
          </Link>
          <span>/</span>
          <Link href={`/dashboard/properties/${id}/tax/${taxYear}`} className="hover:text-slate-900 dark:hover:text-slate-100">
            {taxYear}
          </Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-100">Export</span>
        </nav>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            ELSTER-Export — Anlage V {taxYear}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {property?.name}{property?.address ? ` · ${property.address}` : ""}
            {` · ${filledCount}/${TAX_FIELDS.length} Felder`}
          </p>
        </div>

        {/* Hinweis */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 dark:border-blue-800 dark:bg-blue-950/30">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">
            Hilfsansicht zum Übertrag in Mein ELSTER
          </p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            Klicke auf einen Wert, um ihn in die Zwischenablage zu kopieren. Übertrage die Werte dann in die entsprechende Zeile in Mein ELSTER.
          </p>
        </div>

        {/* Status-Leiste */}
        <div className="flex items-center gap-4">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${filledCount === TAX_FIELDS.length ? "bg-emerald-500" : "bg-blue-500"}`}
              style={{ width: `${(filledCount / TAX_FIELDS.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {filledCount === TAX_FIELDS.length ? "✓ Vollständig" : `${TAX_FIELDS.length - filledCount} Felder fehlen`}
          </span>
        </div>

        {/* Felder nach Gruppe */}
        {TAX_FIELD_GROUPS.map(({ key: cat, label: groupLabel, color }) => {
          const fields = TAX_FIELDS.filter((f) => f.category === cat);
          const colorMap: Record<string, string> = {
            slate: "border-slate-200 dark:border-slate-800",
            emerald: "border-emerald-200 dark:border-emerald-900",
            red: "border-red-200 dark:border-red-900",
            blue: "border-blue-200 dark:border-blue-900",
            purple: "border-purple-200 dark:border-purple-900",
          };

          return (
            <div key={cat} className={`rounded-xl border bg-white shadow-sm dark:bg-slate-900 ${colorMap[color] ?? "border-slate-200 dark:border-slate-800"}`}>
              <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  {groupLabel}
                </h3>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {fields.map((field) => {
                  const val = (taxData as unknown as Record<string, unknown>)[field.key];
                  const formatted = fmtVal(val, field.type);
                  const isCopied = copiedField === field.key;

                  return (
                    <div key={field.key} className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-6 min-w-[3rem] items-center justify-center rounded bg-slate-100 px-1.5 text-[11px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            {field.zeile}
                          </span>
                          <span className="text-sm text-slate-700 dark:text-slate-300 truncate">{field.label}</span>
                        </div>
                      </div>
                      {formatted != null ? (
                        <button
                          type="button"
                          onClick={() => void handleCopy(field.key, val)}
                          className={`group flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium tabular-nums transition ${
                            isCopied
                              ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                              : "border-slate-200 bg-white text-slate-900 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:border-blue-600"
                          }`}
                          title="In Zwischenablage kopieren"
                        >
                          {isCopied ? (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                              </svg>
                              Kopiert
                            </>
                          ) : (
                            <>
                              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 opacity-0 transition group-hover:opacity-100" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M8 2a1 1 0 000 2h2a1 1 0 100-2H8z" />
                                <path d="M3 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v6h-4.586l1.293-1.293a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L10.414 13H15v3a2 2 0 01-2 2H5a2 2 0 01-2-2V5z" />
                              </svg>
                              {formatted}
                            </>
                          )}
                        </button>
                      ) : (
                        <span className="text-sm text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {/* Footer */}
        <div className="rounded-xl bg-slate-100 px-5 py-3 text-center dark:bg-slate-800/50">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Dies ist keine ELSTER-Übermittlung. Werte bitte manuell in Mein ELSTER übertragen.
          </p>
        </div>
      </section>
    </main>
  );
}

function Skeleton() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
      </section>
    </main>
  );
}
