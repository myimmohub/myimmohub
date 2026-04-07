import Link from "next/link";

export default function BankingConnectPage() {
  return (
    <main className="px-4 py-10">
      <section className="mx-auto w-full max-w-2xl">

        {/* Header */}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          Konto verbinden
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Wähle aus, wie du deine Kontoumsätze importieren möchtest.
        </p>

        {/* Info-Banner */}
        <div className="mt-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800/50 dark:bg-blue-950/30">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="mt-0.5 h-4 w-4 shrink-0 text-blue-500 dark:text-blue-400"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.253a.25.25 0 0 1 .244.304l-.459 2.066A1.75 1.75 0 0 0 10.747 15H11a.75.75 0 0 0 0-1.5h-.253a.25.25 0 0 1-.244-.304l.459-2.066A1.75 1.75 0 0 0 9.253 9H9Z"
              clipRule="evenodd"
            />
          </svg>
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Alle importierten Daten werden automatisch kategorisiert und deiner Immobilie zugeordnet.
          </p>
        </div>

        {/* Karten */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">

          {/* CSV-Import — aktiv */}
          <Link
            href="/dashboard/banking/import"
            className="group flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
          >
            {/* Icon */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition group-hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:group-hover:bg-slate-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
                <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
              </svg>
            </div>

            {/* Text */}
            <div className="mt-4 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Konto manuell importieren
                </h2>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400">
                  Aktiv
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                CSV-Datei deiner Bank hochladen. Unterstützt alle deutschen Banken mit CAMT- oder MT940-Export.
              </p>
            </div>

            {/* CTA */}
            <div className="mt-4 flex items-center gap-1 text-sm font-medium text-slate-900 dark:text-slate-100">
              CSV importieren
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4 transition group-hover:translate-x-0.5">
                <path fillRule="evenodd" d="M2 8a.75.75 0 0 1 .75-.75h8.69L8.22 4.03a.75.75 0 0 1 1.06-1.06l4.5 4.5a.75.75 0 0 1 0 1.06l-4.5 4.5a.75.75 0 0 1-1.06-1.06l3.22-3.22H2.75A.75.75 0 0 1 2 8Z" clipRule="evenodd" />
              </svg>
            </div>
          </Link>

          {/* Automatisch verbinden — Coming Soon */}
          <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-5 opacity-60 dark:border-slate-800 dark:bg-slate-900/50">
            {/* Icon */}
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-200 text-slate-400 dark:bg-slate-800 dark:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                <path fillRule="evenodd" d="M10 1a4.5 4.5 0 0 0-4.5 4.5V9H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-.5V5.5A4.5 4.5 0 0 0 10 1Zm3 8V5.5a3 3 0 1 0-6 0V9h6Z" clipRule="evenodd" />
              </svg>
            </div>

            {/* Text */}
            <div className="mt-4 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400">
                  Konto automatisch verbinden
                </h2>
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  Coming Soon
                </span>
              </div>
              <p className="mt-1.5 text-sm text-slate-400 dark:text-slate-500">
                Wird in einer zukünftigen Version verfügbar sein. Konto per CSV importieren ist bereits möglich.
              </p>
            </div>

            {/* Placeholder CTA */}
            <div className="mt-4 text-sm font-medium text-slate-400 dark:text-slate-600">
              Bald verfügbar
            </div>
          </div>

        </div>
      </section>
    </main>
  );
}
