"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";

const ALL_TABS = [
  { label: "Steckbrief", href: (id: string) => `/dashboard/properties/${id}/overview`, match: (pathname: string, id: string) => pathname.startsWith(`/dashboard/properties/${id}/overview`), multiUnitOnly: false },
  { label: "Profitabilität", href: (id: string) => `/dashboard/properties/${id}/profitability`, match: (pathname: string, id: string) => pathname.startsWith(`/dashboard/properties/${id}/profitability`), multiUnitOnly: false },
  { label: "Steuerdaten", href: (id: string) => `/dashboard/properties/${id}/tax`, match: (pathname: string, id: string) => pathname.startsWith(`/dashboard/properties/${id}/tax`), multiUnitOnly: false },
  { label: "Nebenkosten", href: (id: string) => `/dashboard/properties/${id}/nka`, match: (pathname: string, id: string) => pathname.startsWith(`/dashboard/properties/${id}/nka`), multiUnitOnly: false },
  { label: "Einheiten", href: (id: string) => `/dashboard/properties/${id}/units`, match: (pathname: string, id: string) => pathname.startsWith(`/dashboard/properties/${id}/units`), multiUnitOnly: true },
  { label: "Mieter", href: (id: string) => `/dashboard/properties/${id}/tenants`, match: (pathname: string, id: string) => pathname.startsWith(`/dashboard/properties/${id}/tenants`), multiUnitOnly: true },
  { label: "Zahlungen", href: (id: string) => `/dashboard/properties/${id}/payments`, match: (pathname: string, id: string) => pathname.startsWith(`/dashboard/properties/${id}/payments`), multiUnitOnly: true },
];

export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [propertyName, setPropertyName] = useState<string>("Immobilie");
  const [propertyType, setPropertyType] = useState<string | null>(null);

  useEffect(() => {
    const loadProperty = async () => {
      const { data } = await supabase.from("properties").select("name, type").eq("id", id).single();
      if (data?.name) setPropertyName(data.name as string);
      if (data?.type) setPropertyType(data.type as string);
    };
    void loadProperty();
  }, [id]);

  const isMultiUnit = propertyType === "mehrfamilienhaus";
  const tabs = ALL_TABS.filter((tab) => !tab.multiUnitOnly || isMultiUnit);

  return (
    <>
      <div className="sticky top-16 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
          <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{propertyName}</div>
          <nav className="-mb-3 flex flex-wrap gap-4">
            {tabs.map((tab) => {
              const active = tab.match(pathname, id);
              return (
                <Link
                  key={tab.label}
                  href={tab.href(id)}
                  className={`border-b-2 pb-3 text-sm font-medium transition ${
                    active
                      ? "border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400"
                      : "border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
      {children}
    </>
  );
}
