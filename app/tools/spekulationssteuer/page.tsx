"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SliderInput from "@/components/marketing/SliderInput";
import { calcSpekulationssteuer, type SpekulationsStatus } from "@/lib/calculators/spekulationssteuer";
import { fmtEUR, fmtDate } from "@/lib/format";

const STATUS_INFO: Record<SpekulationsStatus, { label: string; desc: string; bg: string; text: string }> = {
  steuerfrei_10j: {
    label: "Bereits steuerfrei",
    desc: "Die 10-jährige Spekulationsfrist ist abgelaufen.",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  steuerfrei_selbstnutzung: {
    label: "Steuerfrei durch Selbstnutzung",
    desc: "Eigennutzung in den letzten 2 Kalenderjahren vor Verkauf (§ 23 Abs. 1 Nr. 1 EStG).",
    bg: "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  steuerpflichtig: {
    label: "Steuerpflichtig",
    desc: "Die 10-jährige Spekulationsfrist ist noch nicht abgelaufen.",
    bg: "bg-red-50 border-red-200 dark:bg-red-950/20 dark:border-red-800",
    text: "text-red-700 dark:text-red-400",
  },
};

function todayISO() {
  return new Date().toISOString().split("T")[0];
}

export default function SpekulationssteuerRechner() {
  const [kaufdatum, setKaufdatum] = useState("2016-01-15");
  const [verkaufsdatum, setVerkaufsdatum] = useState(todayISO);
  const [kaufpreis, setKaufpreis] = useState(250_000);
  const [verkaufspreis, setVerkaufspreis] = useState(350_000);
  const [steuersatzPct, setSteuersatzPct] = useState(35);
  const [selbstgenutzt, setSelbstgenutzt] = useState(false);

  const result = useMemo(
    () =>
      calcSpekulationssteuer({
        kaufdatum,
        verkaufsdatum,
        kaufpreis,
        verkaufspreis,
        steuersatzPct,
        selbstgenutzt,
      }),
    [kaufdatum, verkaufsdatum, kaufpreis, verkaufspreis, steuersatzPct, selbstgenutzt],
  );

  const statusInfo = result ? STATUS_INFO[result.status] : null;

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 dark:bg-slate-950">
      <div className="mx-auto max-w-xl space-y-6">
        {/* Back */}
        <Link
          href="/tools"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
        >
          <ChevronLeftIcon className="h-4 w-4" /> Alle Rechner
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Spekulationssteuer-Rechner
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Ab wann kann ich steuerfrei verkaufen?
          </p>
        </div>

        {/* Dates card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Zeitraum
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Kaufdatum
              </label>
              <input
                type="date"
                value={kaufdatum}
                onChange={(e) => setKaufdatum(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Geplantes Verkaufsdatum
              </label>
              <input
                type="date"
                value={verkaufsdatum}
                onChange={(e) => setVerkaufsdatum(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
          </div>

          {/* Selbstnutzung toggle */}
          <label className="mt-4 flex cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={selbstgenutzt}
              onChange={(e) => setSelbstgenutzt(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 accent-blue-600 dark:border-slate-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Immobilie in den letzten 2 Jahren selbst bewohnt
            </span>
          </label>
        </div>

        {/* Prices + tax card */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Preise &amp; Steuersatz
          </h2>
          <div className="space-y-6">
            <SliderInput
              label="Kaufpreis"
              value={kaufpreis}
              min={50_000}
              max={2_000_000}
              step={10_000}
              displayValue={fmtEUR(kaufpreis)}
              onChange={setKaufpreis}
            />
            <SliderInput
              label="Geplanter Verkaufspreis"
              value={verkaufspreis}
              min={50_000}
              max={2_000_000}
              step={10_000}
              displayValue={fmtEUR(verkaufspreis)}
              onChange={setVerkaufspreis}
            />
            <SliderInput
              label="Persönlicher Steuersatz"
              value={steuersatzPct}
              min={14}
              max={45}
              step={1}
              displayValue={`${steuersatzPct} %`}
              onChange={setSteuersatzPct}
            />
          </div>
        </div>

        {/* Result */}
        {result && statusInfo && (
          <>
            {/* Status banner */}
            <div className={`rounded-xl border p-4 ${statusInfo.bg}`}>
              <p className={`text-sm font-semibold ${statusInfo.text}`}>{statusInfo.label}</p>
              <p className={`mt-1 text-xs ${statusInfo.text} opacity-80`}>{statusInfo.desc}</p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Ergebnis</h2>
              <div className="space-y-3">
                <ResultRow
                  label="Haltedauer"
                  value={`${result.halteJahre} Jahre, ${result.halteMonate} Monate`}
                />
                <ResultRow
                  label="Steuerfreies Verkaufsdatum"
                  value={fmtDate(result.steuerfreiAb)}
                />
                <ResultRow
                  label="Gewinn (brutto)"
                  value={fmtEUR(result.gewinn)}
                  valueClass={
                    result.gewinn >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }
                />
                {result.status === "steuerpflichtig" && result.gewinn > 0 ? (
                  <>
                    <ResultRow
                      label={`Spekulationssteuer (${steuersatzPct} %)`}
                      value={fmtEUR(result.steuer)}
                      valueClass="text-red-600 dark:text-red-400"
                    />
                    <ResultRow
                      label="Nettogewinn nach Steuer"
                      value={fmtEUR(result.nettogewinn)}
                      last
                    />
                  </>
                ) : (
                  <ResultRow
                    label="Spekulationssteuer"
                    value="Keine (0 €)"
                    valueClass="text-emerald-600 dark:text-emerald-400"
                    last
                  />
                )}
              </div>
            </div>

            {/* Tipp */}
            {result.status === "steuerpflichtig" && result.gewinn > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/20">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">Tipp:</span> Warte bis zum{" "}
                  <span className="font-semibold">{fmtDate(result.steuerfreiAb)}</span>, um{" "}
                  <span className="font-semibold">{fmtEUR(result.steuer)}</span>{" "}
                  Spekulationssteuer zu sparen.
                </p>
              </div>
            )}
          </>
        )}

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Diese Berechnung dient nur zur Orientierung und ersetzt keine Steuerberatung.
          Maßgeblich ist § 23 EStG.
        </p>

        {/* CTA */}
        <CtaCard text="Behalte den Überblick über all deine Immobilien – kostenlos mit MyImmoHub." />
      </div>
    </div>
  );
}

function ResultRow({
  label, value, valueClass, last = false,
}: { label: string; value: string; valueClass?: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${!last ? "border-b border-slate-100 dark:border-slate-800" : ""}`}>
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${valueClass ?? "text-slate-900 dark:text-slate-100"}`}>{value}</span>
    </div>
  );
}

function CtaCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{text}</p>
      <Link href="/auth" className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-medium text-white transition hover:bg-blue-700">
        Kostenlos starten
      </Link>
    </div>
  );
}

function ChevronLeftIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" />
    </svg>
  );
}
