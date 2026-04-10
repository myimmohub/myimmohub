"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TaxYearNavigation from "@/components/tax/TaxYearNavigation";
import type { GbrTaxReport } from "@/types/tax";

const fmtEur = (value: number) =>
  value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

export default function GbrTaxExportPage() {
  const { id, year } = useParams<{ id: string; year: string }>();
  const taxYear = Number(year);

  const [report, setReport] = useState<GbrTaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/tax/gbr-report?property_id=${id}&tax_year=${taxYear}`);
      if (res.ok) setReport(await res.json() as GbrTaxReport);
      setLoading(false);
    };
    void load();
  }, [id, taxYear]);

  const handleCopy = async (key: string, value: string | number) => {
    const text = typeof value === "number" ? String(value).replace(".", ",") : value;
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  if (loading) return <Skeleton />;

  if (!report) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <section className="mx-auto w-full max-w-4xl">
          <p className="text-sm text-slate-500 dark:text-slate-400">GbR-Export konnte nicht geladen werden.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href={`/dashboard/properties/${id}/tax`} className="hover:text-slate-900 dark:hover:text-slate-100">Steuerdaten</Link>
          <span>/</span>
          <Link href={`/dashboard/properties/${id}/tax/${taxYear}/gbr`} className="hover:text-slate-900 dark:hover:text-slate-100">GbR</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-100">Export</span>
        </nav>

        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            ELSTER-Export — Anlage FE / FB {taxYear}
          </h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            {report.gbr.name || report.property_name || "GbR"}{report.property_address ? ` · ${report.property_address}` : ""}
          </p>
        </div>

        <TaxYearNavigation
          propertyId={id}
          taxYear={taxYear}
          active="gbr-export"
          hasGbr
        />

        <div className="rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 dark:border-blue-800 dark:bg-blue-950/30">
          <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Hilfsansicht für FE/FB</p>
          <p className="mt-1 text-xs text-blue-600 dark:text-blue-400">
            Werte können angeklickt und direkt nach Mein ELSTER übertragen werden. Die Verteilung auf die Beteiligten basiert auf den hinterlegten Partneranteilen.
          </p>
        </div>

        <div className="flex justify-end">
          <Link
            href={`/dashboard/properties/${id}/tax/${taxYear}/gbr/pdf`}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            PDF herunterladen
          </Link>
        </div>

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Anlage FE</h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <ExportRow label="GbR-Name" value={report.gbr.name || "—"} copyKey="fe-name" copied={copied} onCopy={handleCopy} />
            <ExportRow label="Steuernummer" value={report.gbr.steuernummer || "—"} copyKey="fe-tax-number" copied={copied} onCopy={handleCopy} />
            <ExportRow label="Finanzamt" value={report.gbr.finanzamt || "—"} copyKey="fe-finanzamt" copied={copied} onCopy={handleCopy} />
            <ExportRow label="Gesamteinnahmen V+V" value={fmtEur(report.fe.total_income)} rawValue={report.fe.total_income} copyKey="fe-income" copied={copied} onCopy={handleCopy} />
            <ExportRow label="Werbungskosten gesamt" value={fmtEur(report.fe.total_expenses)} rawValue={report.fe.total_expenses} copyKey="fe-expenses" copied={copied} onCopy={handleCopy} />
            <ExportRow label="AfA gesamt" value={fmtEur(report.fe.depreciation_total)} rawValue={report.fe.depreciation_total} copyKey="fe-afa" copied={copied} onCopy={handleCopy} />
            <ExportRow label="Sonderabzüge gesamt" value={fmtEur(report.fe.special_deductions_total)} rawValue={report.fe.special_deductions_total} copyKey="fe-special" copied={copied} onCopy={handleCopy} />
            <ExportRow label="Ergebnis vor Partnerwerten" value={fmtEur(report.fe.collective_result)} rawValue={report.fe.collective_result} copyKey="fe-collective-result" copied={copied} onCopy={handleCopy} />
            <ExportRow label="Sonderwerbungskosten Partner" value={fmtEur(report.fe.partner_special_expenses_total)} rawValue={report.fe.partner_special_expenses_total} copyKey="fe-partner-special" copied={copied} onCopy={handleCopy} />
            <ExportRow label="Festzustellendes Ergebnis" value={fmtEur(report.fe.final_result)} rawValue={report.fe.final_result} copyKey="fe-result" copied={copied} onCopy={handleCopy} strong />
          </div>
        </section>

        {report.fb.map((partner) => (
          <section key={partner.partner_id} className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Anlage FB — {partner.partner_name}</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Beteiligungsquote {partner.anteil_pct.toFixed(2)} % {partner.email ? `· ${partner.email}` : ""}
              </p>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <ExportRow label="Beteiligungsquote" value={`${partner.anteil_pct.toFixed(2)} %`} rawValue={partner.anteil_pct} copyKey={`${partner.partner_id}-share`} copied={copied} onCopy={handleCopy} />
              <ExportRow label="Einnahmenanteil" value={fmtEur(partner.total_income)} rawValue={partner.total_income} copyKey={`${partner.partner_id}-income`} copied={copied} onCopy={handleCopy} />
              <ExportRow label="Werbungskostenanteil" value={fmtEur(partner.total_expenses)} rawValue={partner.total_expenses} copyKey={`${partner.partner_id}-expenses`} copied={copied} onCopy={handleCopy} />
              <ExportRow label="AfA-Anteil" value={fmtEur(partner.depreciation_total)} rawValue={partner.depreciation_total} copyKey={`${partner.partner_id}-afa`} copied={copied} onCopy={handleCopy} />
              <ExportRow label="Sonderabzüge" value={fmtEur(partner.special_deductions_total)} rawValue={partner.special_deductions_total} copyKey={`${partner.partner_id}-special`} copied={copied} onCopy={handleCopy} />
              <ExportRow label="Sonderwerbungskosten" value={fmtEur(partner.partner_special_expenses)} rawValue={partner.partner_special_expenses} copyKey={`${partner.partner_id}-special-expenses`} copied={copied} onCopy={handleCopy} />
              <ExportRow label="Ergebnis vor Partnerwerten" value={fmtEur(partner.result_before_partner_adjustments)} rawValue={partner.result_before_partner_adjustments} copyKey={`${partner.partner_id}-result-base`} copied={copied} onCopy={handleCopy} />
              <ExportRow label="Zuzurechnendes Ergebnis" value={fmtEur(partner.result)} rawValue={partner.result} copyKey={`${partner.partner_id}-result`} copied={copied} onCopy={handleCopy} strong />
            </div>
          </section>
        ))}
      </section>
    </main>
  );
}

function ExportRow({
  label,
  value,
  rawValue,
  copyKey,
  copied,
  onCopy,
  strong = false,
}: {
  label: string;
  value: string;
  rawValue?: string | number;
  copyKey: string;
  copied: string | null;
  onCopy: (key: string, value: string | number) => Promise<void>;
  strong?: boolean;
}) {
  const copyValue = rawValue ?? value;

  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <button
        type="button"
        onClick={() => void onCopy(copyKey, copyValue)}
        className={`rounded-lg border px-3 py-1.5 text-sm tabular-nums transition ${
          copied === copyKey
            ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
            : "border-slate-200 bg-white text-slate-900 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        } ${strong ? "font-semibold" : "font-medium"}`}
      >
        {copied === copyKey ? "Kopiert" : value}
      </button>
    </div>
  );
}

function Skeleton() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        <div className="h-8 w-72 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        {[1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
      </section>
    </main>
  );
}
