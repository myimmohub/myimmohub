import Link from "next/link";

export default function AuthResetPlaceholderPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Passwort zurücksetzen</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Diese Seite ist aktuell ein Platzhalter. Der Reset-Flow kann hier als nächster Schritt angeschlossen werden.
        </p>
        <Link
          href="/auth"
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Zurück zum Login
        </Link>
      </section>
    </main>
  );
}
