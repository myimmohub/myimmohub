"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Property = { id: string; name: string };

const PropertyContext = createContext<string>("");
export function usePropertyId() { return useContext(PropertyContext); }

const TABS = [
  { href: "/dashboard/settings",        label: "Kategorien" },
  { href: "/dashboard/settings/steuer", label: "Steuer" },
  { href: "/dashboard/settings/gwg",    label: "GWG & AfA" },
  { href: "/dashboard/settings/gbr",    label: "GbR" },
  { href: "/dashboard/settings/rollen", label: "Rollen" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");
      if (data && data.length > 0) {
        setProperties(data);
        setSelectedProperty(data[0].id);
      }
    };
    void load();
  }, []);

  return (
    <PropertyContext value={selectedProperty}>
      <div className="mx-auto max-w-5xl px-4 py-6 sm:py-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 sm:text-2xl">
              Einstellungen
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Steuerliche Grundeinstellungen, Kategorien und Rollen verwalten
            </p>
          </div>

          {properties.length > 0 && (
            <select
              value={selectedProperty}
              onChange={(e) => setSelectedProperty(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm transition hover:border-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-700 dark:bg-slate-800/50">
          {TABS.map((tab) => {
            const active = tab.href === "/dashboard/settings"
              ? pathname === "/dashboard/settings"
              : pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                  active
                    ? "bg-white text-blue-600 shadow-sm dark:bg-slate-900 dark:text-blue-400"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {children}
      </div>
    </PropertyContext>
  );
}
