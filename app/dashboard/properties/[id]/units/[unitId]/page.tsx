"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { parseGermanDecimal } from "@/lib/utils/numberFormat";

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

interface StaffelEntry {
  effective_date: string;
  cold_rent_cents: number;
  additional_costs_cents: number;
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
  index_base_value?: number | null;
  index_base_date?: string | null;
  index_interval_months?: number | null;
  staffel_entries?: StaffelEntry[] | null;
}

interface RentAdjustment {
  id: string;
  tenant_id: string;
  effective_date: string;
  cold_rent_cents: number;
  additional_costs_cents: number;
  adjustment_type: "manual" | "index" | "stepped";
  index_value?: number | null;
  note?: string | null;
  created_at: string;
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

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
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

const cardClass =
  "rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";

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

const emptyAdjustForm = {
  effective_date: "",
  cold_rent_eur: "",
  additional_costs_eur: "",
  adjustment_type: "manual" as "manual" | "index" | "stepped",
  index_value: "",
  note: "",
};

function RentTypeBadge({ rentType }: { rentType: RentType }) {
  if (rentType === "index") {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        Indexmiete
      </span>
    );
  }
  if (rentType === "stepped") {
    return (
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
        Staffelmiete
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      Festmiete
    </span>
  );
}

function AdjustmentTypeBadge({ type }: { type: string }) {
  if (type === "index") {
    return (
      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
        Index
      </span>
    );
  }
  if (type === "stepped") {
    return (
      <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
        Staffel
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      Manuell
    </span>
  );
}

export default function UnitDetailPage() {
  const { id, unitId } = useParams<{ id: string; unitId: string }>();

  const [unit, setUnit] = useState<Unit | null>(null);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  const [pastTenants, setPastTenants] = useState<Tenant[]>([]);
  const [rentAdjustments, setRentAdjustments] = useState<RentAdjustment[]>([]);
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

  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustForm, setAdjustForm] = useState(emptyAdjustForm);
  const [submittingAdjust, setSubmittingAdjust] = useState(false);

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
      const active = tenantsData.find((t: Tenant) => t.status === "active") ?? null;
      setActiveTenant(active);
      setPastTenants(
        tenantsData.filter(
          (t: Tenant) => t.status === "ended" || t.status === "notice_given"
        )
      );

      // Load rent adjustments for active tenant
      if (active) {
        const adjRes = await fetch(`/api/rent-adjustments?tenant_id=${active.id}`);
        if (adjRes.ok) {
          setRentAdjustments(await adjRes.json());
        }
      } else {
        setRentAdjustments([]);
      }
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
          ? String(parseGermanDecimal(data.cold_rent_cents.value) / 100)
          : "",
        additional_costs_eur: data.additional_costs_cents
          ? String(parseGermanDecimal(data.additional_costs_cents.value) / 100)
          : "",
        deposit_eur: data.deposit_cents
          ? String(parseGermanDecimal(data.deposit_cents.value) / 100)
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
          cold_rent_cents: Math.round(parseGermanDecimal(formData.cold_rent_eur) * 100),
          additional_costs_cents: Math.round(
            parseGermanDecimal(formData.additional_costs_eur || "0") * 100
          ),
          deposit_cents: Math.round(parseGermanDecimal(formData.deposit_eur || "0") * 100),
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

  async function handleCreateAdjustment(e: React.FormEvent) {
    e.preventDefault();
    if (!activeTenant) return;
    setSubmittingAdjust(true);
    try {
      const res = await fetch("/api/rent-adjustments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: activeTenant.id,
          effective_date: adjustForm.effective_date,
          cold_rent_cents: Math.round(parseGermanDecimal(adjustForm.cold_rent_eur) * 100),
          additional_costs_cents: Math.round(parseGermanDecimal(adjustForm.additional_costs_eur || "0") * 100),
          adjustment_type: adjustForm.adjustment_type,
          index_value: adjustForm.index_value ? parseGermanDecimal(adjustForm.index_value) : undefined,
          note: adjustForm.note || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setShowAdjustModal(false);
      setAdjustForm(emptyAdjustForm);
      await loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmittingAdjust(false);
    }
  }

  function openAdjustModal() {
    if (!activeTenant) return;
    setAdjustForm({
      ...emptyAdjustForm,
      cold_rent_eur: String(activeTenant.cold_rent_cents / 100),
      additional_costs_eur: String(activeTenant.additional_costs_cents / 100),
    });
    setShowAdjustModal(true);
  }

  function closeAddTenant() {
    setShowAddTenant(false);
    setAddMode(null);
    setExtractedData(null);
    setReviewMode(false);
    setFormData(emptyForm);
    setSavedDocumentId(null);
  }

  // Compute next adjustment due date for Indexmiete
  function computeIndexNextDue(tenant: Tenant, adjustments: RentAdjustment[]): string | null {
    const interval = tenant.index_interval_months ?? 12;
    const indexAdjustments = adjustments.filter((a) => a.adjustment_type === "index");
    if (indexAdjustments.length > 0) {
      // most recent index adjustment (already sorted desc)
      return addMonths(indexAdjustments[0].effective_date, interval);
    }
    if (tenant.index_base_date) {
      return addMonths(tenant.index_base_date, interval);
    }
    return null;
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

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Unit header */}
      <div className={cardClass}>
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

      {/* Active tenant section */}
      <div className={cardClass}>
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
          <div className="space-y-6">
            {/* A) Kontakt & Vertrag */}
            <div>
              {/* Tenant name + contact */}
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {activeTenant.first_name} {activeTenant.last_name}
                    </h3>
                    <RentTypeBadge rentType={activeTenant.rent_type} />
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {activeTenant.email && (
                      <a
                        href={`mailto:${activeTenant.email}`}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                      >
                        <span>✉</span>
                        {activeTenant.email}
                      </a>
                    )}
                    {activeTenant.phone && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        <span>📞</span>
                        {activeTenant.phone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Contract grid */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                <div>
                  <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Mieter seit
                  </div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {formatDate(activeTenant.lease_start)}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Mietende
                  </div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {activeTenant.lease_end ? formatDate(activeTenant.lease_end) : "Unbefristet"}
                  </div>
                </div>
                <div>
                  <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Kaution
                  </div>
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    {formatEur(activeTenant.deposit_cents)}
                  </div>
                </div>
                {activeTenant.payment_reference && (
                  <div>
                    <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Verwendungszweck
                    </div>
                    <div className="font-mono text-xs text-slate-900 dark:text-slate-100">
                      {activeTenant.payment_reference}
                    </div>
                  </div>
                )}
              </div>

              {/* Rent row */}
              <div className="mt-4 flex flex-wrap items-center gap-4 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/50">
                <div>
                  <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Kaltmiete
                  </div>
                  <div className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    {formatEur(activeTenant.cold_rent_cents)}
                  </div>
                </div>
                <div className="text-slate-300 dark:text-slate-600">+</div>
                <div>
                  <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Nebenkosten
                  </div>
                  <div className="text-base font-semibold text-slate-700 dark:text-slate-300">
                    {formatEur(activeTenant.additional_costs_cents)}
                  </div>
                </div>
                <div className="text-slate-300 dark:text-slate-600">=</div>
                <div>
                  <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    Warmmiete
                  </div>
                  <div className="text-base font-semibold text-green-700 dark:text-green-400">
                    {formatEur(activeTenant.cold_rent_cents + activeTenant.additional_costs_cents)}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
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

            {/* B) Indexmiete section */}
            {activeTenant.rent_type === "index" && (
              <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
                <h3 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                  Indexmiete
                </h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-4 text-sm">
                  <div>
                    <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Basis-Index
                    </div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {activeTenant.index_base_value != null
                        ? activeTenant.index_base_value.toLocaleString("de-DE")
                        : "–"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Basis-Datum
                    </div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {activeTenant.index_base_date
                        ? formatDate(activeTenant.index_base_date)
                        : "–"}
                    </div>
                  </div>
                  <div>
                    <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                      Prüfintervall
                    </div>
                    <div className="font-medium text-slate-900 dark:text-slate-100">
                      {activeTenant.index_interval_months ?? 12} Monate
                    </div>
                  </div>
                  {(() => {
                    const nextDue = computeIndexNextDue(activeTenant, rentAdjustments);
                    if (!nextDue) return null;
                    const daysUntil = Math.ceil(
                      (new Date(nextDue).getTime() - new Date(today).getTime()) / 86400000
                    );
                    const isOverdue = daysUntil < 0;
                    const isDueSoon = daysUntil >= 0 && daysUntil <= 60;
                    return (
                      <div>
                        <div className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                          Nächste Anpassung
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 dark:text-slate-100">
                            {formatDate(nextDue)}
                          </span>
                          {isOverdue && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              Anpassung überfällig
                            </span>
                          )}
                          {isDueSoon && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                              Anpassung fällig
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* C) Staffelmiete section */}
            {activeTenant.rent_type === "stepped" &&
              activeTenant.staffel_entries &&
              activeTenant.staffel_entries.length > 0 && (
                <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
                  <h3 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
                    Staffelmiete – Übersicht
                  </h3>
                  <div className="space-y-2">
                    {activeTenant.staffel_entries
                      .slice()
                      .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
                      .map((entry, idx) => {
                        const isFuture = entry.effective_date > today;
                        const isNext =
                          isFuture &&
                          activeTenant.staffel_entries!.filter((e) => e.effective_date > today)
                            .sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0]
                            ?.effective_date === entry.effective_date;
                        return (
                          <div
                            key={idx}
                            className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                              isNext
                                ? "border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30"
                                : "border border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/30"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {isNext && (
                                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                                  Nächste Stufe
                                </span>
                              )}
                              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                ab {formatDate(entry.effective_date)}
                              </span>
                            </div>
                            <div className="text-right text-sm">
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {formatEur(entry.cold_rent_cents)}
                              </span>
                              {entry.additional_costs_cents > 0 && (
                                <span className="ml-2 text-slate-500 dark:text-slate-400">
                                  + {formatEur(entry.additional_costs_cents)} NK
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

            {/* D) Mietanpassungen section */}
            <div className="border-t border-slate-100 pt-6 dark:border-slate-800">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Mietanpassungen
                </h3>
                <button
                  onClick={openAdjustModal}
                  className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Neue Anpassung
                </button>
              </div>
              {rentAdjustments.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Keine Mietanpassungen erfasst
                </p>
              ) : (
                <div className="space-y-3">
                  {rentAdjustments.map((adj) => (
                    <div
                      key={adj.id}
                      className="rounded-lg border border-slate-100 p-4 dark:border-slate-800"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            {formatDate(adj.effective_date)}
                          </span>
                          <AdjustmentTypeBadge type={adj.adjustment_type} />
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div>
                            <span className="text-slate-500 dark:text-slate-400">Kaltmiete: </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {formatEur(adj.cold_rent_cents)}
                            </span>
                          </div>
                          {adj.additional_costs_cents > 0 && (
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">NK: </span>
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {formatEur(adj.additional_costs_cents)}
                              </span>
                            </div>
                          )}
                          {adj.adjustment_type === "index" && adj.index_value != null && (
                            <div>
                              <span className="text-slate-500 dark:text-slate-400">Index: </span>
                              <span className="font-medium text-slate-900 dark:text-slate-100">
                                {Number(adj.index_value).toLocaleString("de-DE")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                      {adj.note && (
                        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                          {adj.note}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Kein aktiver Mieter</p>
        )}
      </div>

      {/* Tenant history */}
      {pastTenants.length > 0 && (
        <div className={cardClass}>
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
                        type="text"
                        inputMode="decimal"
                        required
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
                        type="text"
                        inputMode="decimal"
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
                      type="text"
                      inputMode="decimal"
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

      {/* Rent adjustment modal */}
      {showAdjustModal && activeTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-5 text-base font-semibold text-slate-900 dark:text-slate-100">
              Neue Mietanpassung
            </h2>
            <form onSubmit={handleCreateAdjustment} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Wirksamkeitsdatum *
                </label>
                <input
                  type="date"
                  required
                  value={adjustForm.effective_date}
                  onChange={(e) => setAdjustForm({ ...adjustForm, effective_date: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Neue Kaltmiete (€) *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={adjustForm.cold_rent_eur}
                    onChange={(e) => setAdjustForm({ ...adjustForm, cold_rent_eur: e.target.value })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Neue Nebenkosten (€)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={adjustForm.additional_costs_eur}
                    onChange={(e) => setAdjustForm({ ...adjustForm, additional_costs_eur: e.target.value })}
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Art der Anpassung
                </label>
                <select
                  value={adjustForm.adjustment_type}
                  onChange={(e) =>
                    setAdjustForm({
                      ...adjustForm,
                      adjustment_type: e.target.value as "manual" | "index" | "stepped",
                    })
                  }
                  className={inputClass}
                >
                  <option value="manual">Manuell</option>
                  <option value="index">Indexanpassung</option>
                  <option value="stepped">Staffelanpassung</option>
                </select>
              </div>
              {adjustForm.adjustment_type === "index" && (
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Indexwert (VPI)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={adjustForm.index_value}
                    onChange={(e) => setAdjustForm({ ...adjustForm, index_value: e.target.value })}
                    placeholder="z. B. 118,6"
                    className={inputClass}
                  />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Notiz
                </label>
                <textarea
                  rows={3}
                  value={adjustForm.note}
                  onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })}
                  placeholder="Optionale Anmerkung zur Mietanpassung"
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setShowAdjustModal(false);
                    setAdjustForm(emptyAdjustForm);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submittingAdjust}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {submittingAdjust ? "Speichern…" : "Anpassung speichern"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
