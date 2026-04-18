import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/marketing/icons";

interface ArticleLayoutProps {
  title: string;
  description: string;
  /** ISO date string, e.g. "2024-03-15" */
  date: string;
  /** Reading time label, e.g. "5 Min. Lesezeit" */
  readingTime: string;
  /** SEO tags shown as chips */
  tags?: string[];
  children: ReactNode;
}

export default function ArticleLayout({
  title,
  description,
  date,
  readingTime,
  tags = [],
  children,
}: ArticleLayoutProps) {
  const dateFormatted = new Date(date).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="min-h-screen bg-white py-12 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6">
        <div className="flex gap-12 lg:gap-16">
          {/* ─── Main content ───────────────────────────────────────────── */}
          <article className="min-w-0 flex-1">
            {/* Breadcrumb */}
            <nav className="mb-6 flex items-center gap-2 text-sm text-slate-400 dark:text-slate-500">
              <Link href="/" className="hover:text-slate-600 dark:hover:text-slate-300">
                MyImmoHub
              </Link>
              <ChevronRightIcon className="h-3.5 w-3.5" />
              <Link
                href="/steuer-tipps"
                className="hover:text-slate-600 dark:hover:text-slate-300"
              >
                Steuer-Tipps
              </Link>
              <ChevronRightIcon className="h-3.5 w-3.5" />
              <span className="text-slate-500 dark:text-slate-400 truncate">{title}</span>
            </nav>

            {/* Meta */}
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <time className="text-xs text-slate-400 dark:text-slate-500">{dateFormatted}</time>
              <span className="text-xs text-slate-300 dark:text-slate-600">·</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{readingTime}</span>
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>

            {/* Title */}
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 text-lg text-slate-500 dark:text-slate-400 leading-relaxed">
              {description}
            </p>

            {/* Divider */}
            <hr className="my-8 border-slate-200 dark:border-slate-800" />

            {/* MDX content */}
            <div className="prose-slate max-w-none">{children}</div>

            {/* Article CTA */}
            <div className="mt-12 rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-950/30">
              <h3 className="text-base font-semibold text-blue-900 dark:text-blue-100">
                Alles automatisch erledigen lassen
              </h3>
              <p className="mt-2 text-sm text-blue-800 dark:text-blue-200">
                MyImmoHub importiert deine Kontoumsätze, kategorisiert per KI und erstellt Anlage V,
                AfA und GbR-Aufteilung vollautomatisch.
              </p>
              <Link
                href="/auth"
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Kostenlos starten →
              </Link>
            </div>

            {/* Back link */}
            <div className="mt-8">
              <Link
                href="/steuer-tipps"
                className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <ChevronLeftIcon className="h-4 w-4" /> Alle Steuer-Tipps
              </Link>
            </div>
          </article>

          {/* ─── Sidebar ────────────────────────────────────────────────── */}
          <aside className="hidden w-64 flex-shrink-0 lg:block">
            <div className="sticky top-24 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                  Kostenlose Tools
                </p>
                <nav className="space-y-2">
                  {[
                    { href: "/tools/rendite", label: "Renditerechner" },
                    { href: "/tools/kredit", label: "Kreditrechner" },
                    { href: "/tools/spekulationssteuer", label: "Spekulationssteuer" },
                    { href: "/tools/kaufnebenkosten", label: "Kaufnebenkosten" },
                  ].map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex items-center gap-2 text-sm text-slate-600 transition hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400"
                    >
                      <ChevronRightIcon className="h-3 w-3" />
                      {label}
                    </Link>
                  ))}
                </nav>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
                  MyImmoHub
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed mb-4">
                  Steuer-Verwaltung für Vermieter — automatisch, korrekt, ELSTER-fertig.
                </p>
                <Link
                  href="/auth"
                  className="block w-full rounded-lg bg-blue-600 py-2 text-center text-xs font-medium text-white transition hover:bg-blue-700"
                >
                  Kostenlos starten
                </Link>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

