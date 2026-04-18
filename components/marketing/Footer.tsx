import Link from "next/link";

const TOOL_LINKS = [
  { href: "/tools/rendite", label: "Renditerechner" },
  { href: "/tools/kredit", label: "Kreditrechner" },
  { href: "/tools/spekulationssteuer", label: "Spekulationssteuer" },
  { href: "/tools/kaufnebenkosten", label: "Kaufnebenkosten" },
];

const WISSEN_LINKS = [
  { href: "/wissen/steuertipps-immobilienkauf", label: "Steuertipps beim Kauf" },
];

const PRODUCT_LINKS = [
  { href: "/auth", label: "Kostenlos starten" },
  { href: "/auth", label: "Anmelden" },
];

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6 py-14">
        {/* ─── Top: logo + columns ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 lg:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <Link href="/" className="mb-4 flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
                <HomeIcon className="h-4 w-4" />
              </span>
              <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                MyImmoHub
              </span>
            </Link>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              Steuerliche Verwaltung für<br />
              deutsche Privatvermieter.
            </p>
          </div>

          {/* Produkt */}
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Produkt
            </h3>
            <ul className="space-y-2">
              {PRODUCT_LINKS.map(({ href, label }) => (
                <li key={href + label}>
                  <Link
                    href={href}
                    className="text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Rechner */}
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Rechner
            </h3>
            <ul className="space-y-2">
              {TOOL_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Wissen */}
          <div>
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Steuerwissen
            </h3>
            <ul className="space-y-2">
              {WISSEN_LINKS.map(({ href, label }) => (
                <li key={href}>
                  <Link
                    href={href}
                    className="text-sm text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  >
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ─── Bottom: copyright + legal ───────────────────────────────── */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-slate-200 pt-8 dark:border-slate-800 sm:flex-row">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            © {year} MyImmoHub. Alle Rechte vorbehalten.
          </p>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Keine Steuerberatung. Alle Angaben ohne Gewähr.
          </p>
        </div>
      </div>
    </footer>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}
