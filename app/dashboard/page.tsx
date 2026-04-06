"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyRecord = {
  id: string;
  name: string;
  address: string;
  type: string;
};

export default function DashboardPage() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState<string>("...");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [isFetchingEmails, setIsFetchingEmails] = useState(false);
  const [fetchEmailResult, setFetchEmailResult] = useState<{ emails: number; attachments: number } | null>(null);
  const [fetchEmailError, setFetchEmailError] = useState<string | null>(null);
  const [propertyError, setPropertyError] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const nameFromMetadata =
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.user_metadata?.name as string | undefined);

      setDisplayName(nameFromMetadata || user?.email || "Unbekannter Nutzer");

      if (user) {
        const { data: propertyData, error } = await supabase
          .from("properties")
          .select("id, name, address, type")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          setPropertyError(error.message);
        } else {
          setProperties(propertyData || []);
        }
      }

      setIsLoading(false);
    };

    void loadUser();
  }, []);

  const handleFetchEmails = async () => {
    setIsFetchingEmails(true);
    setFetchEmailResult(null);
    setFetchEmailError(null);

    try {
      const response = await fetch("/api/email-fetch", { method: "POST" });
      const data = (await response.json()) as { emails_processed?: number; attachments_saved?: number; error?: string };

      if (!response.ok) {
        throw new Error(data.error || "Fehler beim Abrufen der E-Mails.");
      }

      setFetchEmailResult({
        emails: data.emails_processed ?? 0,
        attachments: data.attachments_saved ?? 0,
      });
    } catch (error) {
      setFetchEmailError(error instanceof Error ? error.message : "Unbekannter Fehler.");
    } finally {
      setIsFetchingEmails(false);
    }
  };

  const handleLogout = async () => {
    setIsLoggingOut(true);
    await supabase.auth.signOut();
    router.push("/auth");
    router.refresh();
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          Dashboard
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {isLoading ? "Lade Benutzerdaten..." : `Willkommen, ${displayName}`}
        </p>

        {!isLoading && propertyError ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {propertyError}
          </p>
        ) : null}

        {!isLoading && !propertyError ? (
          <div className="mt-6 space-y-3">
            <h2 className="text-lg font-medium text-zinc-900 dark:text-zinc-100">Deine Immobilien</h2>

            {properties.length === 0 ? (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Noch keine Immobilie vorhanden. Starte mit dem Onboarding.
              </p>
            ) : (
              properties.map((property) => (
                <div
                  key={property.id}
                  className="flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900/40"
                >
                  <div>
                    <p className="font-medium text-zinc-900 dark:text-zinc-100">{property.name}</p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                      {property.address} · {property.type}
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <Link
                      href={`/dashboard/properties/${property.id}/overview`}
                      className="text-sm font-medium text-zinc-800 underline underline-offset-4 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-zinc-50"
                    >
                      Übersicht
                    </Link>
                    <Link
                      href={`/dashboard/properties/${property.id}`}
                      className="text-sm font-medium text-zinc-800 underline underline-offset-4 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-zinc-50"
                    >
                      Dokumente
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : null}

        <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900/40">
          <h2 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">KI-Postfach</h2>
          {process.env.NEXT_PUBLIC_GMAIL_USER ? (
            <>
              <p className="mt-2 break-all font-mono text-sm font-medium text-zinc-900 dark:text-zinc-100">
                {process.env.NEXT_PUBLIC_GMAIL_USER}
              </p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Schicke Rechnungen, Quittungen und Belege an diese Adresse – sie werden automatisch verarbeitet.
              </p>
              <button
                type="button"
                onClick={() => void handleFetchEmails()}
                disabled={isFetchingEmails}
                className="mt-3 inline-flex items-center justify-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                {isFetchingEmails ? "Prüfe..." : "Jetzt prüfen"}
              </button>
              {fetchEmailResult ? (
                <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                  {fetchEmailResult.emails === 0
                    ? "Keine neuen E-Mails."
                    : `${fetchEmailResult.emails} E-Mail${fetchEmailResult.emails !== 1 ? "s" : ""} verarbeitet, ${fetchEmailResult.attachments} Anhang${fetchEmailResult.attachments !== 1 ? "änge" : ""} gespeichert.`}
                </p>
              ) : null}
              {fetchEmailError ? (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{fetchEmailError}</p>
              ) : null}
              <div className="mt-3 flex gap-2">
                <Link
                  href="/dashboard/inbox"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Eingang anzeigen
                </Link>
                <Link
                  href="/dashboard/documents"
                  className="inline-flex items-center justify-center rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Alle Dokumente
                </Link>
              </div>
            </>
          ) : (
            <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
              Keine Postfach-Adresse konfiguriert (NEXT_PUBLIC_GMAIL_USER fehlt).
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isLoggingOut}
          className="mt-6 w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          {isLoggingOut ? "Logout..." : "Logout"}
        </button>
      </section>
    </main>
  );
}
