"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function WissenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isWissen = pathname.startsWith("/wissen");
  const isTools = pathname.startsWith("/tools");

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-900/90">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link
            href="/auth"
            className="flex items-center gap-2 font-semibold text-blue-600 transition hover:opacity-70 dark:text-blue-500"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
            </svg>
            MyImmoHub
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/tools"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isTools
                  ? "bg-blue-50 font-semibold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                  : "text-zinc-600 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-500"
              }`}
            >
              Rechner
            </Link>
            <Link
              href="/wissen/steuertipps-immobilienkauf"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                isWissen
                  ? "bg-blue-50 font-semibold text-blue-600 dark:bg-blue-950/40 dark:text-blue-400"
                  : "text-zinc-600 hover:text-blue-600 dark:text-zinc-400 dark:hover:text-blue-500"
              }`}
            >
              Wissen
            </Link>
            <Link
              href="/auth"
              className="ml-2 rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Anmelden
            </Link>
          </nav>
        </div>
      </header>
      {children}
    </>
  );
}
