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
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Pruefe Onboarding-Status...</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
      <section className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Onboarding
            </h1>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Schritt {step} von 3
            </p>
          </div>

          <div className="flex items-center gap-2">
            {[1, 2, 3].map((currentStep) => (
              <span
                key={currentStep}
                className={`h-2 w-2 rounded-full ${
                  step >= currentStep ? "bg-zinc-900 dark:bg-zinc-100" : "bg-zinc-300 dark:bg-zinc-700"
                }`}
              />
            ))}
          </div>
        </header>

        {step === 1 ? (
          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Willkommen bei ImmoHub
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              ImmoHub hilft dir dabei, deine Immobilien zentral zu verwalten: von Stammdaten über Mieter
              bis hin zu Dokumenten und Aufgaben. In wenigen Schritten legst du deine erste Immobilie an
              und bist startklar.
            </p>

            <button
              type="button"
              onClick={() => setStep(2)}
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Onboarding starten
            </button>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="mt-8">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Erste Immobilie anlegen
            </h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
              Lege eine Immobilie an, die du mit ImmoHub verwalten möchtest. Du kannst später jederzeit
              weitere Objekte hinzufügen.
            </p>

            <form onSubmit={handlePropertySubmit} className="mt-6 space-y-4">
              <div>
                <label
                  htmlFor="label"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Bezeichnung
                </label>
                <input
                  id="label"
                  type="text"
                  required
                  value={label}
                  onChange={(event) => setLabel(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
                  placeholder="z.B. Mehrfamilienhaus Musterstraße 12"
                />
              </div>

              <div>
                <label
                  htmlFor="address"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Adresse
                </label>
                <input
                  id="address"
                  type="text"
                  required
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
                  placeholder="z.B. Musterstraße 12, 12345 Musterstadt"
                />
              </div>

              <div>
                <label
                  htmlFor="type"
                  className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300"
                >
                  Typ
                </label>
                <select
                  id="type"
                  value={type}
                  onChange={(event) => setType(event.target.value as PropertyType)}
                  className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
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
                  className="text-sm font-medium text-zinc-600 underline underline-offset-4 transition hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Zurück
                </button>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="inline-flex items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                >
                  {isSubmitting ? "Speichern..." : "Immobilie speichern & weiter"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">
              Onboarding abgeschlossen
            </h2>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              Deine erste Immobilie wurde erfasst (lokal gespeichert). In den nächsten Schritten kannst
              du im Dashboard weitere Details pflegen, Mieter hinzufügen und Dokumente verwalten.
            </p>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/40 dark:text-zinc-200">
              <p className="font-medium">Zusammenfassung</p>
              <p className="mt-2">
                <span className="font-medium">Bezeichnung:</span> {label || "—"}
              </p>
              <p className="mt-1">
                <span className="font-medium">Adresse:</span> {address || "—"}
              </p>
              <p className="mt-1">
                <span className="font-medium">Typ:</span>{" "}
                {type === "wohnung"
                  ? "Wohnung"
                  : type === "haus"
                  ? "Haus"
                  : type === "gewerbe"
                  ? "Gewerbe"
                  : "Sonstiges"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleFinish}
              className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {createdPropertyId ? "Zur Immobilien-Detailseite" : "Zum Dashboard"}
            </button>
          </div>
        ) : null}
      </section>
    </main>
  );
}

