"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatPercent(value: number, decimals = 2): string {
  return `${value.toFixed(decimals).replace(".", ",")} %`;
}

const grunderwerbsteuer: Record<string, number> = {
  Bayern: 3.5,
  Sachsen: 3.5,
  Hamburg: 4.5,
  Bremen: 5.0,
  Niedersachsen: 5.0,
  "Mecklenburg-Vorpommern": 5.0,
  "Rheinland-Pfalz": 5.0,
  "Sachsen-Anhalt": 5.0,
  "Baden-Württemberg": 5.0,
  Berlin: 6.0,
  Hessen: 6.0,
  Brandenburg: 6.5,
  "Nordrhein-Westfalen": 6.5,
  Saarland: 6.5,
  "Schleswig-Holstein": 6.5,
  Thüringen: 6.5,
};

const bundeslaender = Object.keys(grunderwerbsteuer).sort((a, b) => a.localeCompare(b, "de"));

export default function KaufnebenkostenRechner() {
  const [kaufpreis, setKaufpreis] = useState<string>("300000");
  const [bundesland, setBundesland] = useState<string>("Bayern");
  const [notarPct, setNotarPct] = useState<string>("1.2");
  const [grundbuchPct, setGrundbuchPct] = useState<string>("0.5");
  const [mitMakler, setMitMakler] = useState<boolean>(true);
  const [maklercourtage, setMaklercourtage] = useState<string>("3.57");

  const result = useMemo(() => {
    const kp = parseFloat(kaufpreis) || 0;
    if (kp <= 0) return null;

    const gewSatz = grunderwerbsteuer[bundesland] ?? 3.5;
    const grunderwerbsteuerBetrag = (kp * gewSatz) / 100;
    const notarkosten = (kp * parseFloat(notarPct || "0")) / 100;
    const grundbuch = (kp * parseFloat(grundbuchPct || "0")) / 100;
    const makler = mitMakler ? (kp * parseFloat(maklercourtage || "0")) / 100 : 0;

    const gesamtNebenkosten = grunderwerbsteuerBetrag + notarkosten + grundbuch + makler;
    const gesamtInvestition = kp + gesamtNebenkosten;
    const nebenkostenPct = (gesamtNebenkosten / kp) * 100;

    return {
      kp,
      gewSatz,
      grunderwerbsteuerBetrag,
      notarkosten,
      grundbuch,
      makler,
      maklerPct: parseFloat(maklercourtage || "0"),
      gesamtNebenkosten,
      gesamtInvestition,
      nebenkostenPct,
    };
  }, [kaufpreis, bundesland, notarPct, grundbuchPct, mitMakler, maklercourtage]);

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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Kaufnebenkosten-Rechner</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Was kostet mich der Kauf wirklich?</p>
        </div>

        {/* Inputs */}
        <div className={cardClass}>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Angaben zum Kauf</h2>
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
              <label className={labelClass}>Bundesland</label>
              <select
                value={bundesland}
                onChange={(e) => setBundesland(e.target.value)}
                className={inputClass}
              >
                {bundeslaender.map((bl) => (
                  <option key={bl} value={bl}>
                    {bl} ({grunderwerbsteuer[bl].toFixed(1).replace(".", ",")} %)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Notarkosten (%)</label>
              <input
                type="number"
                min="0"
                max="5"
                step="0.1"
                value={notarPct}
                onChange={(e) => setNotarPct(e.target.value)}
                className={inputClass}
                placeholder="z. B. 1.2"
              />
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Üblich: 1,0–1,5 % · Standard: 1,2 %</p>
            </div>
            <div>
              <label className={labelClass}>Grundbucheintragung (%)</label>
              <input
                type="number"
                min="0"
                max="3"
                step="0.1"
                value={grundbuchPct}
                onChange={(e) => setGrundbuchPct(e.target.value)}
                className={inputClass}
                placeholder="z. B. 0.5"
              />
              <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Üblich: ca. 0,5 %</p>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="mitMakler"
                checked={mitMakler}
                onChange={(e) => setMitMakler(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-700 dark:accent-zinc-300"
              />
              <label htmlFor="mitMakler" className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                Mit Makler
              </label>
            </div>
            {mitMakler && (
              <div>
                <label className={labelClass}>Maklercourtage (%)</label>
                <input
                  type="number"
                  min="0"
                  max="10"
                  step="0.01"
                  value={maklercourtage}
                  onChange={(e) => setMaklercourtage(e.target.value)}
                  className={inputClass}
                />
              </div>
            )}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div className={cardClass}>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Kostenaufstellung</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">
                  Grunderwerbsteuer ({formatPercent(result.gewSatz, 1)})
                </span>
                <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatEuro(result.grunderwerbsteuerBetrag)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Notarkosten ({formatPercent(parseFloat(notarPct || "0"), 1)})</span>
                <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatEuro(result.notarkosten)}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                <span className="text-sm text-zinc-600 dark:text-zinc-400">Grundbucheintragung ({formatPercent(parseFloat(grundbuchPct || "0"), 1)})</span>
                <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                  {formatEuro(result.grundbuch)}
                </span>
              </div>
              {mitMakler && (
                <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">
                    Maklercourtage ({formatPercent(result.maklerPct, 2)})
                  </span>
                  <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                    {formatEuro(result.makler)}
                  </span>
                </div>
              )}

              {/* Totals */}
              <div className="pt-2">
                <div className="flex items-center justify-between py-2 border-b border-zinc-200 dark:border-zinc-600">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    Gesamtnebenkosten ({formatPercent(result.nebenkostenPct, 1)})
                  </span>
                  <span className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
                    {formatEuro(result.gesamtNebenkosten)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-3 bg-zinc-50 dark:bg-zinc-700/50 rounded-lg px-3 mt-2">
                  <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Gesamtinvestition</span>
                  <span className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
                    {formatEuro(result.gesamtInvestition)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* AfA Tipp */}
        <div className="rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            <span className="font-semibold">Tipp:</span> Nur der Gebäudeanteil (nicht Grundstück) ist AfA-fähig. Mit MyImmoHub kannst du die steueroptimale Kaufpreisaufteilung direkt aus deinem Kaufvertrag extrahieren.
          </p>
        </div>

        {/* CTA */}
        <div className={cardClass}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Alle Kosten im Griff – verwalte deine Immobilien kostenlos mit MyImmoHub.
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
