"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export default function AccountSettingsPage() {
  const [email, setEmail] = useState("—");

  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) setEmail(user.email);
    };
    void loadUser();
  }, []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
      <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Konto</p>
        <div className="mt-4 space-y-4">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
            <p className="text-xs font-medium uppercase tracking-wider text-slate-400">E-Mail-Adresse</p>
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{email}</p>
          </div>
          <Link
            href="/auth/reset"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Passwort ändern
          </Link>
        </div>
      </div>

      <div className="rounded-xl border border-red-200 bg-white p-5 dark:border-red-900 dark:bg-slate-900">
        <p className="text-xs font-medium uppercase tracking-wider text-red-600 dark:text-red-400">Danger Zone</p>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">Das Löschen des Accounts entfernt deinen Zugang. Diese Aktion sollte später zusätzlich abgesichert werden.</p>
          <button
            type="button"
            disabled
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 opacity-60 dark:border-red-800 dark:text-red-400"
          >
            Account löschen
          </button>
        </div>
      </div>
    </div>
  );
}
