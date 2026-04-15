"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { TAX_FIELDS, TAX_FIELD_GROUPS } from "@/lib/tax/fieldMeta";
import type { TaxData, TaxConfidence } from "@/types/tax";
import { fmtDecimal } from "@/lib/utils/numberFormat";

type Property = { id: string; name: string };
type ImportedPartnerPreview = {
  name: string;
  anteil_pct?: number | null;
  email?: string | null;
  special_expenses?: number | null;
  note?: string | null;
};
type ImportedExpenseBlockPreview = {
  key: string;
  label: string;
  amount: number | null;
  detail?: string | null;
};
type ImportedDepreciationItemPreview = {
  label: string;
  item_type: "building" | "outdoor" | "movable_asset";
  gross_annual_amount: number | null;
  apply_rental_ratio: boolean;
};
type ImportedMaintenanceDistributionPreview = {
  label: string;
  source_year: number | null;
  total_amount: number | null;
  classification: "maintenance_expense" | "production_cost" | "depreciation";
  deduction_mode: "immediate" | "distributed";
  distribution_years: number | null;
  current_year_share_override: number | null;
  apply_rental_ratio: boolean;
  note?: string | null;
};
type SupplementalPreview = {
  gbr_name: string | null;
  gbr_steuernummer: string | null;
  gbr_finanzamt: string | null;
  feststellungserklaerung: boolean | null;
  teilweise_eigennutzung: boolean | null;
  eigennutzung_tage: number | null;
  gesamt_tage: number | null;
  rental_share_override_pct: number | null;
  partners: ImportedPartnerPreview[];
  expense_blocks: ImportedExpenseBlockPreview[];
  depreciation_items: ImportedDepreciationItemPreview[];
  maintenance_distributions: ImportedMaintenanceDistributionPreview[];
  import_notes: string[];
};
type ImportResult = {
  fields: TaxData;
  confidence: Record<string, TaxConfidence>;
  supplemental_data?: SupplementalPreview;
};

type ImportNotePresentation = {
  tone: "info" | "success" | "warning";
  title: string;
  body: string;
};

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

function presentImportNote(note: string): ImportNotePresentation {
  if (note.includes("Verteilungsblöcke wurden erkannt, aber nicht übernommen")) {
    return {
      tone: "warning",
      title: "Erkannte Verteilungsblöcke wurden nicht automatisch übernommen",
      body: "Im PDF wurden verteilte Aufwendungen erkannt. Für dieses Objekt gibt es aber bereits gespeicherte Steuerlogik-Einträge. Damit nichts doppelt angelegt oder überschrieben wird, wurden die neuen Blöcke nur als Hinweis angezeigt. Du kannst die bestehenden Verteilungsblöcke auf der Jahresseite prüfen und bei Bedarf manuell ergänzen.",
    };
  }

  if (note.includes("AfA-Positionen wurden erkannt, aber nicht übernommen")) {
    return {
      tone: "warning",
      title: "Erkannte AfA-Positionen wurden nicht automatisch übernommen",
      body: "Das PDF enthält AfA-Komponenten, für dieses Jahr sind aber bereits AfA-Einträge vorhanden. Die App hat daher nichts automatisch überschrieben. Bitte die AfA-Komponenten auf der Jahresseite kurz vergleichen und fehlende Positionen bei Bedarf ergänzen.",
    };
  }

  if (note.includes("AfA Inventar wurde aus dem PDF-Feld depreciation_fixtures als AfA-Komponente ergänzt")) {
    return {
      tone: "success",
      title: "AfA Inventar wurde übernommen",
      body: "Das PDF enthielt einen Wert für Inventar / Ausstattung. Daraus wurde automatisch eine passende AfA-Komponente erzeugt.",
    };
  }

  if (note.includes("AfA-Position(en) aus dem PDF übernommen")) {
    return {
      tone: "success",
      title: "AfA-Positionen übernommen",
      body: note,
    };
  }

  if (note.includes("Verteilungsblock/-blöcke aus dem PDF übernommen")) {
    return {
      tone: "success",
      title: "Verteilungsblöcke übernommen",
      body: note,
    };
  }

  return {
    tone: "info",
    title: "Import-Hinweis",
    body: note,
  };
}

export default function TaxImportPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [taxYear, setTaxYear] = useState(new Date().getFullYear() - 1);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
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
          setError(data.details ? `${data.error ?? "Fehler beim Import."} ${data.details}` : (data.error ?? "Fehler beim Import."));
        }
        setUploading(false);
        return;
      }

      setResult({ fields: data.fields, confidence: data.confidence, supplemental_data: data.supplemental_data });
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
          Lade einen Steuerbescheid oder ELSTER-PDF für {property?.name ?? "die Immobilie"} hoch. Die KI extrahiert Anlage V sowie GbR-, FE- und FB-relevante Angaben automatisch.
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

            {result.supplemental_data && (
              <>
                {(result.supplemental_data.gbr_name ||
                  result.supplemental_data.gbr_steuernummer ||
                  result.supplemental_data.gbr_finanzamt ||
                  result.supplemental_data.feststellungserklaerung != null ||
                  result.supplemental_data.teilweise_eigennutzung != null ||
                  result.supplemental_data.eigennutzung_tage != null ||
                  result.supplemental_data.gesamt_tage != null ||
                  result.supplemental_data.rental_share_override_pct != null) && (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        GbR / FE Zusatzdaten
                      </h3>
                    </div>
                    <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
                      <PreviewRow label="GbR-Name" value={result.supplemental_data.gbr_name} />
                      <PreviewRow label="Steuernummer" value={result.supplemental_data.gbr_steuernummer} />
                      <PreviewRow label="Finanzamt" value={result.supplemental_data.gbr_finanzamt} />
                      <PreviewRow
                        label="Feststellungserklärung"
                        value={
                          result.supplemental_data.feststellungserklaerung == null
                            ? null
                            : result.supplemental_data.feststellungserklaerung ? "Ja" : "Nein"
                        }
                      />
                      <PreviewRow
                        label="Teilweise Eigennutzung"
                        value={
                          result.supplemental_data.teilweise_eigennutzung == null
                            ? null
                            : result.supplemental_data.teilweise_eigennutzung ? "Ja" : "Nein"
                        }
                      />
                      <PreviewRow
                        label="Eigennutzungstage"
                        value={result.supplemental_data.eigennutzung_tage != null ? String(result.supplemental_data.eigennutzung_tage) : null}
                      />
                      <PreviewRow
                        label="Gesamttage"
                        value={result.supplemental_data.gesamt_tage != null ? String(result.supplemental_data.gesamt_tage) : null}
                      />
                      <PreviewRow
                        label="Vermietungsanteil manuell"
                        value={
                          result.supplemental_data.rental_share_override_pct != null
                            ? `${fmtDecimal(result.supplemental_data.rental_share_override_pct * 100, 2, 2)} %`
                            : null
                        }
                      />
                    </div>
                  </div>
                )}

                {result.supplemental_data.partners.length > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Partner / FB-Zuordnung
                      </h3>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                            <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Name</th>
                            <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Anteil</th>
                            <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Sonder-WK</th>
                            <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Hinweis</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {result.supplemental_data.partners.map((partner, index) => (
                            <tr key={`${partner.name}-${index}`}>
                              <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                                <p className="font-medium">{partner.name}</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500">{partner.email || "Keine E-Mail"}</p>
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                {partner.anteil_pct != null ? `${fmtDecimal(partner.anteil_pct, 2, 2)} %` : "—"}
                              </td>
                              <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                {partner.special_expenses != null ? fmtVal(partner.special_expenses, "numeric") : "—"}
                              </td>
                              <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                {partner.note || "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {(result.supplemental_data.expense_blocks.length > 0 ||
                  result.supplemental_data.depreciation_items.length > 0 ||
                  result.supplemental_data.maintenance_distributions.length > 0 ||
                  result.supplemental_data.import_notes.length > 0) && (
                  <div className="space-y-4 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        Steuerlogik aus PDF
                      </h3>
                    </div>
                    <div className="space-y-4 px-5 py-4">
                      {result.supplemental_data.import_notes.length > 0 && (
                        <div className="space-y-2">
                          {result.supplemental_data.import_notes.map((note) => {
                            const presentation = presentImportNote(note);
                            const toneClasses =
                              presentation.tone === "success"
                                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                                : presentation.tone === "warning"
                                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                                  : "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300";

                            return (
                              <div key={note} className={`rounded-lg px-3 py-2 text-sm ${toneClasses}`}>
                                <p className="font-medium">{presentation.title}</p>
                                <p className="mt-1">{presentation.body}</p>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {result.supplemental_data.expense_blocks.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Erkannte Kostenblöcke</p>
                          <div className="grid gap-3 md:grid-cols-2">
                            {result.supplemental_data.expense_blocks.map((block) => (
                              <div key={`${block.key}-${block.label}`} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800/50">
                                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{block.label}</p>
                                {block.detail ? <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{block.detail}</p> : null}
                                <p className="mt-2 text-sm tabular-nums text-slate-700 dark:text-slate-300">{fmtVal(block.amount, "numeric")}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {result.supplemental_data.depreciation_items.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Erkannte AfA-Positionen</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Bezeichnung</th>
                                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Typ</th>
                                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Brutto/Jahr</th>
                                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Quote</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {result.supplemental_data.depreciation_items.map((item, index) => (
                                  <tr key={`${item.label}-${index}`}>
                                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{item.label}</td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                      {item.item_type === "building" ? "Gebäude" : item.item_type === "outdoor" ? "Außenanlagen" : "Inventar"}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                      {fmtVal(item.gross_annual_amount, "numeric")}
                                    </td>
                                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                                      {item.apply_rental_ratio ? "mit Vermietungsquote" : "100 %"}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {result.supplemental_data.maintenance_distributions.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Erkannte Verteilungsblöcke</p>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Bezeichnung</th>
                                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Jahr</th>
                                  <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Betrag</th>
                                  <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Logik</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {result.supplemental_data.maintenance_distributions.map((item, index) => (
                                  <tr key={`${item.label}-${index}`}>
                                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100">{item.label}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                      {item.source_year ?? "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                      {fmtVal(item.total_amount, "numeric")}
                                    </td>
                                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                                      {item.classification} · {item.deduction_mode === "immediate" ? "sofort" : `${item.distribution_years ?? "—"} Jahre`}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

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

function PreviewRow({ label, value }: { label: string; value: string | null }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-sm text-slate-600 dark:text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</span>
    </div>
  );
}
