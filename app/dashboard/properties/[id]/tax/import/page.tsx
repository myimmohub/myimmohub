"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { TAX_FIELDS, TAX_FIELD_GROUPS } from "@/lib/tax/fieldMeta";
import type { TaxData, TaxConfidence } from "@/types/tax";

type Property = { id: string; name: string };

const CONFIDENCE_COLORS: Record<TaxConfidence | "null", { dot: string; label: string }> = {
  high:   { dot: "bg-emerald-500", label: "Sicher" },
  medium: { dot: "bg-amber-400",   label: "Prüfen" },
  low:    { dot: "bg-red-500",     label: "Unsicher" },
  null:   { dot: "bg-slate-300 dark:bg-slate-600", label: "Nicht erkannt" },
};

const fmtVal = (val: unknown, type: string) => {
  if (val == null) return "—";
  if (type === "numeric") return Number(val).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  if (type === "date") return new Date(val as string).toLocaleDateString("de-DE");
  return String(val);
};

export default function TaxImportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear() - 1);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ fields: TaxData; confidence: Record<string, TaxConfidence> } | null>(null);
  const [saving, setSaving] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: prop } = await supabase.from("properties").select("id, name").eq("id", id).eq("user_id", user.id).single();
      setProperty(prop as Property | null);
    };
    void load();
  }, [id]);

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setUploading(true);
    setError(null);
    setProgress(10);

    try {
      // Read file as base64 (chunk-basiert, um Stack Overflow bei großen PDFs zu vermeiden)
      const base64 = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          // data:application/pdf;base64,XXXX → nur den Base64-Teil
          resolve(dataUrl.split(",")[1]);
        };
        reader.readAsDataURL(file);
      });
      setProgress(30);

      const res = await fetch("/api/tax/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: id,
          tax_year: taxYear,
          pdf_base64: base64,
          overwrite: existingId != null,
        }),
      });

      setProgress(90);
      const data = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          setExistingId(data.existing_id);
          setError(`Für ${taxYear} existiert bereits ein Eintrag. Klicke erneut um zu überschreiben.`);
        } else {
          setError(data.error ?? "Fehler beim Import.");
        }
        setUploading(false);
        return;
      }

      setResult({ fields: data.fields, confidence: data.confidence });
      setProgress(100);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unbekannter Fehler.");
    } finally {
      setUploading(false);
    }
  }, [file, id, taxYear, existingId]);

  const handleSave = async () => {
    if (!result) return;
    setSaving(true);
    router.push(`/dashboard/properties/${id}/tax/${result.fields.tax_year ?? taxYear}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        {/* Header */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href={`/dashboard/properties/${id}/tax`} className="hover:text-slate-900 dark:hover:text-slate-100">
            Steuerdaten
          </Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-100">PDF importieren</span>
        </nav>

        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Steuerbescheid importieren
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Lade einen Steuerbescheid oder ELSTER-PDF hoch. Die KI extrahiert die Anlage-V-Felder automatisch.
        </p>

        {!result ? (
          /* ── Upload ── */
          <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Steuerjahr</label>
              <select
                value={taxYear}
                onChange={(e) => { setTaxYear(Number(e.target.value)); setExistingId(null); setError(null); }}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">PDF-Datei (max. 10 MB)</label>
              <input
                type="file"
                accept=".pdf"
                onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null); setExistingId(null); }}
                className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-blue-600 hover:file:bg-blue-100 dark:text-slate-400 dark:file:bg-blue-950/40 dark:file:text-blue-400"
              />
            </div>

            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </p>
            )}

            {uploading && (
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-blue-500 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}

            <button
              type="button"
              onClick={() => void handleUpload()}
              disabled={!file || uploading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {uploading ? "Analysiere PDF…" : existingId ? "Überschreiben & importieren" : "PDF analysieren"}
            </button>
          </div>
        ) : (
          /* ── Preview ── */
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Extrahierte Felder — {result.fields.tax_year ?? taxYear}
              </h2>
              <div className="flex gap-3 text-xs text-slate-500 dark:text-slate-400">
                {(Object.entries(CONFIDENCE_COLORS) as [string, { dot: string; label: string }][]).map(([key, { dot, label }]) => (
                  <span key={key} className="flex items-center gap-1">
                    <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {TAX_FIELD_GROUPS.map(({ key: cat, label: groupLabel }) => {
              const fields = TAX_FIELDS.filter((f) => f.category === cat);
              const hasValues = fields.some((f) => (result.fields as unknown as Record<string, unknown>)[f.key] != null);
              if (!hasValues) return null;

              return (
                <div key={cat} className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {groupLabel}
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
                    {fields.map((field) => {
                      const val = (result.fields as unknown as Record<string, unknown>)[field.key];
                      if (val == null) return null;
                      const conf = result.confidence[field.key] as TaxConfidence | undefined;
                      const { dot } = CONFIDENCE_COLORS[conf ?? "null"];

                      return (
                        <div key={field.key} className="flex items-center justify-between py-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              <span className="mr-1.5 text-xs text-slate-400 dark:text-slate-500">{field.zeile}</span>
                              {field.label}
                            </span>
                          </div>
                          <span className="text-sm font-medium tabular-nums text-slate-900 dark:text-slate-100">
                            {fmtVal(val, field.type)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setResult(null); setProgress(0); }}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Zurück
              </button>
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {saving ? "Speichert…" : "Übernehmen & weiter"}
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
