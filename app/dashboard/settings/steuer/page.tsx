"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { usePropertyId } from "../property-context";

type TaxSettings = {
  property_id: string;
  objekttyp: string;
  eigennutzung_tage: number;
  gesamt_tage: number;
  rental_share_override_pct?: number | null;
  kleinunternehmer: boolean;
  option_ust: boolean;
};

type PropertyAfa = {
  id: string;
  name: string;
  gebaeudewert: number | null;
  kaufpreis: number | null;
  baujahr: number | null;
  afa_satz: number | null;
  afa_jahresbetrag: number | null;
};

const fmtEur = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(n);

export default function SteuerPage() {
  const propertyId = usePropertyId();
  const [data, setData] = useState<TaxSettings | null>(null);
  const [propAfa, setPropAfa] = useState<PropertyAfa | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const [res, { data: prop }] = await Promise.all([
      fetch(`/api/settings/tax?property_id=${propertyId}`),
      supabase
        .from("properties")
        .select("id, name, gebaeudewert, kaufpreis, baujahr, afa_satz, afa_jahresbetrag")
        .eq("id", propertyId)
        .single(),
    ]);
    if (res.ok) setData(await res.json());
    if (prop) setPropAfa(prop as PropertyAfa);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    void Promise.resolve().then(loadData);
  }, [loadData]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    setSaveError(null);
    const res = await fetch("/api/settings/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (res.ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } else {
      const result = await res.json().catch(() => null) as { error?: string } | null;
      setSaveError(result?.error ?? "Speichern fehlgeschlagen.");
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

  const autoRentalShare = Math.max(0, Math.min(1, 1 - data.eigennutzung_tage / Math.max(1, data.gesamt_tage)));

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
              <option value="ferienwohnung_teil">Ferienwohnung mit Eigennutzung</option>
              <option value="ferienwohnung_voll">Ferienwohnung ohne Eigennutzung</option>
              <option value="gewerbe">Gewerbevermietung</option>
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
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
              Vermietungsanteil FE/FB (optional)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={data.rental_share_override_pct != null ? (data.rental_share_override_pct * 100).toString() : ""}
              onChange={(e) => {
                const raw = e.target.value.trim();
                update("rental_share_override_pct", raw === "" ? null : (parseFloat(raw.replace(",", ".")) / 100));
              }}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder={`${(autoRentalShare * 100).toFixed(2).replace(".", ",")}`}
            />
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              Leer lassen für Automatik aus Eigennutzung: {(autoRentalShare * 100).toFixed(2).replace(".", ",")} %
            </p>
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

      {/* AfA — Read-only aus Steckbrief */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Abschreibung (AfA)</h3>
          {propertyId && (
            <Link
              href={`/dashboard/properties/${propertyId}/overview`}
              className="text-xs text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              Im Steckbrief bearbeiten →
            </Link>
          )}
        </div>
        {propAfa && (propAfa.gebaeudewert ?? propAfa.kaufpreis) ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">AfA-Basis (Gebäudeanteil)</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {fmtEur(propAfa.gebaeudewert ?? propAfa.kaufpreis ?? 0)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">AfA-Satz</p>
              <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {propAfa.afa_satz != null
                  ? `${(propAfa.afa_satz * 100).toFixed(1).replace(".", ",")} %`
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 px-4 py-3 dark:bg-blue-950/30">
              <p className="text-xs text-blue-600 dark:text-blue-400">Jährliche AfA</p>
              <p className="mt-1 text-sm font-semibold text-blue-700 dark:text-blue-300">
                {propAfa.afa_jahresbetrag != null
                  ? fmtEur(propAfa.afa_jahresbetrag)
                  : propAfa.afa_satz != null && (propAfa.gebaeudewert ?? propAfa.kaufpreis)
                  ? fmtEur((propAfa.gebaeudewert ?? propAfa.kaufpreis ?? 0) * propAfa.afa_satz)
                  : "—"}
              </p>
            </div>
            {propAfa.baujahr && (
              <div className="rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">Baujahr</p>
                <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">{propAfa.baujahr}</p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 p-4 dark:border-slate-700">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Noch keine AfA-Daten hinterlegt.{" "}
              {propertyId && (
                <Link href={`/dashboard/properties/${propertyId}/overview`} className="text-blue-600 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400">
                  Jetzt im Steckbrief eintragen →
                </Link>
              )}
            </p>
          </div>
        )}
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
        {saveError && (
          <span className="text-sm font-medium text-red-600 dark:text-red-400">
            {saveError}
          </span>
        )}
      </div>
    </div>
  );
}
