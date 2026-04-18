"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/hooks/useTheme";

const NAV_LINKS = [
  { href: "/tools", label: "Rechner" },
  { href: "/wissen/steuertipps-immobilienkauf", label: "Steuerwissen" },
];

export default function Nav() {
  const pathname = usePathname();
  const { toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  // Close menu on route change
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const isActive = useCallback(
    (href: string) => pathname === href || pathname.startsWith(href + "/"),
    [pathname],
  );

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        {/* ─── Logo ──────────────────────────────────────────────────────── */}
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white">
            <HomeIcon className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
            MyImmoHub
          </span>
        </Link>

        {/* ─── Desktop nav ───────────────────────────────────────────────── */}
        <nav className="hidden items-center gap-1 sm:flex">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                isActive(href)
                  ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              {label}
            </Link>
          ))}

          {/* Theme toggle */}
          <button
            type="button"
            onClick={toggle}
            aria-label="Farbschema wechseln"
            className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <SunIcon className="h-4 w-4 dark:hidden" />
            <MoonIcon className="hidden h-4 w-4 dark:block" />
          </button>

          {/* CTA */}
          <Link
            href="/auth"
            className="ml-2 inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Kostenlos starten
          </Link>
        </nav>

        {/* ─── Mobile: theme toggle + hamburger ──────────────────────────── */}
        <div className="flex items-center gap-1 sm:hidden">
          <button
            type="button"
            onClick={toggle}
            aria-label="Farbschema wechseln"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800"
          >
            <SunIcon className="h-4 w-4 dark:hidden" />
            <MoonIcon className="hidden h-4 w-4 dark:block" />
          </button>
          <button
            type="button"
            aria-label={menuOpen ? "Menü schließen" : "Menü öffnen"}
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {menuOpen ? <XIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ─── Mobile dropdown menu ──────────────────────────────────────── */}
      {menuOpen && (
        <div
          ref={menuRef}
          className="absolute inset-x-0 top-16 z-50 border-b border-slate-200 bg-white shadow-lg dark:border-slate-800 dark:bg-slate-950 sm:hidden"
        >
          <nav className="flex flex-col px-4 py-3 gap-1">
            {NAV_LINKS.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-2.5 text-sm font-medium ${
                  isActive(href)
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
                }`}
              >
                {label}
              </Link>
            ))}
            <div className="mt-2 border-t border-slate-100 pt-2 dark:border-slate-800">
              <Link
                href="/auth"
                className="block w-full rounded-lg bg-blue-600 px-4 py-2.5 text-center text-sm font-medium text-white hover:bg-blue-700"
              >
                Kostenlos starten
              </Link>
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}

/* ─── Icons ──────────────────────────────────────────────────────────────── */
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
