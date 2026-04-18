"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SliderInput from "@/components/marketing/SliderInput";
import { calcKredit } from "@/lib/calculators/kredit";
import { fmtEUR, fmtPct } from "@/lib/format";

export default function KreditRechner() {
  const [kaufpreis, setKaufpreis] = useState(350_000);
  const [eigenkapital, setEigenkapital] = useState(70_000);
  const [zinssatzPct, setZinssatzPct] = useState(3.5);
  const [tilgungPct, setTilgungPct] = useState(2.0);
  const [zinsbindungJahre, setZinsbindungJahre] = useState(10);

  const result = useMemo(
    () => calcKredit({ kaufpreis, eigenkapital, zinssatzPct, tilgungPct, zinsbindungJahre }),
    [kaufpreis, eigenkapital, zinssatzPct, tilgungPct, zinsbindungJahre],
  );

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
            Kreditrechner
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Was kostet mich der Kredit pro Monat?
          </p>
        </div>

        {/* Inputs */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Finanzierungsdetails
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
              label="Eigenkapital"
              value={eigenkapital}
              min={0}
              max={Math.min(kaufpreis, 1_000_000)}
              step={5_000}
              displayValue={fmtEUR(eigenkapital)}
              onChange={setEigenkapital}
            />
            <SliderInput
              label="Nominalzins"
              value={zinssatzPct}
              min={0.5}
              max={8}
              step={0.1}
              displayValue={`${zinssatzPct.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %`}
              onChange={setZinssatzPct}
            />
            <SliderInput
              label="Anfangstilgung"
              value={tilgungPct}
              min={0.5}
              max={5}
              step={0.1}
              displayValue={`${tilgungPct.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %`}
              onChange={setTilgungPct}
            />
            <SliderInput
              label="Zinsbindung"
              value={zinsbindungJahre}
              min={5}
              max={30}
              step={1}
              displayValue={`${zinsbindungJahre} Jahre`}
              onChange={setZinsbindungJahre}
            />
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Ergebnis</h2>

            {/* Monthly rate highlight */}
            <div className="mb-4 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3 dark:bg-blue-950/30">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Monatliche Rate</span>
              <span className="text-2xl font-semibold text-blue-600 dark:text-blue-400">
                {fmtEUR(result.monatlicheRate)}
              </span>
            </div>

            <div className="space-y-3">
              <ResultRow label="Darlehensbetrag" value={fmtEUR(result.darlehen)} />
              <ResultRow
                label="Eigenkapitalquote"
                value={fmtPct(result.eigenkapitalQuotePct / 100)}
              />
              <ResultRow
                label="Davon Zinsen (1. Monat)"
                value={fmtEUR(result.zinsenMonat1)}
                valueClass="text-red-600 dark:text-red-400"
              />
              <ResultRow
                label="Davon Tilgung (1. Monat)"
                value={fmtEUR(result.tilgungMonat1)}
                valueClass="text-emerald-600 dark:text-emerald-400"
              />
              <ResultRow
                label={`Gesamtzinsen (${zinsbindungJahre} J.)`}
                value={fmtEUR(result.gesamtzinsen)}
              />
              <ResultRow
                label={`Restschuld nach ${zinsbindungJahre} Jahren`}
                value={fmtEUR(result.restschuld)}
                last
              />
            </div>
          </div>
        )}

        {/* CTA */}
        <CtaCard text="Finanzierung im Blick? Verwalte deine Immobilien kostenlos mit MyImmoHub." />
      </div>
    </div>
  );
}

function ResultRow({
  label,
  value,
  valueClass,
  last = false,
}: {
  label: string;
  value: string;
  valueClass?: string;
  last?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 ${
        !last ? "border-b border-slate-100 dark:border-slate-800" : ""
      }`}
    >
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${valueClass ?? "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}

function CtaCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{text}</p>
      <Link
        href="/auth"
        className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-medium text-white transition hover:bg-blue-700"
      >
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
