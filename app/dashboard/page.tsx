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
                  <Link
                    href={`/dashboard/properties/${property.id}`}
                    className="text-sm font-medium text-zinc-800 underline underline-offset-4 transition hover:text-zinc-950 dark:text-zinc-200 dark:hover:text-zinc-50"
                  >
                    Dokumente hochladen
                  </Link>
                </div>
              ))
            )}
          </div>
        ) : null}

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
