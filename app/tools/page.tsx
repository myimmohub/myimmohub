"use client";

import Link from "next/link";

const tools = [
  {
    href: "/tools/rendite",
    title: "Renditerechner",
    description: "Lohnt sich diese Immobilie? Berechne Brutto- und Nettomietrendite und erhalte sofort eine Bewertung.",
    icon: "📈",
    tag: "Rentabilität",
  },
  {
    href: "/tools/kredit",
    title: "Kreditrechner",
    description: "Was kostet mich der Kredit pro Monat? Berechne monatliche Rate, Zins-/Tilgungsanteil und Restschuld.",
    icon: "🏦",
    tag: "Finanzierung",
  },
  {
    href: "/tools/spekulationssteuer",
    title: "Spekulationssteuer-Rechner",
    description: "Ab wann kann ich steuerfrei verkaufen? Prüfe die 10-Jahres-Frist und berechne die mögliche Steuer.",
    icon: "📅",
    tag: "Steuern",
  },
  {
    href: "/tools/kaufnebenkosten",
    title: "Kaufnebenkosten-Rechner",
    description: "Was kostet mich der Kauf wirklich? Alle Nebenkosten inkl. Grunderwerbsteuer nach Bundesland.",
    icon: "🧾",
    tag: "Kaufkosten",
  },
];

export default function ToolsOverview() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 py-8 px-4">
      <div className="max-w-lg mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">Immobilien-Rechner</h1>
          <p className="mt-1 text-zinc-500 dark:text-zinc-400">
            Kostenlose Tools für Immobilienkäufer und Vermieter
          </p>
        </div>

        {/* Tool cards */}
        <div className="space-y-4">
          {tools.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="block bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-5 hover:border-zinc-400 dark:hover:border-zinc-500 hover:shadow-md transition-all group"
            >
              <div className="flex items-start gap-4">
                <span className="text-2xl flex-shrink-0 mt-0.5">{tool.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 group-hover:text-zinc-700 dark:group-hover:text-zinc-200 transition-colors">
                      {tool.title}
                    </h2>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400">
                      {tool.tag}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-snug">{tool.description}</p>
                </div>
                <span className="text-zinc-400 dark:text-zinc-600 group-hover:text-zinc-600 dark:group-hover:text-zinc-400 transition-colors flex-shrink-0 mt-1">
                  →
                </span>
              </div>
            </Link>
          ))}
        </div>

        {/* Wissen-Link */}
        <Link
          href="/wissen/steuertipps-immobilienkauf"
          className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-5 transition hover:border-emerald-300 hover:shadow-sm dark:border-emerald-900 dark:bg-emerald-950/20 dark:hover:border-emerald-700"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0z" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">9 Steuertipps beim Immobilienkauf</p>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">So sparst du beim Kauf und bei der Vermietung tausende Euro Steuern</p>
          </div>
          <span className="text-emerald-500 dark:text-emerald-400">→</span>
        </Link>

        {/* CTA */}
        <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 p-6">
          <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
            Deine Immobilie schon gefunden? Verwalte sie kostenlos mit MyImmoHub — Dokumente, Mieten und Analysen an einem Ort.
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
