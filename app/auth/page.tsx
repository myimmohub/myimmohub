"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AuthPage() {
  const router = useRouter();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);

    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage("Login erfolgreich.");
        router.push("/dashboard");
        router.refresh();
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setErrorMessage(error.message);
      } else {
        setSuccessMessage("Registrierung erfolgreich. Bitte prüfe deine E-Mails.");
        router.push("/onboarding");
      }
    }

    setIsLoading(false);
  };

  return (
    <main className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <div className="hidden lg:flex lg:w-1/2 lg:flex-col lg:justify-center bg-blue-600 px-12 text-white">
        <div className="max-w-lg">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/10">
              <HomeIcon className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold">MyImmoHub</span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Verwalte deine Immobilien ohne Tabellenchaos.</h1>
          <p className="mt-4 text-sm text-blue-100">
            Dokumente, Banking, Profitabilität und Steuerdaten in einem ruhigen Workflow für private Vermieter.
          </p>
          <div className="mt-8 space-y-3">
            {[
              "Dokumente automatisch analysieren",
              "Banking sauber kategorisieren",
              "Steuerdaten strukturiert vorbereiten",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 text-sm text-blue-50">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10">
                  <CheckIcon className="h-4 w-4" />
                </span>
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <section className="w-full max-w-md space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-5 flex items-center gap-2 lg:hidden">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
                <HomeIcon className="h-4 w-4" />
              </div>
              <span className="text-base font-semibold text-slate-900 dark:text-slate-100">MyImmoHub</span>
            </div>

            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {isLogin ? "Willkommen zurück" : "Konto erstellen"}
            </h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {isLogin ? "Melde dich an, um mit deinen Immobilien weiterzuarbeiten." : "Lege dein Konto an und starte direkt mit dem ersten Objekt."}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">E-Mail</label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="name@beispiel.de"
                />
              </div>

              <div>
                <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Passwort</label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  placeholder="Mindestens 6 Zeichen"
                />
                <div className="mt-2 flex justify-between gap-3">
                  <Link href="/auth/reset" className="text-sm font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                    Passwort vergessen?
                  </Link>
                </div>
              </div>

              {errorMessage && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{errorMessage}</div>}
              {successMessage && <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{successMessage}</div>}

              <button
                type="submit"
                disabled={isLoading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {isLoading ? "Bitte warten..." : isLogin ? "Einloggen" : "Registrieren"}
              </button>

              <div className="text-center">
                <Link href="/tools" className="text-sm font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300">
                  Kostenlose Tools ohne Konto →
                </Link>
              </div>
            </form>
          </div>

          <button
            type="button"
            onClick={() => {
              setIsLogin((current) => !current);
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className="w-full text-sm font-medium text-slate-500 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            {isLogin ? "Noch kein Konto? Jetzt registrieren" : "Du hast bereits ein Konto? Zum Login"}
          </button>
        </section>
      </div>
    </main>
  );
}

function HomeIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
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
