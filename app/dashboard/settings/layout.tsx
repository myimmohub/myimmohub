"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PropertyContext } from "./property-context";

type Property = { id: string; name: string };

const TABS = [
  { href: "/dashboard/settings", label: "Kategorien" },
  { href: "/dashboard/settings/steuer", label: "Steuer" },
  { href: "/dashboard/settings/gwg", label: "GWG & AfA" },
  { href: "/dashboard/settings/gbr", label: "GbR" },
  { href: "/dashboard/settings/rollen", label: "Rollen" },
  { href: "/dashboard/settings/konto", label: "Konto" },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState("");

  useEffect(() => {
    const loadProperties = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");
      const nextProperties = (data ?? []) as Property[];
      setProperties(nextProperties);
      if (nextProperties.length > 0) setSelectedProperty(nextProperties[0].id);
    };
    void loadProperties();
  }, []);

  return (
    <PropertyContext value={selectedProperty}>
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <section className="mx-auto w-full max-w-6xl space-y-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Einstellungen</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kategorien, Steuerlogik, Rollen und Konto zentral verwalten.</p>
            </div>
            {properties.length > 0 && (
              <select
                value={selectedProperty}
                onChange={(event) => setSelectedProperty(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 md:w-72"
              >
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800/50">
            {TABS.map((tab) => {
              const active = tab.href === "/dashboard/settings"
                ? pathname === tab.href
                : pathname.startsWith(tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
                    active
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </div>

          {children}
        </section>
      </main>
    </PropertyContext>
  );
}
