"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type NavUser = {
  email: string;
  initial: string;
};

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", match: (pathname: string) => pathname === "/dashboard", icon: HomeIcon },
  { href: "/dashboard/properties", label: "Immobilien", match: (pathname: string) => pathname.startsWith("/dashboard/properties"), icon: BuildingIcon },
  { href: "/dashboard/documents", label: "Dokumente", match: (pathname: string) => pathname.startsWith("/dashboard/documents") || pathname.startsWith("/dashboard/inbox"), icon: DocumentIcon },
  { href: "/dashboard/banking", label: "Banking", match: (pathname: string) => pathname.startsWith("/dashboard/banking"), icon: CardIcon },
  { href: "/tools", label: "Rechner", match: (pathname: string) => pathname.startsWith("/tools"), icon: CalculatorIcon },
];

export default function DashboardNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<NavUser | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser?.email) return;
      const initial = authUser.email.slice(0, 1).toUpperCase();
      setUser({ email: authUser.email, initial });
    };
    void loadUser();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeItem = useMemo(
    () => NAV_ITEMS.find((item) => item.match(pathname)),
    [pathname],
  );

  const closeMenus = () => {
    setDropdownOpen(false);
    setMobileOpen(false);
  };

  const handleLogout = async () => {
    setIsSigningOut(true);
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  };

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
            <HomeIcon className="h-4 w-4" />
          </span>
          <span className="text-base font-semibold text-slate-900 dark:text-slate-100">MyImmoHub</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          {NAV_ITEMS.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeMenus}
                className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                    : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative hidden sm:block" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setDropdownOpen((current) => !current)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-2 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {user?.initial ?? "?"}
              </span>
              <span className="hidden md:block">{activeItem?.label ?? "Konto"}</span>
            </button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900">
                <div className="px-3 py-2">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Konto</p>
                  <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">{user?.email ?? "Nicht angemeldet"}</p>
                </div>
                <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
                <Link
                  href="/dashboard/settings"
                  onClick={closeMenus}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Einstellungen
                </Link>
                <Link
                  href="/wissen/steuertipps-immobilienkauf"
                  onClick={closeMenus}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Wissen
                </Link>
                <div className="my-2 border-t border-slate-200 dark:border-slate-800" />
                <button
                  type="button"
                  onClick={() => void handleLogout()}
                  disabled={isSigningOut}
                  className="block w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  {isSigningOut ? "Abmelden..." : "Abmelden"}
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMobileOpen((current) => !current)}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 sm:hidden"
            aria-label="Navigation öffnen"
          >
            {mobileOpen ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900 sm:hidden">
          <nav className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = item.match(pathname);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={closeMenus}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
            <div className="my-3 border-t border-slate-200 dark:border-slate-800" />
            <Link
              href="/dashboard/settings"
              onClick={closeMenus}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Einstellungen
            </Link>
            <Link
              href="/wissen/steuertipps-immobilienkauf"
              onClick={closeMenus}
              className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Wissen
            </Link>
            <div className="px-3 pt-2 text-xs text-slate-400 dark:text-slate-500">{user?.email ?? "Nicht angemeldet"}</div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={isSigningOut}
              className="mt-1 block w-full rounded-lg px-3 py-2.5 text-left text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:text-red-400 dark:hover:bg-red-950/40"
            >
              {isSigningOut ? "Abmelden..." : "Abmelden"}
            </button>
          </nav>
        </div>
      )}
    </header>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}

function BuildingIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M3 18h14a1 1 0 100-2h-1V4a2 2 0 00-2-2H6a2 2 0 00-2 2v12H3a1 1 0 100 2zm3-4h2v2H6v-2zm0-4h2v2H6v-2zm0-4h2v2H6V6zm6 8h2v2h-2v-2zm0-4h2v2h-2v-2zm0-4h2v2h-2V6z" />
    </svg>
  );
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 5a1 1 0 000 2h6a1 1 0 100-2H7zm0 4a1 1 0 100 2h4a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}

function CardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v1H2V5z" />
      <path fillRule="evenodd" d="M18 9H2v6a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 100 2h2a1 1 0 100-2H4z" clipRule="evenodd" />
    </svg>
  );
}

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M5 2a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V4a2 2 0 00-2-2H5zm2 3a1 1 0 000 2h6a1 1 0 100-2H7zm0 4a1 1 0 100 2h1a1 1 0 100-2H7zm3 0a1 1 0 100 2h1a1 1 0 100-2h-1zm3 0a1 1 0 100 2h1a1 1 0 100-2h-1zM7 13a1 1 0 100 2h1a1 1 0 100-2H7zm3 0a1 1 0 100 2h4a1 1 0 100-2h-4z" />
    </svg>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm1 4a1 1 0 100 2h12a1 1 0 100-2H4z" clipRule="evenodd" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}
