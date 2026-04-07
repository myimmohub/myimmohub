"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

const TABS = [
  {
    href: (id: string) => `/dashboard/properties/${id}`,
    label: "Dokumente",
    exact: true,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
      </svg>
    ),
  },
  {
    href: (id: string) => `/dashboard/properties/${id}/overview`,
    label: "Steckbrief",
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
      </svg>
    ),
  },
  {
    href: (id: string) => `/dashboard/properties/${id}/profitability`,
    label: "Profitabilität",
    exact: false,
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
        <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
];

export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [propertyName, setPropertyName] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("properties")
        .select("name")
        .eq("id", id)
        .single();
      if (data) setPropertyName(data.name as string);
    };
    void load();
  }, [id]);

  const isActive = (tab: typeof TABS[number]) => {
    const href = tab.href(id);
    return tab.exact ? pathname === href : pathname.startsWith(href);
  };

  return (
    <>
      {/* Sub-Navigation */}
      <div className="sticky top-14 z-30 border-b border-zinc-200 bg-white/95 backdrop-blur-sm dark:border-zinc-800 dark:bg-zinc-950/95">
        <div className="mx-auto max-w-6xl px-4">
          {/* Immobilienname */}
          {propertyName && (
            <div className="flex items-center gap-2 pb-0 pt-3">
              <Link
                href="/dashboard"
                className="text-xs text-zinc-400 transition hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300"
              >
                Dashboard
              </Link>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-zinc-300 dark:text-zinc-600" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{propertyName}</span>
            </div>
          )}

          {/* Tabs */}
          <nav className="-mb-px flex gap-0.5 pt-2">
            {TABS.map((tab) => {
              const active = isActive(tab);
              return (
                <Link
                  key={tab.label}
                  href={tab.href(id)}
                  className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                    active
                      ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100"
                      : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Seiteninhalt */}
      {children}
    </>
  );
}
