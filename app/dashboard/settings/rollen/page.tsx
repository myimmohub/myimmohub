"use client";

export default function RollenPage() {
  return (
    <div className="space-y-6">
      {/* Info */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900 dark:bg-blue-950/30 sm:p-6">
        <div className="flex items-start gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-600 dark:text-blue-400" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
          </svg>
          <div>
            <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
              Rollenverwaltung (v1)
            </h3>
            <p className="mt-1 text-sm text-blue-700 dark:text-blue-300">
              In der aktuellen Version hat der Ersteller einer Immobilie automatisch die Rolle <strong>Admin</strong>.
              Admins haben vollständigen Zugriff auf alle Einstellungen und Daten.
            </p>
          </div>
        </div>
      </div>

      {/* Roles Overview */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Verfügbare Rollen</h3>
        <div className="space-y-3">
          {[
            {
              role: "Admin",
              desc: "Vollzugriff auf alle Einstellungen, Transaktionen, Dokumente und Kategorien.",
              active: true,
            },
            {
              role: "Buchhalter",
              desc: "Zugriff auf Transaktionen und Kategorien. Kann Einstellungen einsehen, aber nicht ändern.",
              active: false,
            },
            {
              role: "Betrachter",
              desc: "Nur-Lese-Zugriff auf alle Bereiche. Keine Änderungen möglich.",
              active: false,
            },
          ].map((r) => (
            <div
              key={r.role}
              className={`flex items-center justify-between rounded-lg border p-4 ${
                r.active
                  ? "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/20"
                  : "border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/30"
              }`}
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.role}</span>
                  {r.active && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">Aktiv</span>
                  )}
                  {!r.active && (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">Geplant</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{r.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Planned features */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Geplante Funktionen</h3>
        <ul className="space-y-2 text-sm text-slate-500 dark:text-slate-400">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
            Einladung weiterer Nutzer per E-Mail
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
            Rollenzuweisung pro Immobilie
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
            Steuerberater-Zugang (Nur-Lese) mit eigenem Login
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-slate-300 dark:bg-slate-600" />
            Audit-Log für alle Änderungen
          </li>
        </ul>
      </section>
    </div>
  );
}
