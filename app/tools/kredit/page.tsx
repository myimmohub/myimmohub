"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { parseGermanDecimal, fmtPct } from "@/lib/utils/numberFormat";

function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number, decimals = 1): string {
  return fmtPct(value, decimals);
}

export default function KreditRechner() {
  const [kaufpreis, setKaufpreis] = useState<string>("300000");
  const [eigenkapital, setEigenkapital] = useState<string>("60000");
  const [zinssatz, setZinssatz] = useState<string>("3.5");
  const [tilgung, setTilgung] = useState<string>("2.0");
  const [zinsbindung, setZinsbindung] = useState<string>("10");

  const result = useMemo(() => {
    const kp = parseGermanDecimal(kaufpreis) || 0;
    const ek = parseGermanDecimal(eigenkapital) || 0;
    const z = parseGermanDecimal(zinssatz) || 0;
    const t = parseGermanDecimal(tilgung) || 0;
    const zb = parseInt(zinsbindung) || 0;

    if (kp <= 0) return null;

    const darlehen = Math.max(kp - ek, 0);
    if (darlehen <= 0) return null;

    const eigenkapitalQuote = (ek / kp) * 100;

    // Monatliche Annuität (vereinfacht: (z + t) / 12 / 100 * Darlehen)
    const monatlicheRate = (darlehen * (z + t)) / 12 / 100;

    // Zinsen im ersten Monat
    const zinsenMonat1 = (darlehen * z) / 12 / 100;
    const tilgungMonat1 = monatlicheRate - zinsenMonat1;

    // Restschuld nach Zinsbindung (jährliche Tilgung, vereinfacht annuity)
    // Exakte Formel: Restschuld = Darlehen * (1 + z/100)^n - Rate*12 * ((1+z/100)^n - 1) / (z/100)
    let restschuld = darlehen;
    if (z > 0) {
      const r = z / 100; // Jahreszinssatz
      const n = zb;
      const annuitat = monatlicheRate * 12;
      restschuld = darlehen * Math.pow(1 + r, n) - (annuitat * (Math.pow(1 + r, n) - 1)) / r;
    } else {
      // Kein Zins: reine Tilgung
      restschuld = darlehen - tilgungMonat1 * 12 * zb;
    }
    restschuld = Math.max(restschuld, 0);

    return {
      darlehen,
      eigenkapitalQuote,
      monatlicheRate,
      zinsenMonat1,
      tilgungMonat1,
      restschuld,
      zb,
    };
  }, [kaufpreis, eigenkapital, zinssatz, tilgung, zinsbindung]);

  const inputClass =
    "w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500";
  const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1";
  const cardClass =
    "bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-6";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Back link */}
        <Link
          href="/tools"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors"
        >
          ← Alle Rechner
        </Link>

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Kreditrechner</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Was kostet mich der Kredit pro Monat?</p>
        </div>

        {/* Inputs */}
        <div className={cardClass}>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Finanzierungsdetails</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Kaufpreis (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={kaufpreis}
                onChange={(e) => setKaufpreis(e.target.value)}
                className={inputClass}
                placeholder="z. B. 300000"
              />
            </div>
            <div>
              <label className={labelClass}>Eigenkapital (€)</label>
              <input
                type="text"
                inputMode="decimal"
                value={eigenkapital}
                onChange={(e) => setEigenkapital(e.target.value)}
                className={inputClass}
                placeholder="z. B. 60000"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Zinssatz (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={zinssatz}
                  onChange={(e) => setZinssatz(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Anfangstilgung (%)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={tilgung}
                  onChange={(e) => setTilgung(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Zinsbindung (Jahre)</label>
              <input
                type="text"
                inputMode="decimal"
                value={zinsbindung}
                onChange={(e) => setZinsbindung(e.target.value)}
                className={inputClass}
                placeholder="z. B. 10"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className={cardClass}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Ergebnis</h2>
            <div className="space-y-1">
              {/* Monatliche Rate – highlight */}
              <div className="rounded-lg bg-zinc-50 dark:bg-zinc-700/50 p-4 mb-4 flex items-center justify-between">
                <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Monatliche Rate</span>
                <span className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {formatEuro(result.monatlicheRate)}
                </span>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Darlehensbetrag</span>
                  <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                    {formatEuro(result.darlehen)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Eigenkapitalquote</span>
                  <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                    {formatPercent(result.eigenkapitalQuote)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Davon Zinsen (1. Monat)</span>
                  <span className="text-base font-semibold text-red-600 dark:text-red-400">
                    {formatEuro(result.zinsenMonat1)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Davon Tilgung (1. Monat)</span>
                  <span className="text-base font-semibold text-green-600 dark:text-green-400">
                    {formatEuro(result.tilgungMonat1)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Restschuld nach {result.zb} Jahren
                  </span>
                  <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                    {formatEuro(result.restschuld)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className={cardClass}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Finanzierung im Blick? Verwalte deine Immobilien kostenlos mit MyImmoHub – Dokumente, Mieteinnahmen und mehr.
          </p>
          <Link
            href="/auth"
            className="w-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 rounded-lg py-3 font-semibold text-center block hover:bg-zinc-700 dark:hover:bg-zinc-300 transition-colors"
          >
            Immobilie kostenlos verwalten mit MyImmoHub
          </Link>
        </div>
      </div>
    </div>
  );
}
