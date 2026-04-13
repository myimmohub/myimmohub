"use client";

import { useEffect, useRef, useState } from "react";
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

interface CsvRow {
  label: string;
  unit_type: UnitType;
  floor: string;
  area_sqm: string;
  rooms: string;
  vat_liable: boolean;
  error?: string;
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

// Maps German/English label variants to the internal type key
const TYPE_MAP: Record<string, UnitType> = {
  wohnen: "residential",
  wohnung: "residential",
  residential: "residential",
  gewerbe: "commercial",
  commercial: "commercial",
  stellplatz: "parking",
  garage: "parking",
  parking: "parking",
  sonstiges: "other",
  other: "other",
};

const CSV_HEADERS = ["Bezeichnung", "Typ", "Etage", "Flaeche_m2", "Zimmer", "Umsatzsteuerpflichtig"];

const CSV_TEMPLATE_ROWS = [
  ["Wohnung 1.OG links", "Wohnen", "1", "72.5", "3", "nein"],
  ["Wohnung 1.OG rechts", "Wohnen", "1", "68", "2.5", "nein"],
  ["Ladenlokal EG", "Gewerbe", "EG", "120", "", "ja"],
  ["Stellplatz 1", "Stellplatz", "", "", "", "nein"],
];

function downloadCsvTemplate() {
  const lines = [
    CSV_HEADERS.join(";"),
    ...CSV_TEMPLATE_ROWS.map((r) => r.join(";")),
  ];
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "einheiten-vorlage.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text: string): CsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  // Auto-detect separator: ; or ,
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase());

  const colIdx = (candidates: string[]) => {
    for (const c of candidates) {
      const idx = headers.indexOf(c);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const idxLabel    = colIdx(["bezeichnung", "label", "name"]);
  const idxType     = colIdx(["typ", "type", "unit_type"]);
  const idxFloor    = colIdx(["etage", "floor", "stockwerk"]);
  const idxArea     = colIdx(["flaeche_m2", "fläche_m2", "area_sqm", "flaeche", "fläche", "m2"]);
  const idxRooms    = colIdx(["zimmer", "rooms", "zimmeranzahl"]);
  const idxVat      = colIdx(["umsatzsteuerpflichtig", "vat_liable", "ust", "vat"]);

  return lines.slice(1).map((line) => {
    const cols = line.split(sep).map((c) => c.trim());
    const get  = (idx: number) => (idx >= 0 ? (cols[idx] ?? "") : "");

    const rawLabel = get(idxLabel);
    const rawType  = get(idxType).toLowerCase().replace(/ä/g, "a").replace(/ö/g, "o").replace(/ü/g, "u");
    const rawVat   = get(idxVat).toLowerCase();

    const unit_type: UnitType = TYPE_MAP[rawType] ?? "residential";
    const vat_liable = rawVat === "ja" || rawVat === "yes" || rawVat === "true" || rawVat === "1";

    const row: CsvRow = {
      label: rawLabel,
      unit_type,
      floor: get(idxFloor),
      area_sqm: get(idxArea),
      rooms: get(idxRooms),
      vat_liable,
    };

    if (!rawLabel) row.error = "Bezeichnung fehlt";
    return row;
  });
}

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
  const [units, setUnits]       = useState<Unit[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState(initialFormData);

  // CSV import state
  const fileInputRef            = useRef<HTMLInputElement>(null);
  const [csvRows, setCsvRows]   = useState<CsvRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ ok: number; failed: number } | null>(null);

  useEffect(() => { loadUnits(); }, [id]);

  async function loadUnits() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/units?property_id=${id}`);
      if (!res.ok) throw new Error("Fehler beim Laden der Einheiten");
      setUnits(await res.json());
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
          label:    formData.label,
          unit_type: formData.unit_type,
          floor:    formData.floor || null,
          area_sqm: formData.area_sqm ? parseFloat(formData.area_sqm) : null,
          rooms:    formData.rooms   ? parseFloat(formData.rooms)    : null,
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

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      setCsvRows(rows);
      setImportResult(null);
    };
    reader.readAsText(file, "utf-8");
    // Reset so the same file can be re-selected
    e.target.value = "";
  }

  async function handleCsvImport() {
    if (!csvRows) return;
    const validRows = csvRows.filter((r) => !r.error);
    if (validRows.length === 0) return;

    setImporting(true);
    let ok = 0;
    let failed = 0;

    for (const row of validRows) {
      try {
        const res = await fetch("/api/units", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            property_id: id,
            label:      row.label,
            unit_type:  row.unit_type,
            floor:      row.floor || null,
            area_sqm:   row.area_sqm ? parseFloat(row.area_sqm) : null,
            rooms:      row.rooms   ? parseFloat(row.rooms)    : null,
            vat_liable: row.vat_liable,
          }),
        });
        if (res.ok) { ok++; } else { failed++; }
      } catch {
        failed++;
      }
    }

    setImporting(false);
    setImportResult({ ok, failed });
    if (ok > 0) await loadUnits();
  }

  function closeCsvModal() {
    setCsvRows(null);
    setImportResult(null);
  }

  const occupiedUnits = units.filter((u) => u.active_tenant);
  const vacantUnits   = units.filter((u) => !u.active_tenant);
  const totalRent     = units.reduce((sum, u) => {
    if (!u.active_tenant) return sum;
    return sum + u.active_tenant.cold_rent_cents + u.active_tenant.additional_costs_cents;
  }, 0);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Summary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[
          { label: "Einheiten gesamt", value: units.length },
          { label: "Vermietet",        value: occupiedUnits.length },
          { label: "Leerstand",        value: vacantUnits.length },
          { label: "Monatliche Miete", value: formatEur(totalRent) },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</div>
            <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-slate-100">{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Einheiten</h1>
        <div className="flex flex-wrap items-center gap-2">
          {/* CSV Template Download */}
          <button
            onClick={downloadCsvTemplate}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <DownloadIcon className="h-4 w-4" />
            CSV-Vorlage
          </button>
          {/* CSV Import */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <UploadIcon className="h-4 w-4" />
            CSV importieren
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileChange}
          />
          {/* Single unit */}
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
          >
            Einheit hinzufügen
          </button>
        </div>
      </div>

      {/* Units grid */}
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">{error}</div>
      ) : units.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-10 text-center dark:border-slate-800 dark:bg-slate-900">
          <div className="text-3xl">🏠</div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Noch keine Einheiten vorhanden.</p>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            Lade die CSV-Vorlage herunter, befülle sie und importiere alle Einheiten auf einmal.
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((unit) => (
            <div key={unit.id} className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{UNIT_TYPE_ICONS[unit.unit_type]}</span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{unit.label}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    {UNIT_TYPE_LABELS[unit.unit_type]}
                    {unit.floor    ? ` · ${unit.floor}` : ""}
                    {unit.area_sqm ? ` · ${unit.area_sqm} m²` : ""}
                  </div>
                </div>
                {unit.vat_liable && (
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">USt.</span>
                )}
              </div>
              <div className="mb-4 space-y-1.5">
                {unit.active_tenant ? (
                  <>
                    <div className="text-sm text-slate-700 dark:text-slate-300">{unit.active_tenant.first_name} {unit.active_tenant.last_name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">
                      Seit {new Date(unit.active_tenant.lease_start).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" })}
                    </div>
                    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      Soll-Miete: {formatEur(unit.active_tenant.cold_rent_cents + unit.active_tenant.additional_costs_cents)}
                    </div>
                  </>
                ) : (
                  <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">Leerstand</span>
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

      {/* ── Single unit modal ─────────────────────────────────────── */}
      {showForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
            <h2 className="mb-4 text-base font-semibold text-slate-900 dark:text-slate-100">Neue Einheit hinzufügen</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Bezeichnung *</label>
                <input type="text" required value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="z. B. Wohnung 1.OG links" className={inputClass} />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Typ</label>
                <select value={formData.unit_type} onChange={(e) => setFormData({ ...formData, unit_type: e.target.value as UnitType })} className={inputClass}>
                  <option value="residential">Wohnen</option>
                  <option value="commercial">Gewerbe</option>
                  <option value="parking">Stellplatz</option>
                  <option value="other">Sonstiges</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Etage</label>
                  <input type="text" value={formData.floor} onChange={(e) => setFormData({ ...formData, floor: e.target.value })} placeholder="z. B. 1. OG" className={inputClass} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Fläche (m²)</label>
                  <input type="number" min="0" step="0.01" value={formData.area_sqm} onChange={(e) => setFormData({ ...formData, area_sqm: e.target.value })} placeholder="0" className={inputClass} />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Zimmer</label>
                <input type="number" min="0" step="0.5" value={formData.rooms} onChange={(e) => setFormData({ ...formData, rooms: e.target.value })} placeholder="0" className={inputClass} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="vat_liable" checked={formData.vat_liable} onChange={(e) => setFormData({ ...formData, vat_liable: e.target.checked })} className="h-4 w-4 rounded border-slate-300 accent-blue-600" />
                <label htmlFor="vat_liable" className="text-sm text-slate-700 dark:text-slate-300">Umsatzsteuerpflichtig</label>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setFormData(initialFormData); }} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">Abbrechen</button>
                <button type="submit" disabled={submitting} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">{submitting ? "Speichern…" : "Einheit anlegen"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── CSV import preview modal ──────────────────────────────── */}
      {csvRows !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="flex w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900" style={{ maxHeight: "90vh" }}>
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-800">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">CSV-Import Vorschau</h2>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  {csvRows.filter((r) => !r.error).length} von {csvRows.length} Zeilen gültig
                </p>
              </div>
              <button onClick={closeCsvModal} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            {/* Result banner */}
            {importResult && (
              <div className={`mx-6 mt-4 rounded-lg px-4 py-3 text-sm ${importResult.failed === 0 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"}`}>
                {importResult.ok} Einheit{importResult.ok !== 1 ? "en" : ""} importiert
                {importResult.failed > 0 && `, ${importResult.failed} fehlgeschlagen`}.
              </div>
            )}

            {/* Table */}
            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    {["Bezeichnung", "Typ", "Etage", "Fläche", "Zimmer", "USt.", "Status"].map((h) => (
                      <th key={h} className="pb-2 pr-4 text-left text-xs font-medium text-slate-500 dark:text-slate-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {csvRows.map((row, i) => (
                    <tr key={i} className={row.error ? "opacity-50" : ""}>
                      <td className="py-2 pr-4 font-medium text-slate-900 dark:text-slate-100">{row.label || <span className="italic text-slate-400">—</span>}</td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{UNIT_TYPE_LABELS[row.unit_type]}</td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{row.floor || "—"}</td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{row.area_sqm ? `${row.area_sqm} m²` : "—"}</td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{row.rooms || "—"}</td>
                      <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{row.vat_liable ? "Ja" : "Nein"}</td>
                      <td className="py-2">
                        {row.error ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400">⚠ {row.error}</span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">✓ OK</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-slate-200 px-6 py-4 dark:border-slate-800">
              <button onClick={closeCsvModal} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                {importResult ? "Schließen" : "Abbrechen"}
              </button>
              {!importResult && (
                <button
                  onClick={handleCsvImport}
                  disabled={importing || csvRows.filter((r) => !r.error).length === 0}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {importing ? "Importiere…" : `${csvRows.filter((r) => !r.error).length} Einheiten importieren`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
