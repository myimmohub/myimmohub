"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TaxYearNavigation from "@/components/tax/TaxYearNavigation";
import { buildElsterLineSummary } from "@/lib/tax/elsterLineLogic";
import { formatDateForDisplay } from "@/lib/tax/partnerNormalization";
import type { GbrTaxReport } from "@/types/tax";

const fmtEur = (value: number | null | undefined) =>
  value == null
    ? "—"
    : value.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";

const fmtPct = (value: number | null | undefined) =>
  value == null ? "—" : `${(value * 100).toFixed(2).replace(".", ",")} %`;

const fmtIntPct = (value: number | null | undefined) =>
  value == null ? "—" : `${value.toFixed(2).replace(".", ",")} %`;

const fmtDate = (value: string | null | undefined) => formatDateForDisplay(value);

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

  const anlageVIncomeRows = useMemo(() => {
    if (!report) return [];
    return [
      ["9", "Mieteinnahmen", fmtEur(report.tax_data.rent_income ?? null)],
      ["10", "Mieteinnahmen Gewerbe", fmtEur(report.tax_data.rent_prior_year ?? null)],
      ["13", "Umlagen / Nebenkosten", fmtEur(report.tax_data.operating_costs_income ?? null)],
      ["14", "Sonstige Einnahmen", fmtEur(report.tax_data.other_income ?? null)],
    ] as const;
  }, [report]);

  const anlageVExpenseRows = useMemo(() => {
    if (!report) return [];
    const taxData = report.tax_data;
    const lineSummary = buildElsterLineSummary(taxData);
    return [
      ["33", "AfA Gebäude", fmtEur(taxData.depreciation_building ?? null)],
      ["34", "AfA Außenanlagen", fmtEur(taxData.depreciation_outdoor ?? null)],
      ["35", "AfA Inventar", fmtEur(taxData.depreciation_fixtures ?? null)],
      ["39", "Erhaltungsaufwand", fmtEur(taxData.maintenance_costs ?? null)],
      ["46", "Grundsteuer", fmtEur(taxData.property_tax ?? null)],
      ["47", "Schuldzinsen", fmtEur(taxData.loan_interest ?? null)],
      ["48", "Versicherungen", fmtEur(taxData.insurance ?? null)],
      ["49", "Hausverwaltung / Hausgeld", fmtEur(taxData.property_management ?? null)],
      ["50", "Sonstige Werbungskosten", fmtEur(lineSummary.expense_buckets.find((bucket) => bucket.key === "other_expenses")?.amount ?? 0)],
      ["60", "Sonderabschreibung § 7b", fmtEur(taxData.special_deduction_7b ?? null)],
      ["61", "Weitere Sonderabzüge", fmtEur(taxData.special_deduction_renovation ?? null)],
    ] as const;
  }, [report]);

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
        @page {
          size: A4;
          margin: 12mm;
        }
        @media print {
          .print-hide { display: none !important; }
          .print-page {
            break-after: page;
            page-break-after: always;
            box-shadow: none !important;
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
          <h1 className="text-2xl font-semibold text-slate-900">ELSTER-PDF-Vorschau {taxYear}</h1>
          <p className="mt-1 text-sm text-slate-500">
            Formularartige Druckansicht mit Anlage V, Anlage FE und allen Anlage-FB-Seiten.
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

      <section className="mx-auto mb-6 max-w-5xl print-hide">
        <TaxYearNavigation
          propertyId={id}
          taxYear={taxYear}
          active="gbr-pdf"
          hasGbr
        />
      </section>

      <div className="mx-auto max-w-5xl space-y-6">
        <ElsterPage
          formTitle={`Anlage V ${taxYear}`}
          formSubtitle="Einkünfte aus Vermietung und Verpachtung"
          propertyName={report.property_name || "Immobilie"}
          propertyAddress={report.property_address}
        >
          <InfoStrip
            items={[
              ["Steuerjahr", String(report.tax_year)],
              ["Steuer-Nr.", report.tax_data.tax_ref || "—"],
              ["Beteiligung", report.tax_data.ownership_share_pct != null ? fmtIntPct(report.tax_data.ownership_share_pct) : "—"],
              ["Objektart", report.tax_data.property_type || "—"],
            ]}
          />

          <ElsterSection title="1. Objektangaben">
            <FormGrid
              rows={[
                ["1-8", "Anschrift / Objekt", `${report.property_name || "—"}${report.property_address ? `, ${report.property_address}` : ""}`],
                ["4", "Baujahr", report.tax_data.build_year ? String(report.tax_data.build_year) : "—"],
                ["5", "Anschaffungsdatum", fmtDate(report.tax_data.acquisition_date)],
                ["6", "Gebäudekosten", fmtEur(report.tax_data.acquisition_cost_building ?? null)],
              ]}
            />
          </ElsterSection>

          <ElsterSection title="2. Einnahmen">
            <FormGrid rows={anlageVIncomeRows} />
          </ElsterSection>

          <ElsterSection title="3. Werbungskosten / AfA / Sonderabzüge">
            <FormGrid rows={anlageVExpenseRows} />
          </ElsterSection>

          <ElsterSection title="3b. Verdichtete Kostenblöcke">
            <FormGrid
              rows={buildElsterLineSummary(report.tax_data).expense_buckets.map((bucket, index) => [
                `WK-${index + 1}`,
                bucket.detail ? `${bucket.label} (${bucket.detail})` : bucket.label,
                fmtEur(bucket.amount),
              ])}
            />
          </ElsterSection>

          <ElsterSection title="4. Ergänzende Berechnungsbasis">
            <FormGrid
              rows={[
                ["", "Vermietungsanteil", fmtPct(report.gbr.rental_share_pct)],
                ["", "Quelle Vermietungsanteil", report.gbr.rental_share_source === "override" ? "Manuell" : "Automatisch"],
                ["", "Teilweise Eigennutzung", report.gbr.teilweise_eigennutzung ? "Ja" : "Nein"],
                ["", "Eigennutzungstage", String(report.gbr.eigennutzung_tage)],
                ["", "Gesamttage", String(report.gbr.gesamt_tage)],
              ]}
            />
          </ElsterSection>
        </ElsterPage>

        <ElsterPage
          formTitle={`Anlage FE ${taxYear}`}
          formSubtitle="Erklärung zur gesonderten und einheitlichen Feststellung"
          propertyName={report.gbr.name || report.property_name || "GbR"}
          propertyAddress={report.property_address}
        >
          <InfoStrip
            items={[
              ["Gesellschaft", report.gbr.name || "—"],
              ["Steuernummer", report.gbr.steuernummer || "—"],
              ["Finanzamt", report.gbr.finanzamt || "—"],
              ["Gesellschafter", String(report.gbr.partner_count)],
            ]}
          />

          <ElsterSection title="1. Angaben zur Gesellschaft">
            <FormGrid
              rows={[
                ["1", "Feststellungserklärung", report.gbr.feststellungserklaerung ? "Ja" : "Nein"],
                ["2", "Sonderwerbungskosten je Partner", report.gbr.sonder_werbungskosten ? "Ja" : "Nein"],
                ["3", "Teilweise Eigennutzung", report.gbr.teilweise_eigennutzung ? "Ja" : "Nein"],
                ["4", "Gesamte Beteiligungsquote", `${report.gbr.partner_total_share_pct.toFixed(2).replace(".", ",")} %`],
              ]}
            />
          </ElsterSection>

          <ElsterSection title="2. Festzustellende Einkünfte">
            <FormGrid
              rows={[
                ["20", "Gesamteinnahmen V+V", fmtEur(report.fe.total_income)],
                ["21", "Werbungskosten gesamt", fmtEur(report.fe.total_expenses)],
                ["22", "AfA gesamt", fmtEur(report.fe.depreciation_total)],
                ["23", "Sonderabzüge gesamt", fmtEur(report.fe.special_deductions_total)],
                ["24", "Ergebnis vor Partnerwerten", fmtEur(report.fe.collective_result)],
                ["25", "Sonderwerbungskosten Partner", fmtEur(report.fe.partner_special_expenses_total)],
                ["26", "Festzustellendes Ergebnis", fmtEur(report.fe.final_result)],
              ]}
            />
          </ElsterSection>

          {report.warnings.length > 0 && (
            <ElsterSection title="3. Hinweise">
              <NoticeBox>
                {report.warnings.map((warning) => (
                  <p key={warning}>{warning}</p>
                ))}
              </NoticeBox>
            </ElsterSection>
          )}
        </ElsterPage>

        {report.fb.map((partner, index) => (
          <ElsterPage
            key={partner.partner_id}
            formTitle={`Anlage FB ${taxYear}`}
            formSubtitle="Anteilige Zurechnung für Gesellschafter"
            propertyName={partner.partner_name}
            propertyAddress={partner.email}
            pageLabel={`FB ${index + 1}/${report.fb.length}`}
          >
            <InfoStrip
              items={[
                ["Gesellschafter", partner.partner_name],
                ["E-Mail", partner.email || "—"],
                ["Beteiligungsquote", `${partner.anteil_pct.toFixed(2).replace(".", ",")} %`],
                ["Steuerjahr", String(report.tax_year)],
              ]}
            />

            <ElsterSection title="1. Zurechnungsdaten">
              <FormGrid
                rows={[
                  ["30", "Einnahmenanteil", fmtEur(partner.total_income)],
                  ["31", "Werbungskostenanteil", fmtEur(partner.total_expenses)],
                  ["32", "AfA-Anteil", fmtEur(partner.depreciation_total)],
                  ["33", "Sonderabzüge", fmtEur(partner.special_deductions_total)],
                  ["34", "Sonderwerbungskosten", fmtEur(partner.partner_special_expenses)],
                  ["35", "Ergebnis vor Partnerwerten", fmtEur(partner.result_before_partner_adjustments)],
                  ["36", "Zuzurechnendes Ergebnis", fmtEur(partner.result)],
                ]}
              />
            </ElsterSection>
          </ElsterPage>
        ))}
      </div>
    </main>
  );
}

function ElsterPage({
  formTitle,
  formSubtitle,
  propertyName,
  propertyAddress,
  pageLabel,
  children,
}: {
  formTitle: string;
  formSubtitle: string;
  propertyName: string;
  propertyAddress?: string | null;
  pageLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="print-page overflow-hidden rounded-sm border border-slate-400 bg-white p-8 shadow-sm">
      <header className="border-b border-slate-300 pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">Mein ELSTER · Formularansicht</p>
            <h2 className="text-2xl font-semibold text-slate-900">{formTitle}</h2>
            <p className="text-sm text-slate-600">{formSubtitle}</p>
          </div>
          <div className="min-w-[11rem] rounded-sm border border-slate-400 px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">Vordruck</p>
            <p className="mt-1 text-sm font-medium text-slate-900">{pageLabel || formTitle}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1.1fr_0.9fr]">
          <HeaderField label="Steuerpflichtiger / Gesellschaft" value={propertyName} />
          <HeaderField label="Objekt / Zusatz" value={propertyAddress || "—"} />
        </div>
      </header>

      <div className="space-y-6 pt-5">{children}</div>
    </section>
  );
}

function HeaderField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-slate-300 px-3 py-2">
      <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm text-slate-900">{value}</p>
    </div>
  );
}

function InfoStrip({ items }: { items: [string, string][] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map(([label, value]) => (
        <div key={label} className="rounded-sm border border-slate-300 px-3 py-2">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{label}</p>
          <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
        </div>
      ))}
    </div>
  );
}

function ElsterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="border-b border-slate-300 pb-2">
        <h3 className="text-sm font-medium uppercase tracking-[0.16em] text-slate-700">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function FormGrid({ rows }: { rows: ReadonlyArray<readonly [string, string, string]> }) {
  return (
    <div className="overflow-hidden rounded-sm border border-slate-300">
      <div className="grid grid-cols-[72px_1.1fr_0.9fr] bg-slate-100 text-[10px] uppercase tracking-[0.14em] text-slate-500">
        <div className="border-r border-slate-300 px-3 py-2">Zeile</div>
        <div className="border-r border-slate-300 px-3 py-2">Feld</div>
        <div className="px-3 py-2">Wert</div>
      </div>
      {rows.map(([line, label, value], index) => (
        <div key={`${line}-${label}`} className={`grid grid-cols-[72px_1.1fr_0.9fr] ${index !== rows.length - 1 ? "border-b border-slate-300" : ""}`}>
          <div className="flex items-center border-r border-slate-300 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
            {line || "—"}
          </div>
          <div className="border-r border-slate-300 px-3 py-2 text-sm text-slate-800">{label}</div>
          <div className="px-3 py-2">
            <div className="min-h-[2.25rem] rounded-sm border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900">
              {value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function NoticeBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-sm border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      {children}
    </div>
  );
}
