import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Steuer-Tipps für Vermieter",
  description:
    "Praxisnahe Erklärungen zu Anlage V, AfA, GbR, Spekulationssteuer und mehr — kostenlos für Privatvermieter.",
};

const ARTICLES = [
  {
    slug: "mieteinnahmen-versteuern",
    title: "Mieteinnahmen versteuern: Grundlagen der Anlage V",
    description: "Wie Mieteinnahmen besteuert werden, wie das Zufluss-Prinzip funktioniert und wie der Werbungskostenüberschuss entsteht.",
    tag: "Anlage V",
    readingTime: "6 Min.",
  },
  {
    slug: "anlage-v-werbungskosten",
    title: "Anlage V: Welche Werbungskosten Vermieter absetzen dürfen",
    description: "Vollständige Übersicht aller abzugsfähigen Posten — Zinsen, Grundsteuer, Versicherungen, AfA und mehr.",
    tag: "Werbungskosten",
    readingTime: "7 Min.",
  },
  {
    slug: "afa-immobilien",
    title: "AfA Immobilien: Gebäude, Inventar und §82b richtig abschreiben",
    description: "AfA-Sätze nach Baujahr, Inventar-AfA mit 20 %, die §82b-Verteilung und die 15 %-Grenze für anschaffungsnahe Kosten.",
    tag: "AfA",
    readingTime: "8 Min.",
  },
  {
    slug: "kaufpreisaufteilung",
    title: "Kaufpreisaufteilung: Gebäude vs. Grundstück steuerlich optimieren",
    description: "Warum das Verhältnis im Kaufvertrag tausende Euro Steuern sparen kann und wie du es glaubwürdig vereinbarst.",
    tag: "AfA & Kauf",
    readingTime: "6 Min.",
  },
  {
    slug: "erhaltungsaufwand-82b",
    title: "§82b Erhaltungsaufwand: Verteilung auf 2 bis 5 Jahre",
    description: "Wann die freiwillige Verteilung von Instandhaltungskosten sinnvoll ist und wie sie in der Anlage V erfasst wird.",
    tag: "Instandhaltung",
    readingTime: "5 Min.",
  },
  {
    slug: "kaufnebenkosten-steuerlich",
    title: "Kaufnebenkosten: Was Vermieter von der Steuer absetzen können",
    description: "Grunderwerbsteuer, Notar und Makler erhöhen die AfA-Basis — aber nicht sofort. Alles zur steuerlichen Behandlung.",
    tag: "Kaufkosten",
    readingTime: "5 Min.",
  },
  {
    slug: "grundsteuer-werbungskosten",
    title: "Grundsteuer und Nebenkosten als Werbungskosten absetzen",
    description: "Welche laufenden Kosten in der Anlage V geltend gemacht werden können — und was nicht.",
    tag: "Nebenkosten",
    readingTime: "5 Min.",
  },
  {
    slug: "gbr-vermieter-steuern",
    title: "GbR als Vermieter: Anlage FE, Anlage FB und Ergebnisaufteilung",
    description: "Wenn mehrere Personen gemeinsam vermieten: was das steuerlich bedeutet und welche Formulare nötig sind.",
    tag: "GbR",
    readingTime: "8 Min.",
  },
  {
    slug: "spekulationssteuer-10-jahre",
    title: "Spekulationssteuer: Die 10-Jahres-Frist beim Immobilienverkauf",
    description: "Wann ein Verkauf steuerpflichtig wird, wie hoch die Steuer wäre und wie du sie legal vermeidest.",
    tag: "Verkauf",
    readingTime: "6 Min.",
  },
];

const TAG_COLORS: Record<string, string> = {
  "Anlage V": "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  Werbungskosten: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  AfA: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  "AfA & Kauf": "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  Instandhaltung: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  Kaufkosten: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  Nebenkosten: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  GbR: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  Verkauf: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
};

export default function SteuerTippsPage() {
  return (
    <div className="min-h-screen bg-white py-16 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6">
        {/* Header */}
        <div className="mb-12 max-w-2xl">
          <p className="mb-2 text-sm font-medium text-blue-600 dark:text-blue-400">Steuerwissen</p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
            Steuer-Tipps für Vermieter
          </h1>
          <p className="mt-4 text-lg text-slate-500 dark:text-slate-400">
            Praxisnahe Erklärungen zu Anlage V, AfA, GbR und Spekulationssteuer — kostenlos und
            ohne Steuerberater-Deutsch.
          </p>
        </div>

        {/* Article grid */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ARTICLES.map(({ slug, title, description, tag, readingTime }) => (
            <Link
              key={slug}
              href={`/steuer-tipps/${slug}`}
              className="group flex flex-col rounded-xl border border-slate-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${TAG_COLORS[tag] ?? "bg-slate-100 text-slate-600"}`}
                >
                  {tag}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{readingTime}</span>
              </div>
              <h2 className="flex-1 text-sm font-semibold text-slate-900 transition group-hover:text-blue-600 dark:text-slate-100 dark:group-hover:text-blue-400">
                {title}
              </h2>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
                {description}
              </p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400">
                Lesen <ChevronIcon className="h-3.5 w-3.5" />
              </div>
            </Link>
          ))}
        </div>

        {/* Bottom CTA */}
        <div className="mt-16 rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center dark:border-blue-900 dark:bg-blue-950/30">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Steuerverwaltung automatisiert
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-slate-500 dark:text-slate-400">
            MyImmoHub wendet all diese Regeln automatisch an — AfA, §82b, GbR-Aufteilung und Anlage
            V in einem Klick.
          </p>
          <Link
            href="/auth"
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Kostenlos starten
          </Link>
        </div>
      </div>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
    </svg>
  );
}
