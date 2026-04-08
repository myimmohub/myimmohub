"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { TAX_FIELDS, TAX_FIELD_GROUPS } from "@/lib/tax/fieldMeta";
import type { TaxData, TaxConfidence } from "@/types/tax";

type Property = { id: string; name: string; address: string | null };

const CONFIDENCE_DOT: Record<TaxConfidence | "null", string> = {
  high:   "bg-emerald-500",
  medium: "bg-amber-400",
  low:    "bg-red-500",
  null:   "bg-slate-300 dark:bg-slate-600",
};

const fmtVal = (val: unknown, type: string) => {
  if (val == null || val === "") return "—";
  if (type === "numeric") return Number(val).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  if (type === "date") return new Date(val as string).toLocaleDateString("de-DE");
  if (type === "integer") return String(val);
  return String(val);
};

export default function TaxYearPage() {
  const { id, year: yearParam } = useParams<{ id: string; year: string }>();
  const router = useRouter();
  const taxYear = Number(yearParam);

  const [property, setProperty] = useState<Property | null>(null);
  const [taxData, setTaxData] = useState<TaxData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prop }, { data: entries }] = await Promise.all([
        supabase.from("properties").select("id, name, address").eq("id", id).eq("user_id", user.id).single(),
        supabase.from("tax_data").select("*").eq("property_id", id).eq("tax_year", taxYear).limit(1),
      ]);

      setProperty(prop as Property | null);
      if (entries && entries.length > 0) {
        setTaxData(entries[0] as TaxData);
      }
      setLoading(false);
    };
    void load();
  }, [id, taxYear]);

  const handleCalculate = async () => {
    setCalculating(true);
    const res = await fetch("/api/tax/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: id, tax_year: taxYear }),
    });
    if (res.ok) {
      setTaxData(await res.json());
    }
    setCalculating(false);
  };

  const startEdit = () => {
    const vals: Record<string, string> = {};
    for (const field of TAX_FIELDS) {
      const v = taxData ? (taxData as unknown as Record<string, unknown>)[field.key] : null;
      vals[field.key] = v != null ? String(v) : "";
    }
    setEditValues(vals);
    setEditing(true);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!taxData) return;
    setSaving(true);
    setSaveError(null);

    const updates: Record<string, unknown> = {};
    for (const field of TAX_FIELDS) {
      const raw = editValues[field.key]?.trim();
      if (raw === "") {
        updates[field.key] = null;
      } else if (field.type === "numeric") {
        updates[field.key] = parseFloat(raw.replace(",", "."));
      } else if (field.type === "integer") {
        updates[field.key] = parseInt(raw, 10);
      } else {
        updates[field.key] = raw;
      }
    }

    const res = await fetch(`/api/tax/${taxData.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (res.ok) {
      setTaxData(await res.json());
      setEditing(false);
    } else {
      const data = await res.json();
      setSaveError(data.error ?? "Fehler beim Speichern.");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!taxData) return;
    setDeleting(true);
    const res = await fetch(`/api/tax/${taxData.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push(`/dashboard/properties/${id}/tax`);
    }
    setDeleting(false);
  };

  // Count filled fields
  const filledCount = taxData
    ? TAX_FIELDS.filter((f) => (taxData as unknown as Record<string, unknown>)[f.key] != null).length
    : 0;
  const missingCount = TAX_FIELDS.length - filledCount;

  if (loading) return <Skeleton />;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        {/* Header */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href={`/dashboard/properties/${id}/tax`} className="hover:text-slate-900 dark:hover:text-slate-100">
            Steuerdaten
          </Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-100">{taxYear}</span>
        </nav>

        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Anlage V — {taxYear}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {property?.name}
              {taxData ? ` · ${filledCount}/${TAX_FIELDS.length} Felder ausgefüllt` : ""}
              {missingCount > 0 && taxData ? ` · ${missingCount} fehlen` : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {taxData && (
              <>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Löschen
                </button>
                <Link
                  href={`/dashboard/properties/${id}/tax/${taxYear}/export`}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Export
                </Link>
              </>
            )}
            {!editing && (
              <button
                type="button"
                onClick={taxData ? startEdit : () => void handleCalculate()}
                disabled={calculating}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {taxData ? "Bearbeiten" : calculating ? "Berechne…" : "Aus Transaktionen berechnen"}
              </button>
            )}
          </div>
        </div>

        {!taxData && !calculating ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Keine Daten für {taxYear}. Berechne aus Transaktionen oder importiere ein PDF.
            </p>
          </div>
        ) : taxData && (
          <div className="space-y-4">
            {TAX_FIELD_GROUPS.map(({ key: cat, label: groupLabel }) => {
              const fields = TAX_FIELDS.filter((f) => f.category === cat);

              return (
                <div key={cat} className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {groupLabel}
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
                    {fields.map((field) => {
                      const val = (taxData as unknown as Record<string, unknown>)[field.key];
                      const conf = taxData.import_confidence?.[field.key] as TaxConfidence | undefined;
                      const dot = CONFIDENCE_DOT[conf ?? "null"];

                      return (
                        <div key={field.key} className="flex items-center justify-between gap-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {conf && <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />}
                            <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                              <span className="mr-1.5 text-xs text-slate-400 dark:text-slate-500">{field.zeile}</span>
                              {field.label}
                            </span>
                          </div>
                          {editing ? (
                            <input
                              type={field.type === "date" ? "date" : "text"}
                              value={editValues[field.key] ?? ""}
                              onChange={(e) => setEditValues((v) => ({ ...v, [field.key]: e.target.value }))}
                              className="w-40 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              placeholder={field.type === "numeric" ? "0,00" : ""}
                            />
                          ) : (
                            <span className={`shrink-0 text-sm tabular-nums ${val != null ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-300 dark:text-slate-600"}`}>
                              {fmtVal(val, field.type)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {editing && (
              <div className="space-y-3">
                {saveError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{saveError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? "Speichert…" : "Änderungen speichern"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Steuerdaten löschen?</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Alle Daten für das Steuerjahr {taxYear} werden unwiderruflich gelöscht.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Lösche…" : "Endgültig löschen"}
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Skeleton() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
      </section>
    </main>
  );
}
