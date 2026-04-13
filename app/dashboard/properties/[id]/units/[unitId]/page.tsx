"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

type UnitType = "residential" | "commercial" | "parking" | "other";
type TenantStatus = "active" | "notice_given" | "ended";
type RentType = "fixed" | "index" | "stepped";
type AddMode = "pdf" | "manual" | null;

interface Unit {
  id: string;
  label: string;
  unit_type: UnitType;
  floor?: string | null;
  area_sqm?: number | null;
  rooms?: number | null;
  vat_liable: boolean;
}

interface Tenant {
  id: string;
  unit_id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  phone?: string | null;
  lease_start: string;
  lease_end?: string | null;
  cold_rent_cents: number;
  additional_costs_cents: number;
  deposit_cents: number;
  rent_type: RentType;
  payment_reference?: string | null;
  status: TenantStatus;
}

interface ExtractedField {
  value: string;
  confidence: number;
}

interface LeaseExtractionResult {
  first_name?: ExtractedField;
  last_name?: ExtractedField;
  email?: ExtractedField;
  phone?: ExtractedField;
  lease_start?: ExtractedField;
  lease_end?: ExtractedField;
  cold_rent_cents?: ExtractedField;
  additional_costs_cents?: ExtractedField;
  deposit_cents?: ExtractedField;
}

const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  residential: "Wohnen",
  commercial: "Gewerbe",
  parking: "Stellplatz",
  other: "Sonstiges",
};

const UNIT_TYPE_ICONS: Record<UnitType, string> = {
  residential: "🏠",
  commercial: "🏪",
  parking: "🅿",
  other: "📦",
};

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.9)
    return <span className="text-green-600 dark:text-green-400" title="Hohe Konfidenz">●</span>;
  if (confidence >= 0.7)
    return <span className="text-yellow-500 dark:text-yellow-400" title="Mittlere Konfidenz">●</span>;
  return <span className="text-red-500 dark:text-red-400" title="Niedrige Konfidenz">●</span>;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

const emptyForm = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  lease_start: "",
  lease_end: "",
  cold_rent_eur: "",
  additional_costs_eur: "",
  deposit_eur: "",
  rent_type: "fixed" as RentType,
  payment_reference: "",
};

export default function UnitDetailPage() {
  const { id, unitId } = useParams<{ id: string; unitId: string }>();

  const [unit, setUnit] = useState<Unit | null>(null);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [pastTenants, setPastTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showAddTenant, setShowAddTenant] = useState(false);
  const [addMode, setAddMode] = useState<AddMode>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<LeaseExtractionResult | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [savedDocumentId, setSavedDocumentId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [unitId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [unitRes, tenantsRes] = await Promise.all([
        fetch(`/api/units/${unitId}`),
        fetch(`/api/tenants?unit_id=${unitId}`),
      ]);
      if (!unitRes.ok) throw new Error("Einheit nicht gefunden");
      const unitData = await unitRes.json();
      const tenantsData = tenantsRes.ok ? await tenantsRes.json() : [];
      setUnit(unitData);
      setActiveTenant(tenantsData.find((t: Tenant) => t.status === "active") ?? null);
      setPastTenants(
        tenantsData.filter(
          (t: Tenant) => t.status === "ended" || t.status === "notice_given"
        )
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handlePdfUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setExtracting(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("unit_id", unitId);
      const res = await fetch("/api/tenants/extract", { method: "POST", body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const data: LeaseExtractionResult & { document_id?: string } = await res.json();
      if (data.document_id) setSavedDocumentId(data.document_id);
      setExtractedData(data);
      setFormData({
        first_name: data.first_name?.value ?? "",
        last_name: data.last_name?.value ?? "",
        email: data.email?.value ?? "",
        phone: data.phone?.value ?? "",
        lease_start: data.lease_start?.value ?? "",
        lease_end: data.lease_end?.value ?? "",
        cold_rent_eur: data.cold_rent_cents
          ? String(parseFloat(data.cold_rent_cents.value) / 100)
          : "",
        additional_costs_eur: data.additional_costs_cents
          ? String(parseFloat(data.additional_costs_cents.value) / 100)
          : "",
        deposit_eur: data.deposit_cents
          ? String(parseFloat(data.deposit_cents.value) / 100)
          : "",
        rent_type: "fixed",
        payment_reference: "",
      });
      setReviewMode(true);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setExtracting(false);
    }
  }

  async function handleTenantSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          unit_id: unitId,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email || null,
          phone: formData.phone || null,
          lease_start: formData.lease_start,
          lease_end: formData.lease_end || null,
          cold_rent_cents: Math.round(parseFloat(formData.cold_rent_eur) * 100),
          additional_costs_cents: Math.round(
            parseFloat(formData.additional_costs_eur || "0") * 100
          ),
          deposit_cents: Math.round(parseFloat(formData.deposit_eur || "0") * 100),
          rent_type: formData.rent_type,
          payment_reference: formData.payment_reference || null,
          status: "active",
        }),
      });
      if (!res.ok) throw new Error("Fehler beim Speichern des Mieters");
      setShowAddTenant(false);
      setAddMode(null);
      setExtractedData(null);
      setReviewMode(false);
      setFormData(emptyForm);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(tenantId: string, newStatus: TenantStatus) {
    try {
      await fetch(`/api/tenants/${tenantId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      await loadData();
    } catch {
      alert("Statusänderung fehlgeschlagen");
    }
  }

  function closeAddTenant() {
    setShowAddTenant(false);
    setAddMode(null);
    setExtractedData(null);
    setReviewMode(false);
    setFormData(emptyForm);
    setSavedDocumentId(null);
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-32 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error || !unit) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error ?? "Einheit nicht gefunden"}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Unit header */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{UNIT_TYPE_ICONS[unit.unit_type]}</span>
              <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
                {unit.label}
              </h1>
            </div>
            <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
              <span>{UNIT_TYPE_LABELS[unit.unit_type]}</span>
              {unit.floor && <span>Etage: {unit.floor}</span>}
              {unit.area_sqm && <span>{unit.area_sqm} m²</span>}
              {unit.rooms && <span>{unit.rooms} Zimmer</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {unit.vat_liable && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                USt.-pflichtig
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Active tenant */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Aktueller Mieter
          </h2>
          {!activeTenant && (
            <button
              onClick={() => setShowAddTenant(true)}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Mieter hinzufügen
            </button>
          )}
        </div>

        {activeTenant ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              <div>
                <span className="text-slate-500 dark:text-slate-400">Name</span>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {activeTenant.first_name} {activeTenant.last_name}
                </div>
              </div>
              {activeTenant.email && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">E-Mail</span>
                  <div className="text-slate-900 dark:text-slate-100">{activeTenant.email}</div>
                </div>
              )}
              {activeTenant.phone && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Telefon</span>
                  <div className="text-slate-900 dark:text-slate-100">{activeTenant.phone}</div>
                </div>
              )}
              <div>
                <span className="text-slate-500 dark:text-slate-400">Mietbeginn</span>
                <div className="text-slate-900 dark:text-slate-100">
                  {formatDate(activeTenant.lease_start)}
                </div>
              </div>
              {activeTenant.lease_end && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Mietende</span>
                  <div className="text-slate-900 dark:text-slate-100">
                    {formatDate(activeTenant.lease_end)}
                  </div>
                </div>
              )}
              <div>
                <span className="text-slate-500 dark:text-slate-400">Kaltmiete</span>
                <div className="font-medium text-slate-900 dark:text-slate-100">
                  {formatEur(activeTenant.cold_rent_cents)}
                </div>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Nebenkosten</span>
                <div className="text-slate-900 dark:text-slate-100">
                  {formatEur(activeTenant.additional_costs_cents)}
                </div>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">Kaution</span>
                <div className="text-slate-900 dark:text-slate-100">
                  {formatEur(activeTenant.deposit_cents)}
                </div>
              </div>
              {activeTenant.payment_reference && (
                <div>
                  <span className="text-slate-500 dark:text-slate-400">Verwendungszweck</span>
                  <div className="font-mono text-xs text-slate-900 dark:text-slate-100">
                    {activeTenant.payment_reference}
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
              {activeTenant.status === "active" && (
                <button
                  onClick={() => handleStatusChange(activeTenant.id, "notice_given")}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Kündigung vermerken
                </button>
              )}
              {activeTenant.status === "notice_given" && (
                <button
                  onClick={() => handleStatusChange(activeTenant.id, "ended")}
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                >
                  Mietverhältnis beenden
                </button>
              )}
              <button
                onClick={() => setShowAddTenant(true)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                Mieter hinzufügen
              </button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Kein aktiver Mieter</p>
        )}
      </div>

      {/* Tenant history */}
      {pastTenants.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
            Mieterverlauf
          </h2>
          <div className="space-y-3">
            {pastTenants.map((tenant) => (
              <div
                key={tenant.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3 dark:border-slate-800"
              >
                <div>
                  <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {tenant.first_name} {tenant.last_name}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {formatDate(tenant.lease_start)}
                    {tenant.lease_end ? ` – ${formatDate(tenant.lease_end)}` : ""}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {formatEur(tenant.cold_rent_cents + tenant.additional_costs_cents)}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      tenant.status === "notice_given"
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                        : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {tenant.status === "notice_given" ? "Gekündigt" : "Beendet"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add tenant modal */}
      {showAddTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            {!addMode ? (
              <>
                <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  Mieter hinzufügen
                </h2>
                <p className="mb-6 text-sm text-slate-500 dark:text-slate-400">
                  Wie möchten Sie die Mieterdaten erfassen?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setAddMode("pdf")}
                    className="flex-1 rounded-xl border-2 border-slate-200 p-4 text-left transition hover:border-blue-400 dark:border-slate-700 dark:hover:border-blue-500"
                  >
                    <div className="text-xl">📄</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      PDF-Upload
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Mietvertrag hochladen – Felder werden automatisch erkannt
                    </div>
                  </button>
                  <button
                    onClick={() => setAddMode("manual")}
                    className="flex-1 rounded-xl border-2 border-slate-200 p-4 text-left transition hover:border-blue-400 dark:border-slate-700 dark:hover:border-blue-500"
                  >
                    <div className="text-xl">✏️</div>
                    <div className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                      Manuell eingeben
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Alle Felder selbst ausfüllen
                    </div>
                  </button>
                </div>
                <div className="mt-4 flex justify-end">
                  <button onClick={closeAddTenant} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    Abbrechen
                  </button>
                </div>
              </>
            ) : addMode === "pdf" && !reviewMode ? (
              <>
                <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  Mietvertrag hochladen
                </h2>
                {extracting ? (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Dokument wird analysiert…
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <label className="block cursor-pointer rounded-xl border-2 border-dashed border-slate-300 p-8 text-center transition hover:border-blue-400 dark:border-slate-700 dark:hover:border-blue-500">
                      <div className="text-3xl">📎</div>
                      <div className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        PDF, JPEG oder PNG auswählen
                      </div>
                      <input
                        type="file"
                        accept=".pdf,image/jpeg,image/png"
                        className="hidden"
                        onChange={handlePdfUpload}
                      />
                    </label>
                    <div className="flex justify-end gap-3">
                      <button onClick={closeAddTenant} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                        Abbrechen
                      </button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              /* Manual form or review mode */
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {reviewMode ? "Extrahierte Daten prüfen" : "Mieterdaten eingeben"}
                  </h2>
                </div>
                {savedDocumentId && (
                  <div className="mb-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                    <span>✓</span>
                    <span>Mietvertrag wurde in Dokumenten gespeichert.</span>
                    <a
                      href={`/dashboard/documents/${savedDocumentId}`}
                      className="ml-auto underline"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Öffnen →
                    </a>
                  </div>
                )}
                <form
                  onSubmit={handleTenantSubmit}
                  className="max-h-[70vh] space-y-3 overflow-y-auto pr-1"
                >
                  {(["first_name", "last_name"] as const).map((field) => {
                    const labels: Record<string, string> = { first_name: "Vorname *", last_name: "Nachname *" };
                    const extracted = extractedData?.[field];
                    return (
                      <div key={field}>
                        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {labels[field]}
                          {extracted && <ConfidenceBadge confidence={extracted.confidence} />}
                        </label>
                        <input
                          type="text"
                          required
                          value={formData[field]}
                          onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
                  {(["email", "phone"] as const).map((field) => {
                    const labels: Record<string, string> = { email: "E-Mail", phone: "Telefon" };
                    const extracted = extractedData?.[field];
                    return (
                      <div key={field}>
                        <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                          {labels[field]}
                          {extracted && <ConfidenceBadge confidence={extracted.confidence} />}
                        </label>
                        <input
                          type={field === "email" ? "email" : "tel"}
                          value={formData[field]}
                          onChange={(e) => setFormData({ ...formData, [field]: e.target.value })}
                          className={inputClass}
                        />
                      </div>
                    );
                  })}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        Mietbeginn *
                        {extractedData?.lease_start && (
                          <ConfidenceBadge confidence={extractedData.lease_start.confidence} />
                        )}
                      </label>
                      <input
                        type="date"
                        required
                        value={formData.lease_start}
                        onChange={(e) => setFormData({ ...formData, lease_start: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        Mietende
                        {extractedData?.lease_end && (
                          <ConfidenceBadge confidence={extractedData.lease_end.confidence} />
                        )}
                      </label>
                      <input
                        type="date"
                        value={formData.lease_end}
                        onChange={(e) => setFormData({ ...formData, lease_end: e.target.value })}
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        Kaltmiete (€) *
                        {extractedData?.cold_rent_cents && (
                          <ConfidenceBadge confidence={extractedData.cold_rent_cents.confidence} />
                        )}
                      </label>
                      <input
                        type="number"
                        required
                        min="0"
                        step="0.01"
                        value={formData.cold_rent_eur}
                        onChange={(e) =>
                          setFormData({ ...formData, cold_rent_eur: e.target.value })
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        Nebenkosten (€)
                        {extractedData?.additional_costs_cents && (
                          <ConfidenceBadge
                            confidence={extractedData.additional_costs_cents.confidence}
                          />
                        )}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formData.additional_costs_eur}
                        onChange={(e) =>
                          setFormData({ ...formData, additional_costs_eur: e.target.value })
                        }
                        className={inputClass}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      Kaution (€)
                      {extractedData?.deposit_cents && (
                        <ConfidenceBadge confidence={extractedData.deposit_cents.confidence} />
                      )}
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={formData.deposit_eur}
                      onChange={(e) => setFormData({ ...formData, deposit_eur: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Mietart
                    </label>
                    <select
                      value={formData.rent_type}
                      onChange={(e) =>
                        setFormData({ ...formData, rent_type: e.target.value as RentType })
                      }
                      className={inputClass}
                    >
                      <option value="fixed">Festmiete</option>
                      <option value="index">Indexmiete</option>
                      <option value="stepped">Staffelmiete</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                      Verwendungszweck
                    </label>
                    <input
                      type="text"
                      value={formData.payment_reference}
                      onChange={(e) =>
                        setFormData({ ...formData, payment_reference: e.target.value })
                      }
                      placeholder="Wird automatisch vorgeschlagen"
                      className={inputClass}
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={closeAddTenant}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Abbrechen
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {submitting ? "Speichern…" : "Mieter anlegen"}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
