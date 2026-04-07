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

const TYPE_LABELS: Record<string, string> = {
  wohnung: "Wohnung",
  haus: "Haus",
  gewerbe: "Gewerbe",
  sonstiges: "Sonstiges",
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
    <main className="mx-auto w-full max-w-5xl px-4 py-6 sm:py-10">
      {/* Welcome section */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Dashboard
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {isLoading ? "Lade Benutzerdaten..." : `Willkommen, ${displayName}`}
        </p>
      </div>

      {/* Quick Actions */}
      {!isLoading && (
        <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Link
            href={properties.length > 0 ? `/dashboard/properties/${properties[0].id}` : "/onboarding"}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">Dokument hochladen</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">PDF, JPG oder PNG</p>
            </div>
          </Link>

          <Link
            href="/dashboard/banking/import"
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">CSV importieren</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Kontoauszuege einlesen</p>
            </div>
          </Link>

          <Link
            href="/dashboard/inbox"
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-slate-100">KI-Postfach</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">E-Mails automatisch verarbeiten</p>
            </div>
          </Link>
        </div>
      )}

      {!isLoading && propertyError ? (
        <p className="mb-6 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {propertyError}
        </p>
      ) : null}

      {/* Properties section */}
      {!isLoading && !propertyError ? (
        <div className="mb-8">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Deine Immobilien</h2>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 transition hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Hinzufuegen
            </Link>
          </div>

          {properties.length === 0 ? (
            <div className="flex flex-col items-center gap-4 rounded-xl border-2 border-dashed border-slate-200 bg-white py-10 text-center dark:border-slate-700 dark:bg-slate-900">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 dark:bg-blue-950/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">Noch keine Immobilie angelegt</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Fuege deine erste Immobilie hinzu, um alle Funktionen zu nutzen.
                </p>
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {properties.map((property) => (
                <Link
                  key={property.id}
                  href={`/dashboard/properties/${property.id}/overview`}
                  className="group flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-4 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-700"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900 dark:text-slate-100">{property.name}</p>
                    <p className="mt-0.5 truncate text-sm text-slate-500 dark:text-slate-400">
                      {property.address}
                    </p>
                    <span className="mt-2 inline-block rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                      {TYPE_LABELS[property.type] || property.type}
                    </span>
                  </div>
                  <svg xmlns="http://www.w3.org/2000/svg" className="ml-3 h-5 w-5 shrink-0 text-slate-300 transition group-hover:text-blue-500 dark:text-slate-600 dark:group-hover:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* KI-Postfach section */}
      <div className="mb-8 rounded-xl border border-slate-200 bg-white p-4 sm:p-6 dark:border-slate-800 dark:bg-slate-900">
        <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">KI-Postfach</h2>
        {process.env.NEXT_PUBLIC_GMAIL_USER ? (
          <>
            <p className="mt-2 break-all font-mono text-sm font-medium text-slate-900 dark:text-slate-100">
              {process.env.NEXT_PUBLIC_GMAIL_USER}
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Schicke Rechnungen, Quittungen und Belege an diese Adresse -- sie werden automatisch verarbeitet.
            </p>
            <button
              type="button"
              onClick={() => void handleFetchEmails()}
              disabled={isFetchingEmails}
              className="mt-3 inline-flex items-center justify-center rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isFetchingEmails ? "Pruefe..." : "Jetzt pruefen"}
            </button>
            {fetchEmailResult ? (
              <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-400">
                {fetchEmailResult.emails === 0
                  ? "Keine neuen E-Mails."
                  : `${fetchEmailResult.emails} E-Mail${fetchEmailResult.emails !== 1 ? "s" : ""} verarbeitet, ${fetchEmailResult.attachments} Anhang${fetchEmailResult.attachments !== 1 ? "aenge" : ""} gespeichert.`}
              </p>
            ) : null}
            {fetchEmailError ? (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{fetchEmailError}</p>
            ) : null}
            <div className="mt-3 flex gap-2">
              <Link
                href="/dashboard/inbox"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Eingang anzeigen
              </Link>
              <Link
                href="/dashboard/documents"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Alle Dokumente
              </Link>
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Keine Postfach-Adresse konfiguriert (NEXT_PUBLIC_GMAIL_USER fehlt).
          </p>
        )}
      </div>

      {/* Logout */}
      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        {isLoggingOut ? "Logout..." : "Logout"}
      </button>
    </main>
  );
}
