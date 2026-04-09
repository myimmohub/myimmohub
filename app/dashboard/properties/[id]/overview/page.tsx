"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { calculateAfA } from "@/lib/calculateAfA";
import { ProfitabilityCard } from "@/components/properties/ProfitabilityCard";
import type { ProfitabilityTransaction } from "@/lib/calculations/profitability";
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
  gebaeudewert: number | null;
  grundwert: number | null;
  inventarwert: number | null;
  kaufpreis_split_quelle: string | null;
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
  const [transactions, setTransactions] = useState<ProfitabilityTransaction[]>([]);

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
  // Kaufpreisaufteilung
  const [editGebaeudewert, setEditGebaeudewert] = useState("");
  const [editGrundwert, setEditGrundwert]       = useState("");
  const [editInventarwert, setEditInventarwert] = useState("");
  const [grundwertManual, setGrundwertManual]   = useState(false); // true wenn Grundwert manuell geändert

  useEffect(() => {
    const load = async () => {
      const [{ data, error }, { data: txData }] = await Promise.all([
        supabase.from("properties").select("*").eq("id", id).single(),
        supabase
          .from("transactions")
          .select("date, amount, category")
          .eq("property_id", id)
          .or("category.is.null,category.neq.aufgeteilt"),
      ]);
      if (error || !data) {
        setError("Immobilie nicht gefunden.");
      } else {
        setProperty(data as Property);
        prefillEdit(data as Property);
      }
      setTransactions((txData ?? []) as ProfitabilityTransaction[]);
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
    setEditGebaeudewert(p.gebaeudewert?.toString() ?? "");
    setEditGrundwert(p.grundwert?.toString() ?? "");
    setEditInventarwert(p.inventarwert?.toString() ?? "");
    setGrundwertManual(false);
  };

  // Auto-Berechnung: Grundwert = Kaufpreis - Gebäudewert - Inventar
  useEffect(() => {
    if (grundwertManual) return;
    const kp = Number(editKaufpreis);
    if (kp > 0 && editGebaeudewert) {
      const rest = kp - Number(editGebaeudewert) - Number(editInventarwert || 0);
      if (rest >= 0) {
        setEditGrundwert(String(Math.round(rest)));
      }
    }
  }, [editKaufpreis, editGebaeudewert, editInventarwert, grundwertManual]);

  const handleSave = async () => {
    if (!property) return;
    setIsSaving(true);

    const kaufpreis      = editKaufpreis  ? Number(editKaufpreis)  : null;
    const afaSatz        = editAfaSatz    ? Number(editAfaSatz) / 100 : null;
    const gebaeudewert   = editGebaeudewert  ? Number(editGebaeudewert)  : null;
    const grundwert      = editGrundwert     ? Number(editGrundwert)     : null;
    const inventarwert   = editInventarwert  ? Number(editInventarwert)  : null;
    // AfA-Jahresbetrag basiert auf dem Gebäudewert (nicht Gesamtkaufpreis)
    const afaBasis       = gebaeudewert ?? kaufpreis;
    const afaJahresbetrag = afaBasis && afaSatz ? afaBasis * afaSatz : null;

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
        gebaeudewert,
        grundwert,
        inventarwert,
        kaufpreis_split_quelle: (gebaeudewert || grundwert || inventarwert) ? "manuell" : null,
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
        <p className="text-sm text-slate-500">Lade Immobilie…</p>
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
        <nav className="mb-6 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href="/dashboard" className="hover:text-slate-900 dark:hover:text-slate-100">Dashboard</Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-100">{property.name}</span>
        </nav>

        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              {property.name}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {TYPE_LABELS[property.type] ?? property.type} · {property.address}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Link
              href={`/dashboard/properties/${property.id}`}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Dokumente
            </Link>
            <button
              type="button"
              onClick={() => { prefillEdit(property); setSaveError(null); setIsEditing((v) => !v); }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              {isEditing ? "Abbrechen" : "Bearbeiten"}
            </button>
          </div>
        </div>

        {/* Hinweis wenn noch kein Kaufvertrag vorhanden */}
        {!isEditing && !property.kaufpreis && !property.kaufdatum && !property.baujahr && (
          <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Noch keine Kaufvertragsdaten vorhanden
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Lade den Kaufvertrag hoch — die KI extrahiert die Daten automatisch.
            </p>
            <Link
              href={`/dashboard/properties/${property.id}`}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
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
              {editAfaSatz && (editGebaeudewert || editKaufpreis) && (
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  AfA-Basis:{" "}
                  {editGebaeudewert
                    ? `${Number(editGebaeudewert).toLocaleString("de-DE")} € (Gebäudeanteil)`
                    : `${Number(editKaufpreis).toLocaleString("de-DE")} € (Gesamtkaufpreis)`}
                  {" "}→{" "}
                  {((Number(editGebaeudewert || editKaufpreis)) * Number(editAfaSatz) / 100).toLocaleString("de-DE", { maximumFractionDigits: 0 })} € / Jahr
                </p>
              )}
            </Card>

            <Card title="Kaufpreisaufteilung (§ 7 EStG)">
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-4">
                Nur der Gebäudeanteil ist AfA-fähig (§ 7 Abs. 4 EStG). Grund und Boden ist nicht abschreibbar (§ 11d EStDV). Inventar kann separat als GWG abgesetzt werden (§ 6 Abs. 2 EStG).
              </p>
              <FormRow label="Gebäudeanteil (€) · AfA-Basis">
                <Input
                  value={editGebaeudewert}
                  onChange={(v) => { setEditGebaeudewert(v); setGrundwertManual(false); }}
                  type="number"
                  placeholder="z. B. 280000"
                />
              </FormRow>
              <FormRow label="Grundstücksanteil (€) · nicht abschreibbar">
                <Input
                  value={editGrundwert}
                  onChange={(v) => { setEditGrundwert(v); setGrundwertManual(true); }}
                  type="number"
                  placeholder="z. B. 60000"
                />
              </FormRow>
              <FormRow label="Inventarwert (€) · separat absetzbar">
                <Input
                  value={editInventarwert}
                  onChange={(v) => { setEditInventarwert(v); setGrundwertManual(false); }}
                  type="number"
                  placeholder="z. B. 10000"
                />
              </FormRow>
              {/* Summen-Validierung */}
              {editKaufpreis && (editGebaeudewert || editGrundwert || editInventarwert) && (() => {
                const kp   = Number(editKaufpreis);
                const sum  = Number(editGebaeudewert || 0) + Number(editGrundwert || 0) + Number(editInventarwert || 0);
                const diff = Math.abs(sum - kp);
                const ok   = diff < 1;
                return (
                  <p className={`mt-2 text-xs ${ok ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                    Summe: {sum.toLocaleString("de-DE", { maximumFractionDigits: 0 })} €
                    {ok
                      ? " ✓ entspricht dem Kaufpreis"
                      : ` · Differenz ${diff.toLocaleString("de-DE", { maximumFractionDigits: 0 })} € zum Kaufpreis`}
                  </p>
                );
              })()}
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
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
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
              {/* AfA-Basis-Hinweis */}
              {property.afa_jahresbetrag !== null && (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  Basis:{" "}
                  {property.gebaeudewert
                    ? `${formatEur(property.gebaeudewert)} Gebäudeanteil`
                    : property.kaufpreis
                    ? `${formatEur(property.kaufpreis)} Gesamtkaufpreis (kein Gebäudewert hinterlegt)`
                    : "—"}
                </p>
              )}
              {afaVorschlag && property.afa_satz === null && (
                <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                  KI-Vorschlag: {(afaVorschlag.satz * 100).toFixed(1)} % = {formatEur(afaVorschlag.jahresbetrag)} / Jahr
                </p>
              )}
            </Card>

            {/* ── Kaufpreisaufteilung ── */}
            <Card title="Kaufpreisaufteilung">
              {property.gebaeudewert || property.grundwert || property.inventarwert ? (
                <>
                  {/* Quellen-Badge */}
                  {property.kaufpreis_split_quelle && (
                    <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
                      Quelle:{" "}
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 font-medium dark:bg-slate-800">
                        {property.kaufpreis_split_quelle === "ki_extraktion"
                          ? "KI-Extraktion aus Kaufvertrag"
                          : property.kaufpreis_split_quelle === "bmf_schaetzung"
                          ? "BMF-Arbeitshilfe (Schätzung)"
                          : "Manuell eingegeben"}
                      </span>
                    </p>
                  )}
                  {/* Balken-Visualisierung */}
                  {property.kaufpreis && (
                    <div className="mb-4">
                      <div className="flex h-3 w-full overflow-hidden rounded-full">
                        {property.gebaeudewert ? (
                          <div
                            className="bg-blue-500"
                            style={{ width: `${(property.gebaeudewert / property.kaufpreis) * 100}%` }}
                            title={`Gebäude: ${formatEur(property.gebaeudewert)}`}
                          />
                        ) : null}
                        {property.grundwert ? (
                          <div
                            className="bg-amber-400"
                            style={{ width: `${(property.grundwert / property.kaufpreis) * 100}%` }}
                            title={`Grund: ${formatEur(property.grundwert)}`}
                          />
                        ) : null}
                        {property.inventarwert ? (
                          <div
                            className="bg-emerald-400"
                            style={{ width: `${(property.inventarwert / property.kaufpreis) * 100}%` }}
                            title={`Inventar: ${formatEur(property.inventarwert)}`}
                          />
                        ) : null}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                        {property.gebaeudewert ? (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-blue-500" />
                            Gebäude {((property.gebaeudewert / property.kaufpreis) * 100).toFixed(0)} %
                          </span>
                        ) : null}
                        {property.grundwert ? (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                            Grund {((property.grundwert / property.kaufpreis) * 100).toFixed(0)} %
                          </span>
                        ) : null}
                        {property.inventarwert ? (
                          <span className="flex items-center gap-1">
                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                            Inventar {((property.inventarwert / property.kaufpreis) * 100).toFixed(0)} %
                          </span>
                        ) : null}
                      </div>
                    </div>
                  )}
                  <DataRow
                    label="Gebäudeanteil · AfA-Basis"
                    value={formatEur(property.gebaeudewert)}
                    highlight
                  />
                  <DataRow
                    label="Grundstücksanteil · nicht abschreibbar"
                    value={formatEur(property.grundwert)}
                  />
                  <DataRow
                    label="Inventarwert · GWG-Abzug möglich"
                    value={formatEur(property.inventarwert)}
                  />
                </>
              ) : (
                <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center dark:border-slate-700">
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Keine Kaufpreisaufteilung hinterlegt
                  </p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    Ohne Aufteilung wird der Gesamtkaufpreis als AfA-Basis genutzt — steuerlich oft ungünstig.
                    Lade den Kaufvertrag hoch (KI extrahiert automatisch) oder trage die Werte manuell ein.
                  </p>
                </div>
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

            <ProfitabilityCard
              transactions={transactions}
              property={{
                kaufpreis:    property.kaufpreis ?? 0,
                gebaeudewert: property.gebaeudewert ?? null,
                afa_satz:     (property.afa_satz ?? 0) * 100,
                kaufdatum:    property.kaufdatum ?? null,
              }}
            />
          </div>
        )}
      </section>
    </main>
  );
}

/* ── Hilfs-Komponenten ── */

const inputCls = "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function DataRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 pb-3 last:border-0 last:pb-0 dark:border-slate-800">
      <span className="text-sm text-slate-400 dark:text-slate-500">{label}</span>
      <span className={`text-sm ${highlight ? "font-semibold text-slate-900 dark:text-slate-100" : "text-slate-700 dark:text-slate-300"}`}>
        {value}
      </span>
    </div>
  );
}

function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
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
