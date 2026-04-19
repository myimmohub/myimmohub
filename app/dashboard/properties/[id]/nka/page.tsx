"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function PropertyNkaPage() {
  const { id } = useParams<{ id: string }>();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-sm text-slate-500">
            <Link href={`/dashboard/properties/${id}/overview`} className="hover:text-slate-900">Steckbrief</Link> / Nebenkostenabrechnung
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">Nebenkostenabrechnung</h1>
          <p className="mt-1 text-sm text-slate-500">Über die globale NKA-Übersicht kannst du Perioden für dieses Objekt anlegen und verwalten.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <Link href="/dashboard/nka" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
              Zur NKA-Übersicht
            </Link>
            <Link href="/dashboard/nka/neu" className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700">
              Neue NKA-Periode
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
