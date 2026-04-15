"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { parseGermanDecimal } from "@/lib/utils/numberFormat";

function formatEuro(value: number): string {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function toDateString(date: Date): string {
  return date.toISOString().split("T")[0];
}

export default function SpekulationssteuerRechner() {
  const today = new Date();

  const [kaufdatum, setKaufdatum] = useState<string>("2016-01-15");
  const [verkaufsdatum, setVerkaufsdatum] = useState<string>(toDateString(today));
  const [kaufpreis, setKaufpreis] = useState<string>("250000");
  const [verkaufspreis, setVerkaufspreis] = useState<string>("350000");
  const [steuersatz, setSteuersatz] = useState<string>("35");
  const [selbstgenutzt, setSelbstgenutzt] = useState<boolean>(false);

  const result = useMemo(() => {
    if (!kaufdatum || !verkaufsdatum) return null;

    const kauf = new Date(kaufdatum);
    const verkauf = new Date(verkaufsdatum);
    if (isNaN(kauf.getTime()) || isNaN(verkauf.getTime())) return null;
    if (verkauf <= kauf) return null;

    const kp = parseGermanDecimal(kaufpreis) || 0;
    const vp = parseGermanDecimal(verkaufspreis) || 0;
    const sz = parseGermanDecimal(steuersatz) || 0;

    // Haltedauer
    const diffMs = verkauf.getTime() - kauf.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);
    const jahre = Math.floor(diffDays / 365.25);
    const restMonate = Math.floor((diffDays % 365.25) / 30.44);

    // Steuerfreies Verkaufsdatum: Kaufdatum + 10 Jahre
    const steuerfreiAb = new Date(kauf);
    steuerfreiAb.setFullYear(steuerfreiAb.getFullYear() + 10);

    const zehnjahreUm = verkauf >= steuerfreiAb;

    // Status bestimmen
    let status: "steuerfrei_10j" | "steuerfrei_selbstnutzung" | "steuerpflichtig";
    if (zehnjahreUm) {
      status = "steuerfrei_10j";
    } else if (selbstgenutzt) {
      status = "steuerfrei_selbstnutzung";
    } else {
      status = "steuerpflichtig";
    }

    const gewinn = vp - kp;
    const steuer = status === "steuerpflichtig" && gewinn > 0 ? (gewinn * sz) / 100 : 0;
    const nettogewinn = gewinn - steuer;

    return {
      jahre,
      restMonate,
      steuerfreiAb,
      zehnjahreUm,
      status,
      gewinn,
      steuer,
      nettogewinn,
      sz,
      vp,
      kp,
    };
  }, [kaufdatum, verkaufsdatum, kaufpreis, verkaufspreis, steuersatz, selbstgenutzt]);

  const inputClass =
    "w-full rounded-lg border border-zinc-300 dark:border-zinc-600 bg-white dark:bg-zinc-800 px-4 py-2 text-zinc-900 dark:text-zinc-100 focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-500";
  const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1";
  const cardClass =
    "bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-6";

  function getStatusInfo(status: string): { label: string; desc: string; bg: string; text: string } {
    switch (status) {
      case "steuerfrei_10j":
        return {
          label: "Bereits steuerfrei",
          desc: "Die 10-jährige Spekulationsfrist ist abgelaufen.",
          bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
          text: "text-green-700 dark:text-green-400",
        };
      case "steuerfrei_selbstnutzung":
        return {
          label: "Steuerfrei durch Selbstnutzung",
          desc: "Eigennutzung in den letzten 2 Kalenderjahren vor Verkauf (§ 23 Abs. 1 Nr. 1 EStG).",
          bg: "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800",
          text: "text-green-700 dark:text-green-400",
        };
      case "steuerpflichtig":
        return {
          label: "Steuerpflichtig",
          desc: "Die 10-jährige Spekulationsfrist ist noch nicht abgelaufen.",
          bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
          text: "text-red-700 dark:text-red-400",
        };
      default:
        return { label: "", desc: "", bg: "", text: "" };
    }
  }

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
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Spekulationssteuer-Rechner</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">Ab wann kann ich steuerfrei verkaufen?</p>
        </div>

        {/* Inputs */}
        <div className={cardClass}>
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Angaben zum Verkauf</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Kaufdatum</label>
                <input
                  type="date"
                  value={kaufdatum}
                  onChange={(e) => setKaufdatum(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>Geplantes Verkaufsdatum</label>
                <input
                  type="date"
                  value={verkaufsdatum}
                  onChange={(e) => setVerkaufsdatum(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Kaufpreis (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={kaufpreis}
                  onChange={(e) => setKaufpreis(e.target.value)}
                  className={inputClass}
                  placeholder="z. B. 250000"
                />
              </div>
              <div>
                <label className={labelClass}>Verkaufspreis (€)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={verkaufspreis}
                  onChange={(e) => setVerkaufspreis(e.target.value)}
                  className={inputClass}
                  placeholder="z. B. 350000"
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Persönlicher Steuersatz (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={steuersatz}
                onChange={(e) => setSteuersatz(e.target.value)}
                className={inputClass}
                placeholder="z. B. 35"
              />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="selbstgenutzt"
                checked={selbstgenutzt}
                onChange={(e) => setSelbstgenutzt(e.target.checked)}
                className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-600 accent-zinc-700 dark:accent-zinc-300"
              />
              <label htmlFor="selbstgenutzt" className="text-sm text-zinc-700 dark:text-zinc-300 cursor-pointer">
                Immobilie in den letzten 2 Jahren selbst bewohnt
              </label>
            </div>
          </div>
        </div>

        {/* Results */}
        {result && (
          <>
            {/* Status banner */}
            <div className={`rounded-xl border p-4 ${getStatusInfo(result.status).bg}`}>
              <p className={`text-base font-bold ${getStatusInfo(result.status).text}`}>
                {getStatusInfo(result.status).label}
              </p>
              <p className={`text-sm mt-1 ${getStatusInfo(result.status).text} opacity-80`}>
                {getStatusInfo(result.status).desc}
              </p>
            </div>

            <div className={cardClass}>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Ergebnis</h2>
              <div className="space-y-3">
                <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Haltedauer</span>
                  <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                    {result.jahre} Jahre, {result.restMonate} Monate
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Steuerfreies Verkaufsdatum (10 Jahre)</span>
                  <span className="text-base font-semibold text-zinc-800 dark:text-zinc-200">
                    {formatDate(result.steuerfreiAb)}
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">Gewinn (brutto)</span>
                  <span
                    className={`text-base font-semibold ${
                      result.gewinn >= 0
                        ? "text-green-600 dark:text-green-400"
                        : "text-red-600 dark:text-red-400"
                    }`}
                  >
                    {formatEuro(result.gewinn)}
                  </span>
                </div>

                {result.status === "steuerpflichtig" && result.gewinn > 0 && (
                  <>
                    <div className="flex items-center justify-between py-2 border-b border-zinc-100 dark:border-zinc-700">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">
                        Spekulationssteuer ({result.sz} %)
                      </span>
                      <span className="text-base font-bold text-red-600 dark:text-red-400">
                        {formatEuro(result.steuer)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between py-2">
                      <span className="text-sm text-zinc-600 dark:text-zinc-400">Nettogewinn nach Steuer</span>
                      <span className="text-base font-bold text-zinc-800 dark:text-zinc-200">
                        {formatEuro(result.nettogewinn)}
                      </span>
                    </div>
                  </>
                )}

                {result.status !== "steuerpflichtig" && (
                  <div className="flex items-center justify-between py-2">
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">Spekulationssteuer</span>
                    <span className="text-base font-bold text-green-600 dark:text-green-400">Keine (0 €)</span>
                  </div>
                )}
              </div>
            </div>

            {result.status === "steuerpflichtig" && !result.zehnjahreUm && (
              <div className="rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-4 text-sm text-zinc-600 dark:text-zinc-400">
                Tipp: Warte bis zum <strong className="text-zinc-800 dark:text-zinc-200">{formatDate(result.steuerfreiAb)}</strong>, um{" "}
                <strong className="text-zinc-800 dark:text-zinc-200">{formatEuro(result.steuer)}</strong> Spekulationssteuer zu sparen.
              </div>
            )}
          </>
        )}

        {/* Legal note */}
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Hinweis: Diese Berechnung dient nur zur Orientierung und ersetzt keine Steuerberatung. Maßgeblich ist § 23 EStG. Bitte konsultiere einen Steuerberater für deine individuelle Situation.
        </p>

        {/* CTA */}
        <div className={cardClass}>
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Behalte den Überblick über all deine Immobilien – kostenlos mit MyImmoHub.
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
