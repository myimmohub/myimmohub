"use client";

import { useCallback, useEffect, useState } from "react";
import { usePropertyId } from "../layout";

type TaxSettings = {
  property_id: string;
  objekttyp: string;
  eigennutzung_tage: number;
  gesamt_tage: number;
  kleinunternehmer: boolean;
  option_ust: boolean;
  ak_gebaeude: number | null;
  baujahr: number | null;
  afa_satz: string;
};

export default function SteuerPage() {
  const propertyId = usePropertyId();
  const [data, setData] = useState<TaxSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const res = await fetch(`/api/settings/tax?property_id=${propertyId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    const res = await fetch("/api/settings/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  if (!propertyId) {
    return <p className="py-8 text-center text-sm text-slate-400">Bitte zuerst eine Immobilie anlegen.</p>;
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const update = (key: keyof TaxSettings, value: unknown) =>
    setData({ ...data, [key]: value });

  return (
    <div className="space-y-6">
      {/* Objekttyp */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Objekttyp & Nutzung</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Objekttyp</label>
            <select
              value={data.objekttyp}
              onChange={(e) => update("objekttyp", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="dauervermietung">Dauervermietung</option>
              <option value="kurzzeit">Kurzzeitvermietung</option>
              <option value="gewerbe">Gewerbevermietung</option>
              <option value="gemischt">Gemischt</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Eigennutzung (Tage/Jahr)
            </label>
            <input
              type="number"
              min={0}
              max={365}
              value={data.eigennutzung_tage}
              onChange={(e) => update("eigennutzung_tage", parseInt(e.target.value) || 0)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Gesamttage im Jahr
            </label>
            <input
              type="number"
              min={1}
              max={366}
              value={data.gesamt_tage}
              onChange={(e) => update("gesamt_tage", parseInt(e.target.value) || 365)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </section>

      {/* Umsatzsteuer */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Umsatzsteuer</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={data.kleinunternehmer}
              onChange={(e) => update("kleinunternehmer", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Kleinunternehmerregelung (§ 19 UStG)
            </span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={data.option_ust}
              onChange={(e) => update("option_ust", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">
              Option zur Umsatzsteuer (§ 9 UStG)
            </span>
          </label>
        </div>
      </section>

      {/* AfA */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Abschreibung (AfA)</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Anschaffungskosten Gebäude
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                value={data.ak_gebaeude ?? ""}
                onChange={(e) => update("ak_gebaeude", e.target.value ? parseFloat(e.target.value) : null)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="0,00"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">&euro;</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Baujahr</label>
            <input
              type="number"
              min={1800}
              max={2030}
              value={data.baujahr ?? ""}
              onChange={(e) => update("baujahr", e.target.value ? parseInt(e.target.value) : null)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="z.B. 1995"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">AfA-Satz</label>
            <select
              value={data.afa_satz}
              onChange={(e) => update("afa_satz", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            >
              <option value="2">2 % (§ 7 Abs. 4 Nr. 2a EStG – ab 1925)</option>
              <option value="2.5">2,5 % (§ 7 Abs. 4 Nr. 2b EStG – vor 1925)</option>
              <option value="3">3 % (§ 7 Abs. 4 Nr. 1 EStG – ab 2023)</option>
              <option value="sonder">Sonder-AfA (§ 7b EStG)</option>
            </select>
          </div>
          {data.ak_gebaeude && data.afa_satz !== "sonder" && (
            <div className="flex items-end">
              <div className="rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-950/30">
                <p className="text-xs text-blue-600 dark:text-blue-400">Jährliche AfA</p>
                <p className="text-lg font-semibold text-blue-700 dark:text-blue-300">
                  {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
                    data.ak_gebaeude * (parseFloat(data.afa_satz) / 100)
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Save */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Speichern..." : "Einstellungen speichern"}
        </button>
        {saved && (
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Gespeichert!
          </span>
        )}
      </div>
    </div>
  );
}
