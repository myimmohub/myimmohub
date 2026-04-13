"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyType = "wohnung" | "haus" | "gewerbe" | "sonstiges";

const STEPS = [
  { id: 1, label: "Willkommen" },
  { id: 2, label: "Immobilie" },
  { id: 3, label: "Fertig" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [isCheckingExistingProperty, setIsCheckingExistingProperty] = useState(true);
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [type, setType] = useState<PropertyType>("wohnung");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null);

  const isAddPropertyMode = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mode") === "add-property";
  const effectiveStep: 1 | 2 | 3 = isAddPropertyMode && step === 1 ? 2 : step;

  useEffect(() => {
    const checkExistingProperties = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsCheckingExistingProperty(false);
        return;
      }

      const { data, error } = await supabase
        .from("properties")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!isAddPropertyMode && !error && data && data.length > 0) {
        router.replace("/dashboard");
        return;
      }

      setIsCheckingExistingProperty(false);
    };

    void checkExistingProperties();
  }, [isAddPropertyMode, router]);

  const handlePropertySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      setSubmitError("Du musst eingeloggt sein, um eine Immobilie anzulegen.");
      setIsSubmitting(false);
      return;
    }

    const { data: insertedProperty, error: insertError } = await supabase
      .from("properties")
      .insert({
        user_id: user.id,
        name: label,
        address,
        type,
      })
      .select("id")
      .single();

    if (insertError) {
      setSubmitError(insertError.message || "Fehler beim Speichern.");
      setIsSubmitting(false);
      return;
    }

    setCreatedPropertyId(insertedProperty.id);
    setIsSubmitting(false);
    setStep(3);
  };

  if (isCheckingExistingProperty) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <section className="mx-auto w-full max-w-3xl space-y-4">
          <div className="h-8 w-48 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-48 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Onboarding</h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {isAddPropertyMode ? "Lege eine weitere Immobilie an. Alles Weitere kannst du später ergänzen." : "In wenigen Minuten ist deine erste Immobilie startklar."}
              </p>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">Schritt {effectiveStep} von 3</p>
          </div>

          <div className={`mt-6 grid gap-4 ${isAddPropertyMode ? "grid-cols-2" : "grid-cols-3"}`}>
            {(isAddPropertyMode ? STEPS.filter((item) => item.id !== 1) : STEPS).map((item) => (
              <div key={item.id} className="text-center">
                <div className={`mx-auto h-3 w-3 rounded-full ${effectiveStep >= item.id ? "bg-blue-600 dark:bg-blue-400" : "bg-slate-300 dark:bg-slate-700"}`} />
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
              </div>
            ))}
          </div>
        </div>

        {!isAddPropertyMode && effectiveStep === 1 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Was MyImmoHub für dich übernimmt</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              {[
                { title: "Dokumente", text: "Kaufverträge, Rechnungen und Belege an einem Ort verwalten.", icon: DocumentIcon },
                { title: "Banking", text: "Kontoauszüge importieren und Transaktionen sauber kategorisieren.", icon: CardIcon },
                { title: "Steuer", text: "Anlage V und GbR-Daten strukturiert vorbereiten.", icon: ChartIcon },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="rounded-lg bg-slate-50 px-4 py-4 dark:bg-slate-800/50">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-blue-600 dark:bg-slate-900 dark:text-blue-400">
                      <Icon className="h-4 w-4" />
                    </div>
                    <p className="mt-3 text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{item.text}</p>
                  </div>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Weiter zur Immobilie
            </button>
          </div>
        )}

        {effectiveStep === 2 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">{isAddPropertyMode ? "Neue Immobilie anlegen" : "Erste Immobilie anlegen"}</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Die Basisdaten reichen aus. Alles Weitere kannst du später ergänzen.</p>

            <form onSubmit={handlePropertySubmit} className="mt-6 space-y-4">
              <Field label="Bezeichnung">
                <input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="z. B. Wohnung Köln Lindenthal" required />
              </Field>
              <Field label="Adresse">
                <input className={inputClass} value={address} onChange={(event) => setAddress(event.target.value)} placeholder="Straße, PLZ Ort" required />
              </Field>
              <Field label="Typ">
                <select className={inputClass} value={type} onChange={(event) => setType(event.target.value as PropertyType)}>
                  <option value="wohnung">Wohnung</option>
                  <option value="haus">Haus</option>
                  <option value="gewerbe">Gewerbe</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
              </Field>

              {submitError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{submitError}</div>}

              <div className="flex items-center justify-between gap-3">
                {isAddPropertyMode ? (
                  <Link
                    href="/dashboard/properties"
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Abbrechen
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Zurück
                  </button>
                )}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSubmitting ? "Speichert..." : "Immobilie speichern"}
                </button>
              </div>
            </form>
          </div>
        )}

        {effectiveStep === 3 && (
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckIcon className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Immobilie angelegt</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label} · {address}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-slate-50 px-4 py-4 dark:bg-slate-800/50">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Nächster sinnvoller Schritt</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Lade deinen Kaufvertrag hoch, damit Stammdaten und Kaufpreisaufteilung automatisch übernommen werden.</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-4 py-4 dark:bg-slate-800/50">
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Danach</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Importiere Kontoauszüge und starte mit Banking, Profitabilität und Steuerdaten.</p>
              </div>
            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {createdPropertyId && (
                <Link
                  href="/dashboard/documents"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Dokumente hochladen
                </Link>
              )}
              <button
                type="button"
                onClick={() => router.push(createdPropertyId ? `/dashboard/properties/${createdPropertyId}/overview` : "/dashboard")}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Zum Steckbrief
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
    </svg>
  );
}

function CardIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 5a2 2 0 012-2h12a2 2 0 012 2v1H2V5z" />
      <path fillRule="evenodd" d="M18 9H2v6a2 2 0 002 2h12a2 2 0 002-2V9z" clipRule="evenodd" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 111.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143Z" clipRule="evenodd" />
    </svg>
  );
}
