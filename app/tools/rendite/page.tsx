"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals).replace(".", ",")} %`;
}

export default function RenditeRechner() {
  const [kaufpreis, setKaufpreis] = useState<string>("300000");
  const [kaltmiete, setKaltmiete] = useState<string>("900");
  const [nebenkosten, setNebenkosten] = useState<string>("100");
  const [kaufnebenkosten, setKaufnebenkosten] = useState<string>("10");

  const result = useMemo(() => {
    const kp = parseFloat(kaufpreis) || 0;
    const km = parseFloat(kaltmiete) || 0;
    const nk = parseFloat(nebenkosten) || 0;
    const knkPct = parseFloat(kaufnebenkosten) || 0;

    if (kp <= 0 || km <= 0) return null;

    const jahresmiete = km * 12;
    const jahreskosten = nk * 12;
    const gesamtinvestition = kp * (1 + knkPct / 100);

    const brutto = (jahresmiete / kp) * 100;
    const netto = ((jahresmiete - jahreskosten) / gesamtinvestition) * 100;

    return { brutto, netto, jahresmiete, gesamtinvestition, kp, knkPct };
  }, [kaufpreis, kaltmiete, nebenkosten, kaufnebenkosten]);

  function getBewertung(netto: number): { label: string; color: string } {
    if (netto < 3) return { label: "Niedrig", color: "text-red-500 dark:text-red-400" };
    if (netto <= 5) return { label: "Solide", color: "text-yellow-500 dark:text-yellow-400" };
    return { label: "Attraktiv", color: "text-green-500 dark:text-green-400" };
  }

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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Renditerechner</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Lohnt sich diese Immobilie?</p>
        </div>

        {/* Inputs */}
        <div className={cardClass}>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Angaben zur Immobilie</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Kaufpreis (€)</label>
              <input
                type="number"
                min="0"
                value={kaufpreis}
                onChange={(e) => setKaufpreis(e.target.value)}
                className={inputClass}
                placeholder="z. B. 300000"
              />
            </div>
            <div>
              <label className={labelClass}>Monatliche Kaltmiete (€)</label>
              <input
                type="number"
                min="0"
                value={kaltmiete}
                onChange={(e) => setKaltmiete(e.target.value)}
                className={inputClass}
                placeholder="z. B. 900"
              />
            </div>
            <div>
              <label className={labelClass}>Monatliche Nebenkosten / Verwaltung (€, optional)</label>
              <input
                type="number"
                min="0"
                value={nebenkosten}
                onChange={(e) => setNebenkosten(e.target.value)}
                className={inputClass}
                placeholder="z. B. 100"
              />
            </div>
            <div>
              <label className={labelClass}>Kaufnebenkosten (%, optional)</label>
              <input
                type="number"
                min="0"
                max="30"
                step="0.1"
                value={kaufnebenkosten}
                onChange={(e) => setKaufnebenkosten(e.target.value)}
                className={inputClass}
                placeholder="Standard: 10"
              />
            </div>
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className={cardClass}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Ergebnis</h2>
            <div className="space-y-4">
              {/* Bruttomietrendite */}
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Bruttomietrendite</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {formatPercent(result.brutto)}
                </span>
              </div>

              {/* Nettomietrendite */}
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Nettomietrendite</span>
                <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {formatPercent(result.netto)}
                </span>
              </div>

              {/* Bewertung */}
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Bewertung</span>
                <span className={`text-lg font-bold ${getBewertung(result.netto).color}`}>
                  {getBewertung(result.netto).label}
                </span>
              </div>

              {/* Jahresmiete */}
              <div className="flex items-center justify-between py-3 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Jahresmiete (kalt)</span>
                <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatEuro(result.jahresmiete)}
                </span>
              </div>

              {/* Gesamtinvestition */}
              <div className="flex items-center justify-between py-3">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Gesamtinvestition (inkl. {result.knkPct} % Nebenkosten)
                </span>
                <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatEuro(result.gesamtinvestition)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* CTA */}
        <div className={cardClass}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Immobilie gefunden? Verwalte sie kostenlos mit MyImmoHub – Dokumente, Mieten und mehr an einem Ort.
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
