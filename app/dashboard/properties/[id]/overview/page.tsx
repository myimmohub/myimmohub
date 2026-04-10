"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { calculateAfA } from "@/lib/calculateAfA";
import { ProfitabilityCard } from "@/components/properties/ProfitabilityCard";
import type { ProfitabilityTransaction, PropertyInput } from "@/lib/calculations/profitability";

type Property = {
  id: string;
  name: string;
  address: string;
  type: string;
  kaufpreis: number | null;
  kaufdatum: string | null;
  baujahr: number | null;
  wohnflaeche: number | null;
  kaufnebenkosten_geschaetzt: number | null;
  afa_satz: number | null;
  afa_jahresbetrag: number | null;
  gebaeudewert: number | null;
  grundwert: number | null;
  inventarwert: number | null;
  kaufpreis_split_quelle: string | null;
};

type EditState = {
  name: string;
  address: string;
  type: string;
  kaufpreis: string;
  kaufdatum: string;
  baujahr: string;
  wohnflaeche: string;
  kaufnebenkosten_geschaetzt: string;
  afa_satz: string;
  gebaeudewert: string;
  grundwert: string;
  inventarwert: string;
};

const TYPE_LABELS: Record<string, string> = {
  wohnung: "Eigentumswohnung",
  haus: "Haus",
  mehrfamilienhaus: "Mehrfamilienhaus",
  gewerbe: "Gewerbeimmobilie",
  sonstiges: "Sonstiges",
};

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

export default function PropertyOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const [property, setProperty] = useState<Property | null>(null);
  const [transactions, setTransactions] = useState<ProfitabilityTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState>({
    name: "",
    address: "",
    type: "wohnung",
    kaufpreis: "",
    kaufdatum: "",
    baujahr: "",
    wohnflaeche: "",
    kaufnebenkosten_geschaetzt: "",
    afa_satz: "",
    gebaeudewert: "",
    grundwert: "",
    inventarwert: "",
  });

  useEffect(() => {
    const load = async () => {
      const [{ data, error: propertyError }, { data: txData }] = await Promise.all([
        supabase.from("properties").select("*").eq("id", id).single(),
        supabase.from("transactions").select("date, amount, category").eq("property_id", id).or("category.is.null,category.neq.aufgeteilt"),
      ]);

      if (propertyError || !data) {
        setError("Immobilie nicht gefunden.");
      } else {
        setProperty(data as Property);
        setEdit(prefillEdit(data as Property));
      }
      setTransactions((txData ?? []) as ProfitabilityTransaction[]);
      setIsLoading(false);
    };
    void load();
  }, [id]);

  const hasContractData = Boolean(property?.kaufpreis || property?.kaufdatum || property?.baujahr);
  const afaSuggestion = property?.baujahr && property?.kaufpreis ? calculateAfA(property.baujahr, property.kaufpreis) : null;

  const splitTotal = useMemo(() => {
    return Number(property?.gebaeudewert ?? 0) + Number(property?.grundwert ?? 0) + Number(property?.inventarwert ?? 0);
  }, [property]);

  const profitabilityProperty = useMemo<PropertyInput | null>(() => {
    if (!property) return null;
    return {
      kaufpreis: property.kaufpreis ?? 0,
      gebaeudewert: property.gebaeudewert,
      afa_satz: property.afa_satz != null ? property.afa_satz * 100 : 0,
      kaufdatum: property.kaufdatum,
    };
  }, [property]);

  const handleSave = async () => {
    if (!property) return;
    setIsSaving(true);
    setSaveError(null);

    const kaufpreis = edit.kaufpreis ? Number(edit.kaufpreis) : null;
    const afaSatz = edit.afa_satz ? Number(edit.afa_satz) / 100 : null;
    const gebaeudewert = edit.gebaeudewert ? Number(edit.gebaeudewert) : null;
    const grundwert = edit.grundwert ? Number(edit.grundwert) : null;
    const inventarwert = edit.inventarwert ? Number(edit.inventarwert) : null;
    const afaBasis = gebaeudewert ?? kaufpreis;
    const afaJahresbetrag = afaBasis && afaSatz ? afaBasis * afaSatz : null;

    const res = await fetch(`/api/properties/${property.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: edit.name,
        address: edit.address,
        type: edit.type,
        kaufpreis,
        kaufdatum: edit.kaufdatum || null,
        baujahr: edit.baujahr ? Number(edit.baujahr) : null,
        wohnflaeche: edit.wohnflaeche ? Number(edit.wohnflaeche) : null,
        kaufnebenkosten_geschaetzt: edit.kaufnebenkosten_geschaetzt ? Number(edit.kaufnebenkosten_geschaetzt) : null,
        afa_satz: afaSatz,
        afa_jahresbetrag: afaJahresbetrag,
        gebaeudewert,
        grundwert,
        inventarwert,
        kaufpreis_split_quelle: gebaeudewert || grundwert || inventarwert ? "manuell" : null,
      }),
    });

    setIsSaving(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setSaveError(body?.error ?? "Fehler beim Speichern.");
      return;
    }

    const updated = await res.json() as Property;
    setProperty(updated);
    setEdit(prefillEdit(updated));
    setIsEditing(false);
  };

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <section className="mx-auto w-full max-w-5xl space-y-4">
          <div className="h-8 w-56 animate-pulse rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-40 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-56 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </section>
      </main>
    );
  }

  if (!property || error) {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
        <section className="mx-auto w-full max-w-3xl">
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{error ?? "Immobilie nicht gefunden."}</div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-5xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{property.name}</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {TYPE_LABELS[property.type] ?? property.type} · {property.address}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/dashboard/properties/${property.id}`}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Dokumente
            </Link>
            {!isEditing ? (
              <button
                type="button"
                onClick={() => {
                  setEdit(prefillEdit(property));
                  setSaveError(null);
                  setIsEditing(true);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Bearbeiten
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEdit(prefillEdit(property));
                  setSaveError(null);
                  setIsEditing(false);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Abbrechen
              </button>
            )}
          </div>
        </div>

        {!hasContractData && !isEditing && (
          <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
              <DocumentIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
            </div>
            <div>
              <p className="font-medium text-slate-700 dark:text-slate-300">Noch keine Kaufvertragsdaten vorhanden</p>
              <p className="mt-1 text-sm text-slate-500">Lade den Kaufvertrag hoch, damit Kaufpreis, Baujahr und Aufteilung automatisch übernommen werden.</p>
            </div>
            <Link
              href={`/dashboard/properties/${property.id}`}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Kaufvertrag hochladen
            </Link>
          </div>
        )}

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card title="Kaufvertragsdaten">
            {!isEditing ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <DataRow label="Kaufpreis" value={formatEur(property.kaufpreis)} />
                <DataRow label="Kaufdatum" value={formatDate(property.kaufdatum)} />
                <DataRow label="Baujahr" value={property.baujahr ? String(property.baujahr) : "—"} />
                <DataRow label="Wohnfläche" value={property.wohnflaeche ? `${property.wohnflaeche} m²` : "—"} />
                <DataRow label="Nebenkosten" value={formatEur(property.kaufnebenkosten_geschaetzt)} />
                <DataRow label="AfA-Satz" value={property.afa_satz != null ? `${(property.afa_satz * 100).toFixed(1).replace(".", ",")} %` : "—"} />
              </div>
            ) : (
              <div className="space-y-4">
                <Field label="Name"><input className={inputClass} value={edit.name} onChange={(event) => setEdit((current) => ({ ...current, name: event.target.value }))} /></Field>
                <Field label="Adresse"><input className={inputClass} value={edit.address} onChange={(event) => setEdit((current) => ({ ...current, address: event.target.value }))} /></Field>
                <Field label="Typ">
                  <select className={inputClass} value={edit.type} onChange={(event) => setEdit((current) => ({ ...current, type: event.target.value }))}>
                    {Object.entries(TYPE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Kaufpreis"><input className={inputClass} value={edit.kaufpreis} onChange={(event) => setEdit((current) => ({ ...current, kaufpreis: event.target.value }))} /></Field>
                  <Field label="Kaufdatum"><input type="date" className={inputClass} value={edit.kaufdatum} onChange={(event) => setEdit((current) => ({ ...current, kaufdatum: event.target.value }))} /></Field>
                  <Field label="Baujahr"><input className={inputClass} value={edit.baujahr} onChange={(event) => setEdit((current) => ({ ...current, baujahr: event.target.value }))} /></Field>
                  <Field label="Wohnfläche"><input className={inputClass} value={edit.wohnflaeche} onChange={(event) => setEdit((current) => ({ ...current, wohnflaeche: event.target.value }))} /></Field>
                  <Field label="Nebenkosten"><input className={inputClass} value={edit.kaufnebenkosten_geschaetzt} onChange={(event) => setEdit((current) => ({ ...current, kaufnebenkosten_geschaetzt: event.target.value }))} /></Field>
                  <Field label="AfA-Satz (%)"><input className={inputClass} value={edit.afa_satz} onChange={(event) => setEdit((current) => ({ ...current, afa_satz: event.target.value }))} /></Field>
                </div>
              </div>
            )}
          </Card>

          <Card title="Kennzahlen">
            <div className="grid gap-3">
              <Kpi label="AfA Jahresbetrag" value={formatEur(property.afa_jahresbetrag)} />
              <Kpi label="Objekttyp" value={TYPE_LABELS[property.type] ?? property.type} />
              <Kpi label="Kaufpreisaufteilung" value={property.kaufpreis_split_quelle ? "Manuell" : "Nicht gesetzt"} />
              {afaSuggestion && property.afa_satz == null && (
                <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                  KI-Vorschlag: {(afaSuggestion.satz * 100).toFixed(1).replace(".", ",")} % · {formatEur(afaSuggestion.jahresbetrag)} / Jahr
                </div>
              )}
            </div>
          </Card>
        </section>

        {profitabilityProperty && (
          <ProfitabilityCard property={profitabilityProperty} transactions={transactions} />
        )}

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card title="Kaufpreisaufteilung">
            {!isEditing ? (
              <div className="space-y-5">
                <div className="h-6 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  {[
                    { label: "Gebäude", value: property.gebaeudewert, color: "bg-blue-600" },
                    { label: "Grund", value: property.grundwert, color: "bg-slate-400" },
                    { label: "Inventar", value: property.inventarwert, color: "bg-emerald-500" },
                  ].map((item) => {
                    const width = property.kaufpreis && item.value ? `${(item.value / property.kaufpreis) * 100}%` : "0%";
                    return (
                      <div
                        key={item.label}
                        title={`${item.label}: ${formatEur(item.value)} · ${property.kaufpreis && item.value ? ((item.value / property.kaufpreis) * 100).toFixed(1).replace(".", ",") : "0,0"} %`}
                        className={`h-full ${item.color} float-left`}
                        style={{ width }}
                      />
                    );
                  })}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <DataRow label="Gebäude" value={formatEur(property.gebaeudewert)} />
                  <DataRow label="Grundstück" value={formatEur(property.grundwert)} />
                  <DataRow label="Inventar" value={formatEur(property.inventarwert)} />
                </div>
                {property.kaufpreis != null && splitTotal > 0 && (
                  <p className={`text-xs ${Math.abs(splitTotal - property.kaufpreis) < 1 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    Summe der Aufteilung: {formatEur(splitTotal)}
                  </p>
                )}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Gebäude"><input className={inputClass} value={edit.gebaeudewert} onChange={(event) => setEdit((current) => ({ ...current, gebaeudewert: event.target.value }))} /></Field>
                <Field label="Grundstück"><input className={inputClass} value={edit.grundwert} onChange={(event) => setEdit((current) => ({ ...current, grundwert: event.target.value }))} /></Field>
                <Field label="Inventar"><input className={inputClass} value={edit.inventarwert} onChange={(event) => setEdit((current) => ({ ...current, inventarwert: event.target.value }))} /></Field>
              </div>
            )}
          </Card>

          <Card title="Aktionen">
            <div className="space-y-3">
              <Link href={`/dashboard/properties/${property.id}`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Dokumente öffnen
              </Link>
              <Link href={`/dashboard/properties/${property.id}/tax`} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                Steuerdaten öffnen
              </Link>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {isSaving ? "Speichert..." : "Änderungen speichern"}
                </button>
              )}
              {saveError && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{saveError}</div>}
            </div>
          </Card>
        </section>
      </section>
    </main>
  );
}

function prefillEdit(property: Property): EditState {
  return {
    name: property.name ?? "",
    address: property.address ?? "",
    type: property.type ?? "wohnung",
    kaufpreis: property.kaufpreis?.toString() ?? "",
    kaufdatum: property.kaufdatum ?? "",
    baujahr: property.baujahr?.toString() ?? "",
    wohnflaeche: property.wohnflaeche?.toString() ?? "",
    kaufnebenkosten_geschaetzt: property.kaufnebenkosten_geschaetzt?.toString() ?? "",
    afa_satz: property.afa_satz != null ? (property.afa_satz * 100).toFixed(1) : "",
    gebaeudewert: property.gebaeudewert?.toString() ?? "",
    grundwert: property.grundwert?.toString() ?? "",
    inventarwert: property.inventarwert?.toString() ?? "",
  };
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{title}</p>
      <div className="mt-4">{children}</div>
    </div>
  );
}

function DataRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/50">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {children}
    </div>
  );
}

function formatEur(value: number | null) {
  if (value == null) return "—";
  return value.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE");
}

function DocumentIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm3 5a1 1 0 000 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}
