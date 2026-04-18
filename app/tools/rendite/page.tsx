"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SliderInput from "@/components/marketing/SliderInput";
import { calcRendite } from "@/lib/calculators/rendite";
import { fmtEUR, fmtPct } from "@/lib/format";

const BEWERTUNG = {
  niedrig: { label: "Niedrig", color: "text-red-600 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/30" },
  solide: { label: "Solide", color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-50 dark:bg-amber-950/30" },
  attraktiv: { label: "Attraktiv", color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-950/30" },
};

export default function RenditeRechner() {
  const [kaufpreis, setKaufpreis] = useState(300_000);
  const [kaltmiete, setKaltmiete] = useState(900);
  const [nebenkosten, setNebenkosten] = useState(100);
  const [kaufnebenkostenPct, setKaufnebenkostenPct] = useState(10);

  const result = useMemo(
    () => calcRendite({ kaufpreis, kaltmiete, nebenkosten, kaufnebenkostenPct }),
    [kaufpreis, kaltmiete, nebenkosten, kaufnebenkostenPct],
  );

  const bew = result ? BEWERTUNG[result.bewertung] : null;

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
            Renditerechner
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Lohnt sich diese Immobilie?
          </p>
        </div>

        {/* Inputs */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Angaben zur Immobilie
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
              label="Monatliche Kaltmiete"
              value={kaltmiete}
              min={100}
              max={5_000}
              step={50}
              displayValue={fmtEUR(kaltmiete)}
              onChange={setKaltmiete}
            />
            <SliderInput
              label="Monatliche Nebenkosten"
              value={nebenkosten}
              min={0}
              max={1_000}
              step={10}
              displayValue={fmtEUR(nebenkosten)}
              onChange={setNebenkosten}
            />
            <SliderInput
              label="Kaufnebenkosten"
              value={kaufnebenkostenPct}
              min={0}
              max={15}
              step={0.5}
              displayValue={`${kaufnebenkostenPct.toLocaleString("de-DE")} %`}
              onChange={setKaufnebenkostenPct}
            />
          </div>
        </div>

        {/* Result */}
        {result && bew && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Ergebnis</h2>

            {/* Highlight */}
            <div className={`mb-4 flex items-center justify-between rounded-xl px-4 py-3 ${bew.bg}`}>
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Nettomietrendite
              </span>
              <div className="text-right">
                <p className={`text-2xl font-semibold ${bew.color}`}>
                  {fmtPct(result.nettoRenditePct / 100)}
                </p>
                <p className={`text-xs ${bew.color}`}>{bew.label}</p>
              </div>
            </div>

            <div className="space-y-3">
              <ResultRow label="Bruttomietrendite" value={fmtPct(result.bruttoRenditePct / 100)} />
              <ResultRow label="Jahresmiete (kalt)" value={fmtEUR(result.jahresmiete)} />
              <ResultRow
                label={`Gesamtinvestition (inkl. ${kaufnebenkostenPct} % Nebenkosten)`}
                value={fmtEUR(result.gesamtinvestition)}
                last
              />
            </div>
          </div>
        )}

        {/* CTA */}
        <CtaCard text="Immobilie gefunden? Verwalte sie kostenlos mit MyImmoHub – Steuern, Mieten und mehr." />
      </div>
    </div>
  );
}

function ResultRow({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-2 ${!last ? "border-b border-slate-100 dark:border-slate-800" : ""}`}>
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{value}</span>
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
