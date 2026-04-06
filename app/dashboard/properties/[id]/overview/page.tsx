"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { calculateAfA } from "@/lib/calculateAfA";
// supabase wird nur für den initialen Lesezugriff genutzt, Updates laufen über /api/properties/[id]

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
  created_at: string;
};

const TYPE_LABELS: Record<string, string> = {
  wohnung: "Eigentumswohnung",
  haus: "Haus",
  mehrfamilienhaus: "Mehrfamilienhaus",
  gewerbe: "Gewerbeimmobilie",
};

function formatEur(val: number | null) {
  if (val === null) return "—";
  return val.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("de-DE");
}

export default function PropertyOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [property, setProperty] = useState<Property | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit-Felder
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editType, setEditType] = useState("");
  const [editKaufpreis, setEditKaufpreis] = useState("");
  const [editKaufdatum, setEditKaufdatum] = useState("");
  const [editBaujahr, setEditBaujahr] = useState("");
  const [editWohnflaeche, setEditWohnflaeche] = useState("");
  const [editNebenkosten, setEditNebenkosten] = useState("");
  const [editAfaSatz, setEditAfaSatz] = useState("");

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .eq("id", id)
        .single();
      if (error || !data) {
        setError("Immobilie nicht gefunden.");
      } else {
        setProperty(data as Property);
        prefillEdit(data as Property);
      }
      setIsLoading(false);
    };
    void load();
  }, [id]);

  const prefillEdit = (p: Property) => {
    setEditName(p.name ?? "");
    setEditAddress(p.address ?? "");
    setEditType(p.type ?? "");
    setEditKaufpreis(p.kaufpreis?.toString() ?? "");
    setEditKaufdatum(p.kaufdatum ?? "");
    setEditBaujahr(p.baujahr?.toString() ?? "");
    setEditWohnflaeche(p.wohnflaeche?.toString() ?? "");
    setEditNebenkosten(p.kaufnebenkosten_geschaetzt?.toString() ?? "");
    setEditAfaSatz(p.afa_satz !== null ? (p.afa_satz * 100).toFixed(1) : "");
  };

  const handleSave = async () => {
    if (!property) return;
    setIsSaving(true);

    const kaufpreis = editKaufpreis ? Number(editKaufpreis) : null;
    const afaSatz = editAfaSatz ? Number(editAfaSatz) / 100 : null;
    const afaJahresbetrag = kaufpreis && afaSatz ? kaufpreis * afaSatz : null;

    const res = await fetch(`/api/properties/${property.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editName,
        address: editAddress,
        type: editType,
        kaufpreis,
        kaufdatum: editKaufdatum || null,
        baujahr: editBaujahr ? Number(editBaujahr) : null,
        wohnflaeche: editWohnflaeche ? Number(editWohnflaeche) : null,
        kaufnebenkosten_geschaetzt: editNebenkosten ? Number(editNebenkosten) : null,
        afa_satz: afaSatz,
        afa_jahresbetrag: afaJahresbetrag,
      }),
    });

    setIsSaving(false);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setSaveError(body.error ?? "Fehler beim Speichern.");
      return;
    }
    setSaveError(null);
    setProperty((await res.json()) as Property);
    setIsEditing(false);
  };

  const afaVorschlag = property?.baujahr && property?.kaufpreis
    ? calculateAfA(property.baujahr, property.kaufpreis)
    : null;

  if (isLoading) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-zinc-500">Lade Immobilie…</p>
      </main>
    );
  }

  if (error || !property) {
    return (
      <main className="flex min-h-[60vh] items-center justify-center">
        <p className="text-sm text-red-500">{error}</p>
      </main>
    );
  }

  return (
    <main className="px-4 py-10">
      <section className="mx-auto w-full max-w-3xl">

        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/dashboard" className="hover:text-zinc-900 dark:hover:text-zinc-100">Dashboard</Link>
          <span>/</span>
          <span className="text-zinc-900 dark:text-zinc-100">{property.name}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {property.name}
            </h1>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              {TYPE_LABELS[property.type] ?? property.type} · {property.address}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href={`/dashboard/properties/${property.id}`}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Dokumente
            </Link>
            <button
              type="button"
              onClick={() => { prefillEdit(property); setSaveError(null); setIsEditing((v) => !v); }}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {isEditing ? "Abbrechen" : "Bearbeiten"}
            </button>
          </div>
        </div>

        {/* Hinweis wenn noch kein Kaufvertrag vorhanden */}
        {!isEditing && !property.kaufpreis && !property.kaufdatum && !property.baujahr && (
          <div className="mt-6 rounded-xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center dark:border-zinc-700 dark:bg-zinc-900/40">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Noch keine Kaufvertragsdaten vorhanden
            </p>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Lade den Kaufvertrag hoch — die KI extrahiert die Daten automatisch.
            </p>
            <Link
              href={`/dashboard/properties/${property.id}`}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              Kaufvertrag hochladen
            </Link>
          </div>
        )}

        {isEditing ? (
          /* ── Bearbeitungsmodus ── */
          <div className="mt-6 space-y-6">
            <Card title="Allgemein">
              <FormRow label="Name">
                <Input value={editName} onChange={setEditName} />
              </FormRow>
              <FormRow label="Adresse">
                <Input value={editAddress} onChange={setEditAddress} />
              </FormRow>
              <FormRow label="Typ">
                <select
                  value={editType}
                  onChange={(e) => setEditType(e.target.value)}
                  className={inputCls}
                >
                  {Object.entries(TYPE_LABELS).map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </FormRow>
            </Card>

            <Card title="Kaufvertrag">
              <FormRow label="Kaufpreis (€)">
                <Input value={editKaufpreis} onChange={setEditKaufpreis} type="number" />
              </FormRow>
              <FormRow label="Kaufdatum">
                <Input value={editKaufdatum} onChange={setEditKaufdatum} type="date" />
              </FormRow>
              <FormRow label="Baujahr">
                <Input value={editBaujahr} onChange={setEditBaujahr} type="number" />
              </FormRow>
              <FormRow label="Wohnfläche (m²)">
                <Input value={editWohnflaeche} onChange={setEditWohnflaeche} type="number" />
              </FormRow>
              <FormRow label="Kaufnebenkosten geschätzt (€)">
                <Input value={editNebenkosten} onChange={setEditNebenkosten} type="number" />
              </FormRow>
            </Card>

            <Card title="AfA">
              <FormRow label="AfA-Satz (%)">
                <Input value={editAfaSatz} onChange={setEditAfaSatz} type="number" placeholder="z. B. 2.0" />
              </FormRow>
              {editAfaSatz && editKaufpreis && (
                <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                  = {(Number(editKaufpreis) * Number(editAfaSatz) / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 })} € / Jahr
                </p>
              )}
            </Card>

            {saveError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {saveError}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {isSaving ? "Speichert…" : "Änderungen speichern"}
            </button>
          </div>
        ) : (
          /* ── Anzeigemodus ── */
          <div className="mt-6 space-y-6">
            <Card title="Kaufvertrag">
              <DataRow label="Kaufpreis" value={formatEur(property.kaufpreis)} highlight />
              <DataRow label="Kaufdatum" value={formatDate(property.kaufdatum)} />
              <DataRow label="Baujahr" value={property.baujahr?.toString() ?? "—"} />
              <DataRow label="Wohnfläche" value={property.wohnflaeche ? `${property.wohnflaeche} m²` : "—"} />
              <DataRow label="Kaufnebenkosten (geschätzt)" value={formatEur(property.kaufnebenkosten_geschaetzt)} />
            </Card>

            <Card title="AfA (Abschreibung)">
              <DataRow
                label="AfA-Satz"
                value={property.afa_satz !== null ? `${(property.afa_satz * 100).toFixed(1)} %` : "—"}
              />
              <DataRow label="Jahresbetrag" value={formatEur(property.afa_jahresbetrag)} highlight />
              {afaVorschlag && property.afa_satz === null && (
                <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                  KI-Vorschlag: {(afaVorschlag.satz * 100).toFixed(1)} % = {formatEur(afaVorschlag.jahresbetrag)} / Jahr
                </p>
              )}
            </Card>

            <Card title="Wirtschaftliche Kennzahlen">
              <DataRow
                label="Gesamtinvestition"
                value={property.kaufpreis && property.kaufnebenkosten_geschaetzt
                  ? formatEur(property.kaufpreis + property.kaufnebenkosten_geschaetzt)
                  : "—"}
                highlight
              />
              <DataRow
                label="Nebenkosten-Quote"
                value={property.kaufpreis && property.kaufnebenkosten_geschaetzt
                  ? `${((property.kaufnebenkosten_geschaetzt / property.kaufpreis) * 100).toFixed(1)} %`
                  : "—"}
              />
              <DataRow
                label="Preis / m²"
                value={property.kaufpreis && property.wohnflaeche
                  ? `${(property.kaufpreis / property.wohnflaeche).toLocaleString("de-DE", { maximumFractionDigits: 0 })} €/m²`
                  : "—"}
              />
            </Card>
          </div>
        )}
      </section>
    </main>
  );
}

/* ── Hilfs-Komponenten ── */

const inputCls = "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function DataRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-100 pb-3 last:border-0 last:pb-0 dark:border-zinc-800">
      <span className="text-sm text-zinc-400 dark:text-zinc-500">{label}</span>
      <span className={`text-sm ${highlight ? "font-semibold text-zinc-900 dark:text-zinc-100" : "text-zinc-700 dark:text-zinc-300"}`}>
        {value}
      </span>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">{label}</label>
      {children}
    </div>
  );
}

function Input({
  value, onChange, type = "text", placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}
