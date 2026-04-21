"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type PropertyRow = {
  id: string;
  name: string;
  address: string | null;
  type: string | null;
};

export default function NebenkostenOverviewPage() {
  const [properties, setProperties] = useState<PropertyRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProperties = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error: loadError } = await supabase
        .from("properties")
        .select("id, name, address, type")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (loadError) {
        setError(loadError.message);
      } else {
        setProperties((data ?? []) as PropertyRow[]);
      }

      setIsLoading(false);
    };

    void loadProperties();
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Nebenkosten
          </h1>
          <p className="max-w-2xl text-sm text-slate-500 dark:text-slate-400">
            Wähle eine Immobilie, um in den Nebenkosten-Bereich zu springen und
            Einheiten, Mieter, Zahlungen und die Abrechnung vorzubereiten.
          </p>
        </header>

        {error ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : null}

        {isLoading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[1, 2, 3].map((item) => (
              <div
                key={item}
                className="h-32 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800"
              />
            ))}
          </div>
        ) : properties.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="font-medium text-slate-700 dark:text-slate-300">
              Noch keine Immobilie vorhanden
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Lege zuerst eine Immobilie an, damit wir den Nebenkosten-Bereich
              pro Objekt öffnen können.
            </p>
            <div className="mt-5">
              <Link
                href="/onboarding?mode=add-property"
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Immobilie anlegen
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {properties.map((property) => (
              <Link
                key={property.id}
                href={`/dashboard/properties/${property.id}/nka`}
                className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-blue-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {property.name}
                    </p>
                    {property.address ? (
                      <p className="mt-1 truncate text-sm text-slate-500 dark:text-slate-400">
                        {property.address}
                      </p>
                    ) : null}
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition group-hover:bg-blue-100 dark:bg-blue-950/40 dark:text-blue-300">
                    Öffnen
                  </span>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                  {property.type ? (
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                      {property.type}
                    </span>
                  ) : null}
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    Nebenkostenbereich
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
