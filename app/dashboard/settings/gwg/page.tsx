"use client";

import { useCallback, useEffect, useState } from "react";
import { usePropertyId } from "../property-context";

type Nutzungsdauern = Record<string, number>;

type GwgSettings = {
  property_id: string;
  sofortabzug_grenze: number;
  sammelposten_grenze: number;
  nutzungsdauern: Nutzungsdauern;
  para_7b: boolean;
  denkmal: boolean;
  para_35a: boolean;
};

const DEFAULT_NUTZUNGSDAUERN: Record<string, { label: string; default: number }> = {
  einbaukueche: { label: "Einbauküche", default: 10 },
  bodenbelaege: { label: "Bodenbeläge", default: 15 },
  heizungsanlage: { label: "Heizungsanlage", default: 20 },
  moebel: { label: "Möbel", default: 13 },
  elektrogeraete: { label: "Elektrogeräte", default: 5 },
  badausstattung: { label: "Badausstattung", default: 20 },
};

export default function GwgPage() {
  const propertyId = usePropertyId();
  const [data, setData] = useState<GwgSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const res = await fetch(`/api/settings/gwg?property_id=${propertyId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    const res = await fetch("/api/settings/gwg", {
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

  return (
    <div className="space-y-6">
      {/* GWG Grenzen */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">GWG-Grenzen</h3>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Geringwertige Wirtschaftsgüter nach § 6 Abs. 2 EStG
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Sofortabzug bis (netto)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                value={data.sofortabzug_grenze}
                onChange={(e) => setData({ ...data, sofortabzug_grenze: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">&euro;</span>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Sammelposten bis (netto)
            </label>
            <div className="relative">
              <input
                type="number"
                min={0}
                value={data.sammelposten_grenze}
                onChange={(e) => setData({ ...data, sammelposten_grenze: parseFloat(e.target.value) || 0 })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">&euro;</span>
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-400">
          Hinweis: Standardwerte nach aktueller Rechtslage (2024). Sofortabzug: 800 &euro; netto, Sammelposten: 1.000 &euro; netto.
        </div>
      </section>

      {/* Nutzungsdauern */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-1 text-sm font-semibold text-slate-900 dark:text-slate-100">Nutzungsdauern (AfA-Tabelle)</h3>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Typische Nutzungsdauern für Einrichtungsgegenstände in Jahren
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(DEFAULT_NUTZUNGSDAUERN).map(([key, meta]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{meta.label}</label>
              <div className="relative">
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={data.nutzungsdauern[key] ?? meta.default}
                  onChange={(e) =>
                    setData({
                      ...data,
                      nutzungsdauern: { ...data.nutzungsdauern, [key]: parseInt(e.target.value) || meta.default },
                    })
                  }
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-12 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Jahre</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Sonderregeln */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Sonderregeln</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={data.para_7b}
              onChange={(e) => setData({ ...data, para_7b: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            <div>
              <span className="text-sm text-slate-700 dark:text-slate-300">Sonder-AfA nach § 7b EStG</span>
              <p className="text-xs text-slate-400">5 % zusätzlich in den ersten 4 Jahren (Neubau, Baukosten max. 5.200 &euro;/m&sup2;)</p>
            </div>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={data.denkmal}
              onChange={(e) => setData({ ...data, denkmal: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            <div>
              <span className="text-sm text-slate-700 dark:text-slate-300">Denkmalschutz-AfA (§ 7i EStG)</span>
              <p className="text-xs text-slate-400">9 % in den ersten 8 Jahren, dann 7 % für 4 Jahre</p>
            </div>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={data.para_35a}
              onChange={(e) => setData({ ...data, para_35a: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            <div>
              <span className="text-sm text-slate-700 dark:text-slate-300">Handwerkerleistungen (§ 35a EStG)</span>
              <p className="text-xs text-slate-400">20 % der Lohnkosten, max. 1.200 &euro;/Jahr direkt von der Steuerschuld</p>
            </div>
          </label>
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
