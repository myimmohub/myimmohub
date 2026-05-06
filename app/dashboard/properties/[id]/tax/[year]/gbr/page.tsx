"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TaxYearNavigation from "@/components/tax/TaxYearNavigation";
import SonderWkEditor, {
  type SonderWkPartner as EditorPartner,
} from "@/components/tax/SonderWkEditor";
import { allocateElsterLineSummary, buildElsterLineSummary } from "@/lib/tax/elsterLineLogic";
import { computeRentalShare } from "@/lib/tax/rentalShare";
import type { GbrTaxReport } from "@/types/tax";
import { parseGermanDecimal, fmtDecimal } from "@/lib/utils/numberFormat";

const fmtEur = (value: number) =>
  value.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function GbrTaxYearPage() {
  const { id, year } = useParams<{ id: string; year: string }>();
  const taxYear = Number(year);

  const [report, setReport] = useState<GbrTaxReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnerSpecialValues, setPartnerSpecialValues] = useState<Record<string, string>>({});
  const [savingPartnerId, setSavingPartnerId] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [rentalShareValue, setRentalShareValue] = useState("");
  const [savingRentalShare, setSavingRentalShare] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/tax/gbr-report?property_id=${id}&tax_year=${taxYear}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null;
        setError(data?.error ?? "GbR-Steuerreport konnte nicht geladen werden.");
        setLoading(false);
        return;
      }
      const nextReport = await res.json() as GbrTaxReport;
      setReport(nextReport);
      setPartnerSpecialValues(
        Object.fromEntries(nextReport.fb.map((partner) => [
          partner.partner_id,
          partner.partner_special_expenses ? String(partner.partner_special_expenses) : "",
        ])),
      );
      setRentalShareValue(fmtDecimal(nextReport.gbr.rental_share_pct * 100, 2, 2));
      setLoading(false);
    };
    void load();
  }, [id, taxYear]);

  const reloadReport = async () => {
    const res = await fetch(`/api/tax/gbr-report?property_id=${id}&tax_year=${taxYear}`);
    if (!res.ok) return;
    const nextReport = await res.json() as GbrTaxReport;
    setReport(nextReport);
    setPartnerSpecialValues(
      Object.fromEntries(nextReport.fb.map((partner) => [
        partner.partner_id,
        partner.partner_special_expenses ? String(partner.partner_special_expenses) : "",
      ])),
    );
    setRentalShareValue(fmtDecimal(nextReport.gbr.rental_share_pct * 100, 2, 2));
  };

  const savePartnerSpecialExpenses = async (partnerId: string) => {
    setSavingPartnerId(partnerId);
    setSaveMessage(null);
    const rawValue = partnerSpecialValues[partnerId]?.trim() ?? "";
    const specialExpenses = rawValue === "" ? 0 : parseGermanDecimal(rawValue);

    const res = await fetch("/api/settings/gbr/partner-tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id: id,
        gbr_partner_id: partnerId,
        tax_year: taxYear,
        special_expenses: Number.isNaN(specialExpenses) ? 0 : specialExpenses,
      }),
    });

    setSavingPartnerId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      setSaveMessage(data?.error ?? "Sonderwerbungskosten konnten nicht gespeichert werden.");
      return;
    }

    await reloadReport();
    setSaveMessage("Sonderwerbungskosten gespeichert.");
    setTimeout(() => setSaveMessage(null), 2000);
  };

  const saveRentalShare = async () => {
    setSavingRentalShare(true);
    setSaveMessage(null);
    const parsed = parseGermanDecimal(rentalShareValue);
    const normalized = Number.isNaN(parsed) ? null : Math.max(0, Math.min(100, parsed)) / 100;

    const res = await fetch("/api/settings/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id: id,
        tax_year: taxYear,
        rental_share_override_pct: normalized,
      }),
    });

    setSavingRentalShare(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      setSaveMessage(data?.error ?? "Vermietungsanteil konnte nicht gespeichert werden.");
      return;
    }
    await reloadReport();
    setSaveMessage("Vermietungsanteil gespeichert.");
    setTimeout(() => setSaveMessage(null), 2000);
  };

  if (loading) return <Skeleton />;

  if (!report || error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <section className="mx-auto w-full max-w-5xl space-y-6">
          <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
            <Link href={`/dashboard/properties/${id}/tax`} className="hover:text-slate-900 dark:hover:text-slate-100">Steuerdaten</Link>
            <span>/</span>
            <Link href={`/dashboard/properties/${id}/tax/${taxYear}`} className="hover:text-slate-900 dark:hover:text-slate-100">{taxYear}</Link>
            <span>/</span>
            <span className="text-slate-900 dark:text-slate-100">GbR</span>
          </nav>
          <div className="rounded-xl border border-red-200 bg-white px-5 py-4 dark:border-red-900 dark:bg-slate-900">
            <p className="text-sm font-medium text-red-700 dark:text-red-400">{error ?? "Unbekannter Fehler."}</p>
          </div>
        </section>
      </main>
    );
  }

  const rentalShareInfo = computeRentalShare({
    eigennutzung_tage: report.gbr.eigennutzung_tage,
    gesamt_tage: report.gbr.gesamt_tage,
    rental_share_override_pct: report.gbr.rental_share_source === "override" ? report.gbr.rental_share_pct : null,
  });
  const lineSummary = buildElsterLineSummary(report.tax_data, {
    maintenanceDistributions: report.logic.maintenance_distributions,
    taxYear,
  });

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href={`/dashboard/properties/${id}/tax`} className="hover:text-slate-900 dark:hover:text-slate-100">Steuerdaten</Link>
          <span>/</span>
          <Link href={`/dashboard/properties/${id}/tax/${taxYear}`} className="hover:text-slate-900 dark:hover:text-slate-100">{taxYear}</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-100">GbR</span>
        </nav>

        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              GbR-Steuererklärung {taxYear}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {report.gbr.name || report.property_name || "GbR"}{report.property_address ? ` · ${report.property_address}` : ""}
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href={`/dashboard/properties/${id}/tax/${taxYear}/gbr/pdf`}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              PDF herunterladen
            </Link>
            <Link
              href={`/dashboard/properties/${id}/tax/${taxYear}/gbr/export`}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              FE/FB Export
            </Link>
          </div>
        </div>

        <TaxYearNavigation
          propertyId={id}
          taxYear={taxYear}
          active="gbr"
          hasGbr
        />

        {report.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Bitte prüfen</p>
            <div className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
              {report.warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <MetricCard label="Partner" value={String(report.gbr.partner_count)} />
          <MetricCard label="Anteile gesamt" value={`${fmtDecimal(report.gbr.partner_total_share_pct, 2, 2)} %`} />
          <MetricCard label="Anlage FE Ergebnis" value={fmtEur(report.fe.final_result)} tone={report.fe.final_result < 0 ? "positive" : "neutral"} />
          <MetricCard label="Engine-Status" value={report.engine?.status === "ok" ? "OK" : report.engine?.status === "review_required" ? "Prüfen" : report.engine?.status === "blocking_error" ? "Blockiert" : report.gbr.feststellungserklaerung ? "Aktiv" : "Inaktiv"} />
        </div>

        {report.engine && (
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tax Engine</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Klassifikation und sichere Routing-Entscheidung aus der neuen Rental-Tax-Engine
              </p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
              <MetricCard label="Filing-Profil" value={report.engine.filing_profile} />
              <MetricCard label="Ownership" value={report.engine.ownership_model} />
              <MetricCard label="Rental Mode" value={report.engine.rental_mode} />
              <MetricCard label="Income Regime" value={report.engine.income_regime} />
            </div>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Anlage FE</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Zusammengefasste Einkünfte aus Vermietung und Verpachtung auf Ebene der GbR
              </p>
            </div>
            <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
              <Row label="Gesamteinnahmen" value={fmtEur(report.fe.total_income)} />
              <Row label="Werbungskosten gesamt" value={fmtEur(report.fe.total_expenses)} />
              <Row label="AfA gesamt" value={fmtEur(report.fe.depreciation_total)} />
              <Row label="Sonderabzüge gesamt" value={fmtEur(report.fe.special_deductions_total)} />
              <Row label="Ergebnis vor Partnerwerten" value={fmtEur(report.fe.collective_result)} />
              <Row label="Sonderwerbungskosten Partner" value={fmtEur(report.fe.partner_special_expenses_total)} />
              <Row label="Gesamtergebnis" value={fmtEur(report.fe.final_result)} strong />
            </div>
          </section>

          <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">GbR-Stammdaten</h2>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Diese Angaben werden für die Feststellungserklärung herangezogen
              </p>
            </div>
            <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
              <Row label="Name" value={report.gbr.name || "—"} />
              <Row label="Steuernummer" value={report.gbr.steuernummer || "—"} />
              <Row label="Finanzamt" value={report.gbr.finanzamt || "—"} />
              <Row label="Sonderwerbungskosten je Partner" value={report.gbr.sonder_werbungskosten ? "Ja" : "Nein"} />
              <Row label="Teilweise Eigennutzung" value={report.gbr.teilweise_eigennutzung ? "Ja" : "Nein"} />
              <div className="flex items-center justify-between gap-4 py-3">
                <div>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Vermietungsanteil FE/FB</p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Quelle: {report.gbr.rental_share_source === "override" ? "manuell" : `automatisch aus ${report.gbr.eigennutzung_tage}/${report.gbr.gesamt_tage} Tagen`}
                  </p>
                  {rentalShareInfo.warnings.length > 0 && (
                    <div className="mt-1 space-y-1 text-xs text-amber-600 dark:text-amber-400">
                      {rentalShareInfo.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="decimal"
                    value={rentalShareValue}
                    onChange={(e) => setRentalShareValue(e.target.value)}
                    className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    placeholder="100,00"
                  />
                  <span className="text-sm text-slate-400">%</span>
                  <button
                    type="button"
                    onClick={() => void saveRentalShare()}
                    disabled={savingRentalShare}
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    {savingRentalShare ? "..." : "Speichern"}
                  </button>
                </div>
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <BucketPanel title="FE-Herleitung: Einnahmen & Werbungskosten" items={[
            ...lineSummary.income_buckets,
            ...lineSummary.expense_buckets,
          ]} total={lineSummary.income_total - lineSummary.advertising_costs_total} />
          <BucketPanel title="FE-Herleitung: AfA & Sonderabzüge" items={[
            ...lineSummary.depreciation_buckets,
            ...lineSummary.special_buckets,
          ]} total={-(lineSummary.depreciation_total + lineSummary.special_deductions_total)} />
        </div>

        {(report.logic.depreciation_items.length > 0 || report.logic.maintenance_distributions.length > 0) && (
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">AfA-Logik</h2>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  Komponenten werden separat gekürzt und gerundet, bevor sie in Anlage FE/FB einfließen.
                </p>
              </div>
              <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
                {report.logic.depreciation_items.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500 dark:text-slate-400">Keine AfA-Komponenten hinterlegt.</p>
                ) : (
                  report.logic.depreciation_items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</p>
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                          {item.item_type === "building" ? "Gebäude" : item.item_type === "movable_asset" ? "Inventar" : "Außenanlagen"}
                          {item.apply_rental_ratio ? " · mit Vermietungsquote" : " · 100 %"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{fmtEur(item.gross_annual_amount)}</p>
                        <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          ELSTER {item.deductible_amount_elster.toLocaleString("de-DE")} €
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Verteilter Erhaltungsaufwand</h2>
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  Vorjahresblöcke und neue Verteilungen werden positionsbezogen fortgeführt.
                </p>
              </div>
              <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
                {report.logic.maintenance_distributions.length === 0 ? (
                  <p className="py-4 text-sm text-slate-500 dark:text-slate-400">Keine aktiven Verteilungsblöcke für dieses Jahr.</p>
                ) : (
                  report.logic.maintenance_distributions.map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-4 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.label}</p>
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                          Ursprung {item.source_year} · {item.distribution_years} Jahre · Jahresanteil {fmtEur(item.current_year_share)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{fmtEur(item.total_amount)}</p>
                        <p className="mt-0.5 text-xs font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                          ELSTER {item.deductible_amount_elster.toLocaleString("de-DE")} €
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        )}

        <SonderWkEditor
          propertyId={id}
          taxYear={taxYear}
          partners={report.fb.map<EditorPartner>((partner) => ({
            id: partner.partner_id,
            name: partner.partner_name,
          }))}
        />

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Anlage FB je Gesellschafter</h2>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              Automatische Verteilung des Anlage-V-Ergebnisses nach hinterlegten Beteiligungsquoten
            </p>
          </div>
          {saveMessage && (
            <p className="mx-5 mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              {saveMessage}
            </p>
          )}
          {report.fb.length === 0 ? (
            <p className="px-5 py-5 text-sm text-slate-500 dark:text-slate-400">
              Keine Partner vorhanden. Hinterlege zuerst Partner in den GbR-Einstellungen.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                    <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Partner</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Anteil</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Einnahmen</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Kosten</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">AfA + Sonder</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Sonder-WK</th>
                    <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Ergebnis</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {report.fb.map((partner) => {
                    const allocated = allocateElsterLineSummary(lineSummary, partner.anteil_pct);
                    return (
                      <>
                        <tr key={partner.partner_id}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{partner.partner_name}</p>
                            <p className="text-xs text-slate-400 dark:text-slate-500">{partner.email || "Keine E-Mail"}</p>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{fmtDecimal(partner.anteil_pct, 2, 2)} %</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{fmtEur(partner.total_income)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{fmtEur(partner.total_expenses)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-400">{fmtEur(partner.depreciation_total + partner.special_deductions_total)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={partnerSpecialValues[partner.partner_id] ?? ""}
                                onChange={(e) => setPartnerSpecialValues((prev) => ({ ...prev, [partner.partner_id]: e.target.value }))}
                                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                placeholder="0,00"
                              />
                              <button
                                type="button"
                                onClick={() => void savePartnerSpecialExpenses(partner.partner_id)}
                                disabled={savingPartnerId === partner.partner_id}
                                className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                {savingPartnerId === partner.partner_id ? "..." : "Speichern"}
                              </button>
                            </div>
                          </td>
                          <td className={`px-4 py-3 text-right font-semibold tabular-nums ${partner.result < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}`}>
                            {fmtEur(partner.result)}
                          </td>
                        </tr>
                        <tr key={`${partner.partner_id}-logic`} className="bg-slate-50/60 dark:bg-slate-800/30">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="grid gap-4 lg:grid-cols-2">
                              <BucketPanel title={`FB-Herleitung ${partner.partner_name}: Einnahmen & Kosten`} items={[
                                ...allocated.income_buckets.map((bucket) => ({ ...bucket, amount: bucket.allocated_amount })),
                                ...allocated.expense_buckets.map((bucket) => ({ ...bucket, amount: bucket.allocated_amount })),
                              ]} total={allocated.income_total - allocated.advertising_costs_total} compact />
                              <BucketPanel title={`FB-Herleitung ${partner.partner_name}: AfA & Sonder`} items={[
                                ...allocated.depreciation_buckets.map((bucket) => ({ ...bucket, amount: bucket.allocated_amount })),
                                ...allocated.special_buckets.map((bucket) => ({ ...bucket, amount: bucket.allocated_amount })),
                              ]} total={-(allocated.depreciation_total + allocated.special_deductions_total)} compact />
                            </div>
                          </td>
                        </tr>
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function MetricCard({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "positive" | "neutral" }) {
  const toneClass = tone === "positive"
    ? "text-emerald-600 dark:text-emerald-400"
    : tone === "neutral"
      ? "text-slate-900 dark:text-slate-100"
      : "text-slate-900 dark:text-slate-100";

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`mt-2 text-lg font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm tabular-nums ${strong ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
        {value}
      </span>
    </div>
  );
}

function Skeleton() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <div className="h-8 w-72 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        <div className="grid gap-4 md:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
        </div>
        {[1, 2, 3].map((i) => <div key={i} className="h-64 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
      </section>
    </main>
  );
}

function BucketPanel({
  title,
  items,
  total,
  compact = false,
}: {
  title: string;
  items: { key: string; label: string; amount: number; detail?: string }[];
  total: number;
  compact?: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between gap-4">
        <h3 className={`${compact ? "text-xs" : "text-sm"} font-semibold text-slate-900 dark:text-slate-100`}>{title}</h3>
        <span className={`${compact ? "text-xs" : "text-sm"} font-semibold tabular-nums text-slate-900 dark:text-slate-100`}>
          {fmtEur(total)}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {items.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Keine Werte vorhanden.</p>
        ) : (
          items.map((item) => (
            <div key={`${title}-${item.key}`} className="flex items-start justify-between gap-4">
              <div>
                <p className={`${compact ? "text-xs" : "text-sm"} text-slate-700 dark:text-slate-300`}>{item.label}</p>
                {item.detail ? <p className="text-xs text-slate-500 dark:text-slate-400">{item.detail}</p> : null}
              </div>
              <span className={`${compact ? "text-xs" : "text-sm"} tabular-nums text-slate-600 dark:text-slate-300`}>
                {fmtEur(item.amount)}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
