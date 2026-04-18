"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import SliderInput from "@/components/marketing/SliderInput";
import ResultRow from "@/components/tools/ResultRow";
import CtaCard from "@/components/tools/CtaCard";
import { ChevronLeftIcon } from "@/components/marketing/icons";
import {
  calcKaufnebenkosten,
  BUNDESLAENDER,
  GRUNDERWERBSTEUER,
} from "@/lib/calculators/kaufnebenkosten";
import { fmtEUR } from "@/lib/format";

export default function KaufnebenkostenRechner() {
  const [kaufpreis, setKaufpreis] = useState(300_000);
  const [bundesland, setBundesland] = useState("Bayern");
  const [notarPct, setNotarPct] = useState(1.2);
  const [grundbuchPct, setGrundbuchPct] = useState(0.5);
  const [mitMakler, setMitMakler] = useState(true);
  const [maklerPct, setMaklerPct] = useState(3.57);

  const result = useMemo(
    () => calcKaufnebenkosten({ kaufpreis, bundesland, notarPct, grundbuchPct, mitMakler, maklerPct }),
    [kaufpreis, bundesland, notarPct, grundbuchPct, mitMakler, maklerPct],
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
            Kaufnebenkosten-Rechner
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Was kostet mich der Kauf wirklich?
          </p>
        </div>

        {/* Inputs */}
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            Angaben zum Kauf
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

            {/* Bundesland select */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Bundesland
              </label>
              <select
                value={bundesland}
                onChange={(e) => setBundesland(e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {BUNDESLAENDER.map((bl) => (
                  <option key={bl} value={bl}>
                    {bl} ({GRUNDERWERBSTEUER[bl].toLocaleString("de-DE", { minimumFractionDigits: 1 })} %)
                  </option>
                ))}
              </select>
            </div>

            <SliderInput
              label="Notarkosten"
              value={notarPct}
              min={0.5}
              max={2.5}
              step={0.1}
              displayValue={`${notarPct.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %`}
              onChange={setNotarPct}
            />
            <SliderInput
              label="Grundbucheintragung"
              value={grundbuchPct}
              min={0.1}
              max={1.0}
              step={0.1}
              displayValue={`${grundbuchPct.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %`}
              onChange={setGrundbuchPct}
            />

            {/* Makler toggle + slider */}
            <div>
              <label className="flex cursor-pointer items-center gap-3">
                <input
                  type="checkbox"
                  checked={mitMakler}
                  onChange={(e) => setMitMakler(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600 dark:border-slate-600"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Mit Makler
                </span>
              </label>
              {mitMakler && (
                <div className="mt-4">
                  <SliderInput
                    label="Maklercourtage"
                    value={maklerPct}
                    min={0}
                    max={7.14}
                    step={0.1}
                    displayValue={`${maklerPct.toLocaleString("de-DE", { minimumFractionDigits: 2 })} %`}
                    onChange={setMaklerPct}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
              Kostenaufstellung
            </h2>
            <div className="space-y-3">
              <ResultRow
                label={`Grunderwerbsteuer (${result.grunderwerbsteuerSatz.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %)`}
                value={fmtEUR(result.grunderwerbsteuer)}
              />
              <ResultRow
                label={`Notarkosten (${notarPct.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %)`}
                value={fmtEUR(result.notarkosten)}
              />
              <ResultRow
                label={`Grundbucheintragung (${grundbuchPct.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %)`}
                value={fmtEUR(result.grundbuchkosten)}
              />
              {mitMakler && (
                <ResultRow
                  label={`Maklercourtage (${maklerPct.toLocaleString("de-DE", { minimumFractionDigits: 2 })} %)`}
                  value={fmtEUR(result.maklerkosten)}
                />
              )}

              {/* Divider + totals */}
              <div className="border-t border-slate-200 pt-3 dark:border-slate-700">
                <ResultRow
                  label={`Gesamtnebenkosten (${result.nebenkostenPct.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %)`}
                  value={fmtEUR(result.gesamtNebenkosten)}
                  valueClass="text-slate-900 dark:text-slate-100"
                />
              </div>

              {/* Gesamtinvestition highlight */}
              <div className="flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3 dark:bg-blue-950/30">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  Gesamtinvestition
                </span>
                <span className="text-xl font-semibold text-blue-600 dark:text-blue-400">
                  {fmtEUR(result.gesamtInvestition)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* AfA Tipp */}
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/20">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <span className="font-semibold">Tipp:</span> Nur der Gebäudeanteil (nicht Grundstück)
            ist AfA-fähig. Mit MyImmoHub kannst du die steueroptimale Kaufpreisaufteilung direkt aus
            deinem Kaufvertrag extrahieren.
          </p>
        </div>

        {/* CTA */}
        <CtaCard text="Alle Kosten im Griff – verwalte deine Immobilien kostenlos mit MyImmoHub." />
      </div>
    </div>
  );
}

