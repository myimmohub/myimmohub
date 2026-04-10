"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import type { GbrTaxReport } from "@/types/tax";

const fmtEur = (value: number) =>
  value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";

export default function GbrTaxPdfPage() {
  const { id, year } = useParams<{ id: string; year: string }>();
  const taxYear = Number(year);
  const [report, setReport] = useState<GbrTaxReport | null>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch(`/api/tax/gbr-report?property_id=${id}&tax_year=${taxYear}`);
      if (res.ok) setReport(await res.json() as GbrTaxReport);
    };
    void load();
  }, [id, taxYear]);

  if (!report) {
    return (
      <main className="min-h-screen bg-white px-4 py-10 text-slate-900">
        <section className="mx-auto max-w-4xl">
          <p className="text-sm text-slate-500">PDF-Vorschau wird geladen…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 print:bg-white print:px-0 print:py-0">
      <style jsx global>{`
        @media print {
          .print-hide { display: none !important; }
          .print-page {
            break-after: page;
            page-break-after: always;
            box-shadow: none !important;
            border: none !important;
            margin: 0 !important;
          }
          .print-page:last-child {
            break-after: auto;
            page-break-after: auto;
          }
        }
      `}</style>

      <section className="mx-auto mb-6 flex max-w-5xl items-center justify-between print-hide">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">PDF-Vorschau FE / FB {taxYear}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Druckoptimierte Ansicht analog zur offiziellen Struktur, inkl. Anlage FE und allen Anlage-FB-Seiten.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/dashboard/properties/${id}/tax/${taxYear}/gbr/export`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Zurück zum Export
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            PDF herunterladen
          </button>
        </div>
      </section>

      <div className="mx-auto max-w-5xl space-y-6">
        <PrintPage title={`Anlage FE ${taxYear}`} subtitle={`${report.gbr.name || report.property_name || "GbR"} · ${report.property_address ?? ""}`}>
          <FieldGrid
            rows={[
              ["Gesellschaft", report.gbr.name || "—"],
              ["Steuernummer", report.gbr.steuernummer || "—"],
              ["Finanzamt", report.gbr.finanzamt || "—"],
              ["Steuerjahr", String(report.tax_year)],
              ["Feststellungserklärung", report.gbr.feststellungserklaerung ? "Ja" : "Nein"],
              ["Teilweise Eigennutzung", report.gbr.teilweise_eigennutzung ? "Ja" : "Nein"],
              ["Vermietungsanteil", `${(report.gbr.rental_share_pct * 100).toFixed(2).replace(".", ",")} %`],
              ["Quelle Vermietungsanteil", report.gbr.rental_share_source === "override" ? "Manuell" : "Automatisch"],
            ]}
          />
          <SectionTitle title="Einkünfte aus Vermietung und Verpachtung" />
          <FieldGrid
            rows={[
              ["Gesamteinnahmen", fmtEur(report.fe.total_income)],
              ["Werbungskosten gesamt", fmtEur(report.fe.total_expenses)],
              ["AfA gesamt", fmtEur(report.fe.depreciation_total)],
              ["Sonderabzüge gesamt", fmtEur(report.fe.special_deductions_total)],
              ["Ergebnis vor Partnerwerten", fmtEur(report.fe.collective_result)],
              ["Sonderwerbungskosten Partner", fmtEur(report.fe.partner_special_expenses_total)],
              ["Festzustellendes Ergebnis", fmtEur(report.fe.final_result)],
            ]}
          />
          {report.warnings.length > 0 && (
            <>
              <SectionTitle title="Hinweise" />
              <ul className="space-y-1 text-sm text-slate-700">
                {report.warnings.map((warning) => <li key={warning}>• {warning}</li>)}
              </ul>
            </>
          )}
        </PrintPage>

        {report.fb.map((partner, index) => (
          <PrintPage
            key={partner.partner_id}
            title={`Anlage FB ${taxYear}`}
            subtitle={`${partner.partner_name} · ${partner.anteil_pct.toFixed(2)} % Beteiligung`}
            footer={`Seite ${index + 2}`}
          >
            <FieldGrid
              rows={[
                ["Gesellschafter", partner.partner_name],
                ["E-Mail", partner.email || "—"],
                ["Beteiligungsquote", `${partner.anteil_pct.toFixed(2)} %`],
                ["Einnahmenanteil", fmtEur(partner.total_income)],
                ["Werbungskostenanteil", fmtEur(partner.total_expenses)],
                ["AfA-Anteil", fmtEur(partner.depreciation_total)],
                ["Sonderabzüge", fmtEur(partner.special_deductions_total)],
                ["Sonderwerbungskosten", fmtEur(partner.partner_special_expenses)],
                ["Ergebnis vor Partnerwerten", fmtEur(partner.result_before_partner_adjustments)],
                ["Zuzurechnendes Ergebnis", fmtEur(partner.result)],
              ]}
            />
          </PrintPage>
        ))}
      </div>
    </main>
  );
}

function PrintPage({
  title,
  subtitle,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  footer?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="print-page rounded-2xl border border-slate-300 bg-white p-10 shadow-sm">
      <header className="mb-8 border-b border-slate-200 pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">MyImmoHub Export</p>
        <h2 className="mt-2 text-3xl font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="mt-2 text-sm text-slate-500">{subtitle}</p>}
      </header>
      <div className="space-y-8">{children}</div>
      {footer && <footer className="mt-10 border-t border-slate-200 pt-4 text-xs text-slate-400">{footer}</footer>}
    </section>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h3>;
}

function FieldGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-slate-200 px-4 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</p>
          <p className="mt-2 text-base text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}
