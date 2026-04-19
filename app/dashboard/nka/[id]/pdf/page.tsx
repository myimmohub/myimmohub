"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { NkaCostItem, NkaPeriod, NkaTenantShare } from "@/types/nka";

type NkaPdfResponse = {
  period: NkaPeriod & {
    property: {
      id: string;
      name: string;
      address: string | null;
      ist_weg?: boolean | null;
      hausverwaltung_name?: string | null;
      hausverwaltung_email?: string | null;
    } | null;
  };
  cost_items: NkaCostItem[];
  tenant_shares: NkaTenantShare[];
};

function isNkaPdfResponse(value: NkaPdfResponse | { error?: string } | null): value is NkaPdfResponse {
  return Boolean(value && "period" in value && "cost_items" in value && "tenant_shares" in value);
}

function fmtEur(value: number | null | undefined) {
  return (value ?? 0).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
}

function fmtDate(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("de-DE");
}

export default function NkaPdfPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<NkaPdfResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const res = await fetch(`/api/nka/periods/${id}`);
      const json = await res.json().catch(() => null) as NkaPdfResponse | { error?: string } | null;
      if (cancelled) return;
      if (!res.ok || !isNkaPdfResponse(json)) return;
      setData(json);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const groupedItems = useMemo(() => {
    if (!data) return [];
    const groups = new Map<number, { position: number; total: number; items: NkaCostItem[] }>();
    for (const item of data.cost_items) {
      const existing = groups.get(item.betr_kv_position);
      if (existing) {
        existing.total += Number(item.betrag_brutto ?? 0);
        existing.items.push(item);
      } else {
        groups.set(item.betr_kv_position, {
          position: item.betr_kv_position,
          total: Number(item.betrag_brutto ?? 0),
          items: [item],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) => a.position - b.position);
  }, [data]);

  const totalChargeable = useMemo(
    () => (data?.cost_items ?? []).filter((item) => item.ist_umlagefaehig).reduce((sum, item) => sum + Number(item.betrag_brutto ?? 0), 0),
    [data],
  );
  const totalNonChargeable = useMemo(
    () => (data?.cost_items ?? []).filter((item) => !item.ist_umlagefaehig).reduce((sum, item) => sum + Number(item.betrag_brutto ?? 0), 0),
    [data],
  );
  const totalTenantShare = useMemo(
    () => (data?.tenant_shares ?? []).reduce((sum, share) => sum + Number(share.summe_anteile ?? 0), 0),
    [data],
  );
  const totalAdvance = useMemo(
    () => (data?.tenant_shares ?? []).reduce((sum, share) => sum + Number(share.summe_vorauszahlungen ?? 0), 0),
    [data],
  );

  if (!data) {
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
          <h1 className="text-2xl font-semibold text-slate-900">NKA-PDF-Vorschau</h1>
          <p className="mt-1 text-sm text-slate-500">
            Druckansicht für die Nebenkostenabrechnung mit Kostenübersicht und Mieteranteilen.
          </p>
        </div>
        <div className="flex gap-3">
          <Link
            href={`/dashboard/nka/${id}`}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Zurück zur NKA
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
        <section className="print-page overflow-hidden rounded-sm border border-slate-400 bg-white p-8 shadow-sm">
          <div className="flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">ImmoHub NKA</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-900">Nebenkostenabrechnung</h2>
              <p className="mt-2 text-sm text-slate-600">
                {data.period.property?.name ?? "Objekt"}
                {data.period.property?.address ? ` · ${data.period.property.address}` : ""}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <p><span className="font-medium">Abrechnungszeitraum:</span> {fmtDate(data.period.zeitraum_von)} bis {fmtDate(data.period.zeitraum_bis)}</p>
              <p className="mt-1"><span className="font-medium">Status:</span> {data.period.status}</p>
              <p className="mt-1"><span className="font-medium">Deadline:</span> {fmtDate(data.period.deadline_abrechnung)}</p>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <SummaryCard label="Umlagefähig" value={fmtEur(totalChargeable)} />
            <SummaryCard label="Nicht umlagefähig" value={fmtEur(totalNonChargeable)} />
            <SummaryCard label="Mieteranteile" value={String(data.tenant_shares.length)} />
          </div>

          <div className="mt-8">
            <SectionTitle title="Kostenübersicht nach BetrKV" subtitle="Gruppiert nach der jeweiligen Position der Betriebskostenverordnung." />
            <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">BetrKV</th>
                    <th className="px-4 py-3">Positionen</th>
                    <th className="px-4 py-3">Umlageschlüssel</th>
                    <th className="px-4 py-3">Summe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {groupedItems.length === 0 ? (
                    <tr><td className="px-4 py-6 text-slate-500" colSpan={4}>Noch keine Kostenpositionen vorhanden.</td></tr>
                  ) : groupedItems.map((group) => (
                    <tr key={group.position}>
                      <td className="px-4 py-4 align-top font-medium text-slate-900">Nr. {group.position}</td>
                      <td className="px-4 py-4 align-top text-slate-700">
                        <div className="space-y-2">
                          {group.items.map((item) => (
                            <div key={item.id}>
                              <div className="font-medium text-slate-900">{item.bezeichnung}</div>
                              <div className="text-xs text-slate-500">
                                {item.quelle}
                                {item.notiz ? ` · ${item.notiz}` : ""}
                              </div>
                            </div>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4 align-top text-slate-700">
                        {Array.from(new Set(group.items.map((item) => item.umlageschluessel))).join(", ")}
                      </td>
                      <td className="px-4 py-4 align-top font-medium text-slate-900">{fmtEur(group.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="print-page overflow-hidden rounded-sm border border-slate-400 bg-white p-8 shadow-sm">
          <SectionTitle
            title="Verteilung auf Mieter"
            subtitle="Erste Abrechnungsvorschau aus Wohnzeit, Umlageschlüssel und hinterlegten Vorauszahlungen."
          />

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <SummaryCard label="Anteile gesamt" value={fmtEur(totalTenantShare)} />
            <SummaryCard label="Vorauszahlungen" value={fmtEur(totalAdvance)} />
            <SummaryCard label="Saldo" value={fmtEur(totalTenantShare - totalAdvance)} />
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Mieter</th>
                  <th className="px-4 py-3">Bewohnt</th>
                  <th className="px-4 py-3">Tage</th>
                  <th className="px-4 py-3">Anteil</th>
                  <th className="px-4 py-3">Vorauszahlungen</th>
                  <th className="px-4 py-3">Nachzahlung / Guthaben</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tenant_shares.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>Noch keine Mieteranteile berechnet.</td></tr>
                ) : data.tenant_shares.map((share) => {
                  const result = Number(share.nachzahlung_oder_guthaben ?? (Number(share.summe_anteile ?? 0) - Number(share.summe_vorauszahlungen ?? 0)));
                  return (
                    <tr key={share.id}>
                      <td className="px-4 py-3 text-slate-900">{share.versandt_an_email ?? share.mieter_id}</td>
                      <td className="px-4 py-3 text-slate-700">{fmtDate(share.bewohnt_von)} bis {fmtDate(share.bewohnt_bis)}</td>
                      <td className="px-4 py-3 text-slate-700">{share.tage_anteil}</td>
                      <td className="px-4 py-3 text-slate-900">{fmtEur(Number(share.summe_anteile ?? 0))}</td>
                      <td className="px-4 py-3 text-slate-700">{fmtEur(Number(share.summe_vorauszahlungen ?? 0))}</td>
                      <td className={`px-4 py-3 font-medium ${result >= 0 ? "text-slate-900" : "text-emerald-700"}`}>{fmtEur(result)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-8 rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-sm text-slate-600">
            <p className="font-medium text-slate-900">Hinweis</p>
            <p className="mt-1">
              Diese PDF-Vorschau ist die produktive Grundlage für den nächsten Schritt. Sie bündelt Kostenpositionen und Mieteranteile bereits druckbar,
              ersetzt aber noch nicht die final juristisch ausgestaltete Versandfassung mit vollständigem Begleitschreiben.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
