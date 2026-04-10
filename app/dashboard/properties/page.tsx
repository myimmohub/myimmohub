"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Property = {
  id: string;
  name: string;
  address: string | null;
  kaufpreis: number | null;
  baujahr: number | null;
};

export default function PropertiesPage() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setIsLoading(false); return; }
      const { data } = await supabase
        .from("properties")
        .select("id, name, address, kaufpreis, baujahr")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setProperties((data ?? []) as Property[]);
      setIsLoading(false);
    };
    void load();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Meine Immobilien
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Direkter Einstieg in Steckbrief, Dokumente und Steuerdaten.
            </p>
          </div>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            Hinzufügen
          </Link>
        </div>

        {isLoading ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-slate-200 py-16 text-center dark:border-slate-700">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M3 18h14a1 1 0 100-2h-1V4a2 2 0 00-2-2H6a2 2 0 00-2 2v12H3a1 1 0 100 2zm3-4h2v2H6v-2zm0-4h2v2H6v-2zm0-4h2v2H6V6zm6 8h2v2h-2v-2zm0-4h2v2h-2v-2zm0-4h2v2h-2V6z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300">Noch keine Immobilie angelegt</p>
              <p className="mt-1 text-sm text-slate-500">Lege dein erstes Objekt an und starte mit Dokumenten, Banking und Steuerdaten.</p>
            </div>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Erste Immobilie anlegen
            </Link>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {properties.map((property) => (
              <Link
                key={property.id}
                href={`/dashboard/properties/${property.id}/overview`}
                className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{property.name}</p>
                    {property.address && (
                      <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">{property.address}</p>
                    )}
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-blue-400 dark:text-slate-600" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {property.kaufpreis && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {property.kaufpreis.toLocaleString("de-DE")} €
                    </span>
                  )}
                  {property.baujahr && (
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      Baujahr {property.baujahr}
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
