"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

type UnitType = "residential" | "commercial" | "parking" | "other";

interface Unit {
  id: string;
  property_id: string;
  label: string;
  unit_type: UnitType;
  floor?: string | null;
  area_sqm?: number | null;
  rooms?: number | null;
  vat_liable: boolean;
  active_tenant?: {
    id: string;
    first_name: string;
    last_name: string;
    lease_start: string;
    cold_rent_cents: number;
    additional_costs_cents: number;
  } | null;
}

const UNIT_TYPE_ICONS: Record<UnitType, string> = {
  residential: "🏠",
  commercial: "🏪",
  parking: "🅿",
  other: "📦",
};

const UNIT_TYPE_LABELS: Record<UnitType, string> = {
  residential: "Wohnen",
  commercial: "Gewerbe",
  parking: "Stellplatz",
  other: "Sonstiges",
};

function formatEur(cents: number): string {
  return (cents / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR" });
}

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

const initialFormData = {
  label: "",
  unit_type: "residential" as UnitType,
  floor: "",
  area_sqm: "",
  rooms: "",
  vat_liable: false,
};

export default function UnitsPage() {
  const { id } = useParams<{ id: string }>();
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(initialFormData);

  useEffect(() => {
    loadUnits();
  }, [id]);

  async function loadUnits() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/units?property_id=${id}`);
      if (!res.ok) throw new Error("Fehler beim Laden der Einheiten");
      const data = await res.json();
      setUnits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch("/api/units", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          property_id: id,
          label: formData.label,
          unit_type: formData.unit_type,
          floor: formData.floor || null,
          area_sqm: formData.area_sqm ? parseFloat(formData.area_sqm) : null,
          rooms: formData.rooms ? parseFloat(formData.rooms) : null,
          vat_liable: formData.vat_liable,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setShowForm(false);
      setFormData(initialFormData);
      await loadUnits();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Unbekannter Fehler");
    } finally {
      setSubmitting(false);
    }
  }

  const occupiedUnits = units.filter((u) => u.active_tenant);
  const vacantUnits = units.filter((u) => !u.active_tenant);
  const totalRent = units.reduce((sum, u) => {
    if (!u.active_tenant) return sum;
    return sum + u.active_tenant.cold_rent_cents + u.active_tenant.additional_costs_cents;
  }, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Einheiten gesamt", value: units.length },
          { label: "Vermietet", value: occupiedUnits.length },
          { label: "Leerstand", value: vacantUnits.length },
          { label: "Monatliche Miete", value: formatEur(totalRent) },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <div className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">
              {stat.value}
            </div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Einheiten</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Einheit hinzufügen
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div
              key={i}
              className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800"
            />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          {error}
        </div>
      ) : units.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="text-3xl">🏠</div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Noch keine Einheiten vorhanden.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((unit) => (
            <div
              key={unit.id}
              className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{UNIT_TYPE_ICONS[unit.unit_type]}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {unit.label}
                    </span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {UNIT_TYPE_LABELS[unit.unit_type]}
                    {unit.floor ? ` · ${unit.floor}. OG` : ""}
                    {unit.area_sqm ? ` · ${unit.area_sqm} m²` : ""}
                  </div>
                </div>
                {unit.vat_liable && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                    USt.
                  </span>
                )}
              </div>

              <div className="mb-4 space-y-1.5">
                {unit.active_tenant ? (
                  <>
                    <div className="text-sm text-slate-700 dark:text-slate-300">
                      {unit.active_tenant.first_name} {unit.active_tenant.last_name}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Seit{" "}
                      {new Date(unit.active_tenant.lease_start).toLocaleDateString("de-DE", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Soll-Miete:{" "}
                      {formatEur(
                        unit.active_tenant.cold_rent_cents +
                          unit.active_tenant.additional_costs_cents
                      )}
                    </div>
                  </>
                ) : (
                  <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    Leerstand
                  </span>
                )}
              </div>

              <Link
                href={`/dashboard/properties/${id}/units/${unit.id}`}
                className="inline-block rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Verwalten
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Add unit modal */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              Neue Einheit hinzufügen
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Bezeichnung *
                </label>
                <input
                  type="text"
                  required
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  placeholder="z. B. Wohnung 1.OG links"
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Typ
                </label>
                <select
                  value={formData.unit_type}
                  onChange={(e) =>
                    setFormData({ ...formData, unit_type: e.target.value as UnitType })
                  }
                  className={inputClass}
                >
                  <option value="residential">Wohnen</option>
                  <option value="commercial">Gewerbe</option>
                  <option value="parking">Stellplatz</option>
                  <option value="other">Sonstiges</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Etage
                  </label>
                  <input
                    type="text"
                    value={formData.floor}
                    onChange={(e) => setFormData({ ...formData, floor: e.target.value })}
                    placeholder="z. B. 1"
                    className={inputClass}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                    Fläche (m²)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={formData.area_sqm}
                    onChange={(e) => setFormData({ ...formData, area_sqm: e.target.value })}
                    placeholder="0"
                    className={inputClass}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">
                  Zimmer
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={formData.rooms}
                  onChange={(e) => setFormData({ ...formData, rooms: e.target.value })}
                  placeholder="0"
                  className={inputClass}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="vat_liable"
                  checked={formData.vat_liable}
                  onChange={(e) => setFormData({ ...formData, vat_liable: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                />
                <label
                  htmlFor="vat_liable"
                  className="text-sm text-slate-700 dark:text-slate-300"
                >
                  Umsatzsteuerpflichtig
                </label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setFormData(initialFormData);
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {submitting ? "Speichern…" : "Einheit anlegen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
