"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DashboardNav from "@/components/DashboardNav";
import { supabase } from "@/lib/supabase";

export default function ToolsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setHasSession(Boolean(data.session));
    };
    void loadSession();
  }, []);

  if (hasSession === null) {
    return <>{children}</>;
  }

  if (hasSession) {
    return (
      <>
        <DashboardNav />
        {children}
      </>
    );
  }

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/90">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link href="/auth" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <HomeIcon className="h-4 w-4" />
            </span>
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">MyImmoHub</span>
          </Link>
          <nav className="flex items-center gap-1">
            <Link
              href="/tools"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                pathname.startsWith("/tools")
                  ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              Rechner
            </Link>
            <Link
              href="/wissen/steuertipps-immobilienkauf"
              className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                pathname.startsWith("/wissen")
                  ? "bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              }`}
            >
              Wissen
            </Link>
            <Link
              href="/auth"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
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

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}
