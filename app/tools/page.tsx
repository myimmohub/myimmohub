"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const tools = [
  {
    href: "/tools/rendite",
    title: "Renditerechner",
    description: "Brutto- und Nettorendite einer Immobilie schnell einschätzen.",
    tag: "Rentabilität",
    icon: ChartIcon,
  },
  {
    href: "/tools/kredit",
    title: "Kreditrechner",
    description: "Monatsrate, Zinsanteil und Restschuld für Finanzierungen berechnen.",
    tag: "Finanzierung",
    icon: CardIcon,
  },
  {
    href: "/tools/spekulationssteuer",
    title: "Spekulationssteuer-Rechner",
    description: "Verkaufszeitpunkt und mögliche Steuerbelastung transparent prüfen.",
    tag: "Steuern",
    icon: CalendarIcon,
  },
  {
    href: "/tools/kaufnebenkosten",
    title: "Kaufnebenkosten-Rechner",
    description: "Grunderwerbsteuer, Notar und weitere Kaufnebenkosten direkt überschlagen.",
    tag: "Kaufkosten",
    icon: ReceiptIcon,
  },
];

export default function ToolsOverviewPage() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
    };
    void loadSession();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Rechner</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Kostenlose Werkzeuge für Kauf, Finanzierung und Steuerplanung rund um Immobilien.</p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {tools.map((tool) => {
            const Icon = tool.icon;
            return (
              <Link
                key={tool.href}
                href={tool.href}
                className="rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start gap-4">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-blue-600 dark:bg-slate-800/50 dark:text-blue-400">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{tool.title}</h2>
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        {tool.tag}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{tool.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <Link
          href="/wissen/steuertipps-immobilienkauf"
          className="block rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
        >
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-blue-600 dark:bg-slate-800/50 dark:text-blue-400">
              <BookIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Steuerwissen</h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Praktische Inhalte rund um Immobilienkauf, Vermietung und steuerliche Grundlagen.</p>
            </div>
          </div>
        </Link>

        {!hasSession && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">Wenn du deine Immobilie dauerhaft verwalten möchtest, kannst du aus den Rechnern direkt in die App wechseln.</p>
            <Link
              href="/auth"
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Kostenlos verwalten
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  );
}

function CardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v1H2V5z" />
      <path fillRule="evenodd" d="M18 9H2v6a2 2 0 002 2h12a2 2 0 002-2V9z" clipRule="evenodd" />
    </svg>
  );
}

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M6 2a1 1 0 000 2h1v1a1 1 0 102 0V4h2v1a1 1 0 102 0V4h1a2 2 0 012 2v2H4V6a2 2 0 012-2h1V3a1 1 0 00-1-1zM4 10h12v4a2 2 0 01-2 2H6a2 2 0 01-2-2v-4z" clipRule="evenodd" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v13l3-1.5L9 17l3-1.5 3 1.5V4a2 2 0 00-2-2H5zm2 4a1 1 0 000 2h6a1 1 0 100-2H7zm0 4a1 1 0 100 2h4a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}

function BookIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12V5a2 2 0 00-2-2H4zm2 3a1 1 0 000 2h6a1 1 0 100-2H6z" />
    </svg>
  );
}
