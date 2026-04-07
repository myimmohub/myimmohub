"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

type Property = { id: string; name: string };

// ── Icons ────────────────────────────────────────────────────────────────────

const HOUSE_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
  </svg>
);

const BANKING_ICON = (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
    <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
  </svg>
);

const CHEVRON = (open: boolean) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
  </svg>
);

// ── Haupt-Komponente ──────────────────────────────────────────────────────────

export default function DashboardNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen]       = useState(false);
  const [openDrop, setOpenDrop]       = useState<"immo" | "konto" | null>(null);
  const [properties, setProperties]   = useState<Property[]>([]);

  const immoRef  = useRef<HTMLDivElement>(null);
  const kontoRef = useRef<HTMLDivElement>(null);

  // Immobilien laden
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");
      setProperties(data ?? []);
    };
    void load();
  }, []);

  // Dropdown schließen bei Klick außerhalb
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        immoRef.current && !immoRef.current.contains(target) &&
        kontoRef.current && !kontoRef.current.contains(target)
      ) {
        setOpenDrop(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Dropdown + Burger schließen bei Route-Wechsel
  useEffect(() => { setOpenDrop(null); setMenuOpen(false); }, [pathname]);

  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname.startsWith(href);

  const immoActive  = pathname.startsWith("/dashboard/properties");
  const kontoActive = pathname.startsWith("/dashboard/banking");

  // ── Dropdown-Inhalt: eine Immobilie ────────────────────────────────────────
  const propertyLinks = (p: Property) => [
    { href: `/dashboard/properties/${p.id}/overview`,      label: "Steckbrief"     },
    { href: `/dashboard/properties/${p.id}/profitability`, label: "Profitabilität" },
    { href: `/dashboard/properties/${p.id}`,               label: "Dokumente"      },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/90">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">

        {/* Logo */}
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-semibold text-zinc-900 transition hover:opacity-70 dark:text-zinc-100"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
          </svg>
          MyImmoHub
        </Link>

        {/* Desktop-Navigation */}
        <nav className="hidden items-center gap-1 sm:flex">

          {/* Dashboard */}
          <Link
            href="/dashboard"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              isActive("/dashboard", true)
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            }`}
          >
            Dashboard
          </Link>

          {/* Immobilien-Dropdown */}
          <div className="relative" ref={immoRef}>
            <button
              type="button"
              onClick={() => setOpenDrop((v) => v === "immo" ? null : "immo")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                immoActive
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              {HOUSE_ICON}
              Immobilien
              {CHEVRON(openDrop === "immo")}
            </button>

            {openDrop === "immo" && (
              <div className="absolute left-0 top-full mt-1.5 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {properties.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-zinc-400 dark:text-zinc-500">
                    Noch keine Immobilien
                  </div>
                ) : (
                  properties.map((p, idx) => (
                    <div key={p.id}>
                      {idx > 0 && <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />}
                      {/* Immobilienname */}
                      <div className="px-3 pt-2 pb-1">
                        <p className="truncate text-xs font-semibold text-zinc-500 dark:text-zinc-400">{p.name}</p>
                      </div>
                      {propertyLinks(p).map((link) => (
                        <Link
                          key={link.href}
                          href={link.href}
                          className={`flex items-center gap-2 px-4 py-1.5 text-sm transition ${
                            isActive(link.href)
                              ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                              : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                          }`}
                        >
                          {link.label}
                        </Link>
                      ))}
                    </div>
                  ))
                )}
                <div className="mt-1 border-t border-zinc-100 dark:border-zinc-800" />
                <Link
                  href="/onboarding"
                  className="flex items-center gap-2 px-4 py-2 text-sm text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-400"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  Immobilie hinzufügen
                </Link>
              </div>
            )}
          </div>

          {/* Dokumente */}
          <Link
            href="/dashboard/documents"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              isActive("/dashboard/documents")
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            }`}
          >
            Dokumente
          </Link>

          {/* KI-Postfach */}
          <Link
            href="/dashboard/inbox"
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              isActive("/dashboard/inbox")
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
            }`}
          >
            KI-Postfach
          </Link>

          {/* Konto-Dropdown */}
          <div className="relative" ref={kontoRef}>
            <button
              type="button"
              onClick={() => setOpenDrop((v) => v === "konto" ? null : "konto")}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                kontoActive
                  ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-100"
              }`}
            >
              {BANKING_ICON}
              Konto
              {CHEVRON(openDrop === "konto")}
            </button>

            {openDrop === "konto" && (
              <div className="absolute right-0 top-full mt-1.5 w-44 overflow-hidden rounded-xl border border-zinc-200 bg-white py-1 shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
                {[
                  { href: "/dashboard/banking",        label: "Übersicht",       exact: true  },
                  { href: "/dashboard/banking/import", label: "CSV importieren", exact: false },
                  { href: "/dashboard/banking/review", label: "Zum Review",      exact: false },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-2 px-3 py-2 text-sm transition ${
                      isActive(link.href, link.exact)
                        ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
                    }`}
                  >
                    {isActive(link.href, link.exact) && (
                      <span className="h-1.5 w-1.5 rounded-full bg-zinc-900 dark:bg-zinc-100" />
                    )}
                    <span className={isActive(link.href, link.exact) ? "" : "ml-3.5"}>
                      {link.label}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>

        {/* Burger-Button (mobil) */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Menü öffnen"
          className="rounded-lg p-2 text-zinc-500 transition hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800 sm:hidden"
        >
          {menuOpen ? (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM3 15a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile-Menü */}
      {menuOpen && (
        <nav className="border-t border-zinc-100 px-4 pb-3 pt-2 dark:border-zinc-800 sm:hidden">

          <Link href="/dashboard"
            className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive("/dashboard", true)
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            Dashboard
          </Link>

          {/* Immobilien-Abschnitt (mobil) */}
          <div className="mt-1">
            <p className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {HOUSE_ICON} Immobilien
            </p>
            {properties.map((p) => (
              <div key={p.id} className="mb-2">
                <p className="px-3 py-1 text-xs font-semibold text-zinc-500 dark:text-zinc-400">{p.name}</p>
                {propertyLinks(p).map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`block rounded-lg py-2 pl-7 pr-3 text-sm font-medium transition ${
                      isActive(link.href)
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                        : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400"
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            ))}
            <Link href="/onboarding"
              className="block rounded-lg py-2 pl-7 pr-3 text-sm text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-600 dark:text-zinc-500">
              + Immobilie hinzufügen
            </Link>
          </div>

          <Link href="/dashboard/documents"
            className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive("/dashboard/documents")
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            Dokumente
          </Link>

          <Link href="/dashboard/inbox"
            className={`block rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive("/dashboard/inbox")
                ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400"
            }`}
          >
            KI-Postfach
          </Link>

          {/* Konto-Abschnitt (mobil) */}
          <div className="mt-1">
            <p className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
              {BANKING_ICON} Konto
            </p>
            {[
              { href: "/dashboard/banking",        label: "Übersicht",       exact: true  },
              { href: "/dashboard/banking/import", label: "CSV importieren", exact: false },
              { href: "/dashboard/banking/review", label: "Zum Review",      exact: false },
            ].map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`block rounded-lg py-2 pl-7 pr-3 text-sm font-medium transition ${
                  isActive(link.href, link.exact)
                    ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 dark:text-zinc-400"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
