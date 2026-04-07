"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyType = "wohnung" | "haus" | "gewerbe" | "sonstiges";

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

  const handlePropertySubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitError(null);
    setIsSubmitting(true);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

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
      const msg = insertError.message || "Unbekannter Fehler beim Speichern.";
      if (msg.includes("Could not find the table") && msg.includes("properties")) {
        setSubmitError(
          "Die Tabelle 'properties' wurde in Supabase nicht gefunden (oder ist nicht im API-Schema verfuegbar). Bitte lege die Tabelle im 'public' Schema an und stelle sicher, dass sie fuer die API verfuegbar ist.",
        );
      } else {
        setSubmitError(msg);
      }
      setIsSubmitting(false);
      return;
    }

    setCreatedPropertyId(insertedProperty.id);
    setIsSubmitting(false);
    setStep(3);
  };

  const handleFinish = () => {
    if (createdPropertyId) {
      router.push(`/dashboard/properties/${createdPropertyId}`);
      return;
    }

    router.push("/dashboard");
  };

  useEffect(() => {
    const checkExistingProperties = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setIsCheckingExistingProperty(false);
        return;
      }

      const { data, error } = await supabase
        .from("properties")
        .select("id")
        .eq("user_id", user.id)
        .limit(1);

      if (!error && data && data.length > 0) {
        router.replace("/dashboard");
        return;
      }

      setIsCheckingExistingProperty(false);
    };

    void checkExistingProperties();
  }, [router]);

  if (isCheckingExistingProperty) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <p className="text-sm text-slate-600 dark:text-slate-400">Pruefe Onboarding-Status...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Onboarding
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Schritt {step} von 3
            </p>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3].map((currentStep) => (
              <span
                key={currentStep}
                className={`h-2 w-2 rounded-full ${
                  step >= currentStep ? "bg-blue-600 dark:bg-blue-500" : "bg-slate-300 dark:bg-slate-700"
                }`}
              />
            ))}
          </div>
        </header>

        {step === 1 ? (
          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">
              Willkommen bei ImmoHub
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              ImmoHub hilft dir dabei, deine Immobilien zentral zu verwalten: von Stammdaten über Mieter
              bis hin zu Dokumenten und Aufgaben. In wenigen Schritten legst du deine erste Immobilie an
              und bist startklar.
            </p>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Onboarding starten
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-8">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">
              Erste Immobilie anlegen
            </h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Lege eine Immobilie an, die du mit ImmoHub verwalten möchtest. Du kannst später jederzeit
              weitere Objekte hinzufügen.
            </p>

            <form onSubmit={handlePropertySubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="label"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Bezeichnung
                </label>
                <input
                  id="label"
                  type="text"
                  required
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  placeholder="z.B. Mehrfamilienhaus Musterstraße 12"
                />
              </div>

              <div>
                <label
                  htmlFor="address"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Adresse
                </label>
                <input
                  id="address"
                  type="text"
                  required
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                  placeholder="z.B. Musterstraße 12, 12345 Musterstadt"
                />
              </div>

              <div>
                <label
                  htmlFor="type"
                  className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300"
                >
                  Typ
                </label>
                <select
                  id="type"
                  value={type}
                  onChange={(event) => setType(event.target.value as PropertyType)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-blue-500 dark:focus:ring-blue-900/40"
                >
                  <option value="wohnung">Wohnung</option>
                  <option value="haus">Haus</option>
                  <option value="gewerbe">Gewerbe</option>
                  <option value="sonstiges">Sonstiges</option>
                </select>
              </div>

              {submitError ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                  {submitError}
                </p>
              ) : null}

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="text-sm font-medium text-slate-600 underline underline-offset-4 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                >
                  Zurück
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "Speichern..." : "Immobilie speichern & weiter"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-8 space-y-6">
            {/* Erfolgs-Header */}
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/40">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-emerald-600 dark:text-emerald-400">
                  <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                </svg>
              </span>
              <div>
                <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">
                  {label} wurde angelegt
                </h2>
                <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                  {address}
                </p>
              </div>
            </div>

            {/* Nächste Schritte */}
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Jetzt empfohlen — lade diese Dokumente hoch:
              </p>

              <div className="mt-3 space-y-3">

                {/* Kaufvertrag */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M4 4a2 2 0 0 1 2-2h4.586A2 2 0 0 1 12 2.586L15.414 6A2 2 0 0 1 16 7.414V16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4Zm2 6a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 6 10Zm.75 2.75a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
                      </svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Kaufvertrag
                        <span className="ml-2 text-xs font-normal text-slate-400">PDF</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Die KI liest Kaufpreis, Kaufdatum, Baujahr, Wohnfläche und die Kaufpreisaufteilung
                        (Gebäude / Grund / Inventar) automatisch aus. Das Ergebnis wird direkt in den
                        Steckbrief übernommen und für die AfA-Berechnung genutzt.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Kontoauszug */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-400">
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                        <path fillRule="evenodd" d="M1 4a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4Zm12 4a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM4 9a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm13-1a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z" clipRule="evenodd" />
                        <path d="M3 13.5A1.5 1.5 0 0 1 1.5 12v-.5A2.5 2.5 0 0 0 4 14h12a2.5 2.5 0 0 0 2.5-2.5v.5a1.5 1.5 0 0 1-1.5 1.5H3Z" />
                      </svg>
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        Kontoauszug
                        <span className="ml-2 text-xs font-normal text-slate-400">CSV · alle deutschen Banken</span>
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Buchungen werden automatisch den steuerlichen Kategorien der Anlage V zugeordnet
                        (z. B. Schuldzinsen, Erhaltungsaufwand, Grundsteuer). Duplikate werden beim
                        erneuten Import automatisch übersprungen.
                      </p>
                    </div>
                  </div>
                </div>

              </div>
            </div>

            {/* CTA */}
            <button
              type="button"
              onClick={handleFinish}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              {createdPropertyId ? "Zur Immobilie & Dokumente hochladen" : "Zum Dashboard"}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

