"use client";

import { FormEvent, useState } from "react";
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

  const resetMessages = () => {
    setErrorMessage(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
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
        setSuccessMessage("Registrierung erfolgreich. Bitte pruefe deine E-Mails.");
        router.push("/onboarding");
      }
    }

    setIsLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
      <section className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {isLogin ? "Login" : "Registrierung"}
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {isLogin
            ? "Melde dich mit deinem Konto an."
            : "Erstelle ein neues Konto mit E-Mail und Passwort."}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              E-Mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
              placeholder="name@beispiel.de"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Passwort
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isLogin ? "current-password" : "new-password"}
              required
              minLength={6}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
              placeholder="Mindestens 6 Zeichen"
            />
          </div>

          {errorMessage ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {errorMessage}
            </p>
          ) : null}

          {successMessage ? (
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              {successMessage}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            {isLoading ? "Bitte warten..." : isLogin ? "Einloggen" : "Registrieren"}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setIsLogin((current) => !current);
            resetMessages();
          }}
          className="mt-4 w-full text-sm font-medium text-zinc-700 underline underline-offset-4 transition hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-100"
        >
          {isLogin
            ? "Noch kein Konto? Jetzt registrieren"
            : "Du hast bereits ein Konto? Zum Login"}
        </button>
      </section>
    </main>
  );
}
