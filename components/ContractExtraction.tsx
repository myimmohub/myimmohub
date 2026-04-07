"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { ContractData } from "@/lib/ai/extractContract";
import { calculateAfA } from "@/lib/calculateAfA";

type Field = {
  key: keyof ContractData;
  label: string;
  type: "number" | "text";
  unit?: string;
};

const FIELDS: Field[] = [
  { key: "kaufpreis", label: "Kaufpreis", type: "number", unit: "€" },
  { key: "kaufdatum", label: "Kaufdatum", type: "text" },
  { key: "adresse", label: "Adresse", type: "text" },
  { key: "baujahr", label: "Baujahr", type: "number" },
  { key: "wohnflaeche", label: "Wohnfläche", type: "number", unit: "m²" },
  { key: "kaufnebenkosten_geschaetzt", label: "Kaufnebenkosten (geschätzt)", type: "number", unit: "€" },
];

/** Kaufpreisaufteilung — nur anzeigen wenn mindestens ein Wert extrahiert wurde */
const SPLIT_FIELDS: Field[] = [
  { key: "gebaeudewert",  label: "Gebäudeanteil (AfA-Basis)",        type: "number", unit: "€" },
  { key: "grundwert",     label: "Grundstücksanteil (nicht absetzbar)", type: "number", unit: "€" },
  { key: "inventarwert",  label: "Inventarwert (GWG)",                type: "number", unit: "€" },
];

type Props = {
  propertyId: string;
  data: ContractData;
};

export default function ContractExtraction({ propertyId, data }: Props) {
  const router = useRouter();
  const [values, setValues] = useState<Record<keyof ContractData, string>>({
    kaufpreis: data.kaufpreis?.toString() ?? "",
    kaufdatum: data.kaufdatum ?? "",
    adresse: data.adresse ?? "",
    baujahr: data.baujahr?.toString() ?? "",
    wohnflaeche: data.wohnflaeche?.toString() ?? "",
    kaufnebenkosten_geschaetzt: data.kaufnebenkosten_geschaetzt?.toString() ?? "",
    gebaeudewert: data.gebaeudewert?.toString() ?? "",
    grundwert: data.grundwert?.toString() ?? "",
    inventarwert: data.inventarwert?.toString() ?? "",
  });

  const [confirmed, setConfirmed] = useState<Record<keyof ContractData, boolean>>({
    kaufpreis: false,
    kaufdatum: false,
    adresse: false,
    baujahr: false,
    wohnflaeche: false,
    kaufnebenkosten_geschaetzt: false,
    gebaeudewert: false,
    grundwert: false,
    inventarwert: false,
  });

  // AfA — leer bedeutet: Vorschlag aus calculateAfA verwenden
  const [afaSatzOverride, setAfaSatzOverride] = useState<string>("");

  const afaVorschlag = useMemo(() => {
    const baujahr = Number(values.baujahr);
    const kaufpreis = Number(values.kaufpreis);
    if (!baujahr || !kaufpreis) return null;
    return calculateAfA(baujahr, kaufpreis);
  }, [values.baujahr, values.kaufpreis]);

  const afaSatzAnzeige = afaSatzOverride !== "" ? afaSatzOverride : (afaVorschlag ? (afaVorschlag.satz * 100).toFixed(1) : "");
  const afaJahresbetrag = useMemo(() => {
    const satz = Number(afaSatzAnzeige) / 100;
    // AfA-Basis: Gebäudewert wenn angegeben, sonst Kaufpreis
    const afaBasis = Number(values.gebaeudewert) || Number(values.kaufpreis);
    if (!satz || !afaBasis) return null;
    return afaBasis * satz;
  }, [afaSatzAnzeige, values.kaufpreis, values.gebaeudewert]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const allConfirmed = FIELDS.every((f) => confirmed[f.key]);

  const toggleConfirm = (key: keyof ContractData) => {
    setConfirmed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const confirmAll = () => {
    const all = Object.fromEntries(FIELDS.map((f) => [f.key, true])) as Record<keyof ContractData, boolean>;
    setConfirmed(all);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError(null);
    setSavedSuccess(false);

    const res = await fetch(`/api/properties/${propertyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kaufpreis: values.kaufpreis ? Number(values.kaufpreis) : null,
        kaufdatum: values.kaufdatum || null,
        address: values.adresse || null,
        baujahr: values.baujahr ? Number(values.baujahr) : null,
        wohnflaeche: values.wohnflaeche ? Number(values.wohnflaeche) : null,
        kaufnebenkosten_geschaetzt: values.kaufnebenkosten_geschaetzt
          ? Number(values.kaufnebenkosten_geschaetzt)
          : null,
        afa_satz: afaSatzAnzeige ? Number(afaSatzAnzeige) / 100 : null,
        afa_jahresbetrag: afaJahresbetrag,
        // Kaufpreisaufteilung (§ 7 EStG) — nur wenn vom KI extrahiert
        gebaeudewert:  values.gebaeudewert  ? Number(values.gebaeudewert)  : null,
        grundwert:     values.grundwert     ? Number(values.grundwert)     : null,
        inventarwert:  values.inventarwert  ? Number(values.inventarwert)  : null,
        kaufpreis_split_quelle: (values.gebaeudewert || values.grundwert || values.inventarwert)
          ? "ki_extraktion"
          : null,
      }),
    });

    setIsSaving(false);

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setSaveError(body.error ?? "Fehler beim Speichern.");
      return;
    }

    setSavedSuccess(true);
    setTimeout(() => {
      router.push(`/dashboard/properties/${propertyId}/overview`);
    }, 800);
  };

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Extrahierte Vertragsdaten</p>

      <div className="space-y-3">
        {FIELDS.map((field) => (
          <div key={field.key} className="flex items-center gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                {field.label}
                {field.unit ? ` (${field.unit})` : ""}
              </label>
              <input
                type="text"
                inputMode={field.type === "number" ? "decimal" : "text"}
                value={values[field.key]}
                onChange={(e) => {
                  setValues((prev) => ({ ...prev, [field.key]: e.target.value }));
                  setConfirmed((prev) => ({ ...prev, [field.key]: false }));
                  // AfA-Override zurücksetzen wenn Baujahr/Kaufpreis geändert wird
                  if (field.key === "baujahr" || field.key === "kaufpreis") {
                    setAfaSatzOverride("");
                  }
                }}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800"
              />
            </div>

            <button
              type="button"
              onClick={() => toggleConfirm(field.key)}
              title={confirmed[field.key] ? "Bestätigung aufheben" : "Bestätigen"}
              className={`mt-5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition ${
                confirmed[field.key]
                  ? "border-emerald-500 bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                  : "border-slate-300 bg-white text-slate-400 hover:border-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:hover:border-slate-500"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {/* Kaufpreisaufteilung — nur anzeigen wenn KI mindestens einen Wert gefunden hat */}
      {(data.gebaeudewert || data.grundwert || data.inventarwert) && (
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 dark:border-blue-900/40 dark:bg-blue-950/20">
          <p className="mb-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
            Kaufpreisaufteilung erkannt (§ 7 EStG)
          </p>
          <p className="mb-3 text-xs text-blue-600 dark:text-blue-500">
            Die KI hat eine Kaufpreisaufteilung im Vertrag gefunden. Nur der Gebäudeanteil ist AfA-fähig.
          </p>
          <div className="space-y-3">
            {SPLIT_FIELDS.map((field) => (
              <div key={field.key} className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                    {field.label}
                    {field.unit ? ` (${field.unit})` : ""}
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={values[field.key]}
                    onChange={(e) => {
                      setValues((prev) => ({ ...prev, [field.key]: e.target.value }));
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AfA-Berechnung */}
      {afaVorschlag || afaSatzAnzeige ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
          <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            AfA-Berechnung
            {afaVorschlag && afaSatzOverride === "" ? (
              <span className="ml-2 rounded bg-slate-200 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                KI-Vorschlag
              </span>
            ) : null}
          </p>
          <div className="flex items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">AfA-Satz (%)</label>
              <input
                type="text"
                inputMode="decimal"
                value={afaSatzAnzeige}
                onChange={(e) => setAfaSatzOverride(e.target.value)}
                className="w-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:focus:border-slate-500 dark:focus:ring-slate-800"
              />
            </div>
            {afaJahresbetrag !== null ? (
              <p className="pb-2 text-sm text-slate-700 dark:text-slate-300">
                = <span className="font-medium">{afaJahresbetrag.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €</span> / Jahr
              </p>
            ) : null}
            {afaSatzOverride !== "" && afaVorschlag ? (
              <button
                type="button"
                onClick={() => setAfaSatzOverride("")}
                className="pb-2 text-xs text-slate-500 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Zurücksetzen
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-2">
        {!allConfirmed && (
          <button
            type="button"
            onClick={confirmAll}
            className="text-sm font-medium text-slate-600 underline underline-offset-4 transition hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            Alle bestätigen
          </button>
        )}

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!allConfirmed || isSaving}
          className="inline-flex items-center justify-center rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {isSaving ? "Speichern..." : "In Immobilie speichern"}
        </button>
      </div>

      {saveError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {saveError}
        </p>
      )}

      {savedSuccess && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          Daten erfolgreich gespeichert.
        </p>
      )}
    </div>
  );
}
