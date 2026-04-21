"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyDetail = {
  id: string;
  name: string;
  address: string | null;
  type: string | null;
};

export default function PropertyNebenkostenPage() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<PropertyDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadProperty = async () => {
      const { data, error: loadError } = await supabase
        .from("properties")
        .select("id, name, address, type")
        .eq("id", id)
        .single();

      if (loadError) {
        setError(loadError.message);
      } else {
        setProperty(data as PropertyDetail);
      }

      setIsLoading(false);
    };

    void loadProperty();
  }, [id]);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        {isLoading ? (
          <div className="space-y-3">
            <div className="h-8 w-72 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
            <div className="h-4 w-96 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          </div>
        ) : error ? (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        ) : (
          <>
            <header className="space-y-2">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Nebenkosten / {property?.name}
              </p>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Nebenkostenbereich
              </h1>
              <p className="max-w-3xl text-sm text-slate-500 dark:text-slate-400">
                Hier bündeln wir die Vorbereitung für Einheiten, Mieter,
                Zahlungen und die Nebenkostenabrechnung dieser Immobilie.
              </p>
            </header>

            <div className="grid gap-4 md:grid-cols-2">
              <InfoCard
                title="Einheiten prüfen"
                text="Wohnflächen und Einheitendaten sind die Grundlage für die spätere Verteilung."
                href={`/dashboard/properties/${id}/units`}
                cta="Zu den Einheiten"
              />
              <InfoCard
                title="Mieter prüfen"
                text="Aktive Mietverhältnisse und Vorauszahlungen sollten hier vollständig gepflegt sein."
                href={`/dashboard/properties/${id}/tenants`}
                cta="Zu den Mietern"
              />
              <InfoCard
                title="Zahlungen prüfen"
                text="Miet- und Nebenkostenzahlungen kannst du hier prüfen und zuordnen."
                href={`/dashboard/properties/${id}/payments`}
                cta="Zu den Zahlungen"
              />
              <InfoCard
                title="Steuerdaten öffnen"
                text="Wenn du parallel steuerliche Werte prüfen willst, kommst du von hier direkt in die Steuerdaten."
                href={`/dashboard/properties/${id}/tax`}
                cta="Zu den Steuerdaten"
              />
            </div>

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Nächster sinnvoller Schritt
              </h2>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Für diese Immobilie erreichst du den Nebenkosten-Workflow jetzt
                direkt über dieses Menü. Wenn du mit der Abrechnung startest,
                sind Einheiten, Mieter und Zahlungen die wichtigsten
                Vorbedingungen.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href="/dashboard/nka"
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Zur Nebenkosten-Übersicht
                </Link>
                <Link
                  href={`/dashboard/properties/${id}/units`}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Stammdaten vorbereiten
                </Link>
              </div>
            </section>
          </>
        )}
      </section>
    </main>
  );
}

function InfoCard({
  title,
  text,
  href,
  cta,
}: {
  title: string;
  text: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {title}
      </h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{text}</p>
      <div className="mt-5">
        <Link
          href={href}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}
