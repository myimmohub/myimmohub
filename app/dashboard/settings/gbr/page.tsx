"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePropertyId } from "../layout";

type Partner = {
  id: string;
  name: string;
  anteil: number;
  email: string | null;
};

type GbrSettings = {
  id?: string;
  property_id: string;
  name: string;
  steuernummer: string;
  finanzamt: string;
  veranlagungszeitraum: number;
  sonder_werbungskosten: boolean;
  feststellungserklaerung: boolean;
  teilweise_eigennutzung: boolean;
  gbr_partner: Partner[];
};

export default function GbrPage() {
  const propertyId = usePropertyId();
  const [data, setData] = useState<GbrSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // New partner form
  const [newName, setNewName] = useState("");
  const [newAnteil, setNewAnteil] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [addingPartner, setAddingPartner] = useState(false);

  // PDF upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const res = await fetch(`/api/settings/gbr?property_id=${propertyId}`);
    if (res.ok) setData(await res.json());
    setLoading(false);
  }, [propertyId]);

  useEffect(() => { void loadData(); }, [loadData]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    const res = await fetch("/api/settings/gbr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    setSaving(false);
    if (res.ok) {
      const result = await res.json();
      if (!data.id) setData({ ...data, id: result.id });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const addPartner = async () => {
    if (!data?.id || !newName.trim() || !newAnteil) return;
    setAddingPartner(true);
    const res = await fetch("/api/settings/gbr/partner", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gbr_settings_id: data.id,
        name: newName.trim(),
        anteil: parseFloat(newAnteil),
        email: newEmail.trim() || undefined,
      }),
    });
    setAddingPartner(false);
    if (res.ok) {
      setNewName("");
      setNewAnteil("");
      setNewEmail("");
      void loadData();
    }
  };

  const removePartner = async (id: string) => {
    if (!confirm("Partner wirklich entfernen?")) return;
    await fetch("/api/settings/gbr/partner", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    void loadData();
  };

  const handlePdfUpload = async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip "data:application/pdf;base64," prefix
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const res = await fetch("/api/settings/gbr/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf_base64: base64 }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Extraktion fehlgeschlagen");
      }

      const extracted = await res.json() as {
        name?: string;
        steuernummer?: string;
        finanzamt?: string;
        partner?: { name: string; anteil: number; email?: string | null }[];
      };

      // Prefill form with extracted data (keep existing values if extracted is empty)
      if (data) {
        setData({
          ...data,
          name: extracted.name || data.name,
          steuernummer: extracted.steuernummer || data.steuernummer,
          finanzamt: extracted.finanzamt || data.finanzamt,
        });
      }

      // Show extracted partners as preview (they need to be saved + added manually)
      if (extracted.partner && extracted.partner.length > 0) {
        setExtractedPartners(extracted.partner);
      }
    } catch (err) {
      setUploadError((err as Error).message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const [extractedPartners, setExtractedPartners] = useState<
    { name: string; anteil: number; email?: string | null }[]
  >([]);

  const applyExtractedPartner = (idx: number) => {
    const p = extractedPartners[idx];
    setNewName(p.name);
    setNewAnteil(String(p.anteil));
    setNewEmail(p.email ?? "");
    setExtractedPartners((prev) => prev.filter((_, i) => i !== idx));
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

  const totalAnteil = data.gbr_partner.reduce((sum, p) => sum + p.anteil, 0);

  return (
    <div className="space-y-6">
      {/* PDF-Upload für Gesellschaftervertrag */}
      <section className="rounded-xl border-2 border-dashed border-slate-300 bg-white p-4 transition dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Gesellschaftervertrag hochladen
            </h3>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              GbR-Name, Steuernummer, Finanzamt und Partner werden automatisch extrahiert
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handlePdfUpload(file);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {uploading ? (
                <span className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Extrahiere…
                </span>
              ) : (
                "PDF hochladen"
              )}
            </button>
          </div>
        </div>
        {uploadError && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {uploadError}
          </p>
        )}
        {extractedPartners.length > 0 && (
          <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-800 dark:bg-blue-950/20">
            <p className="mb-2 text-xs font-semibold text-blue-700 dark:text-blue-400">
              Erkannte Partner — klicke zum Übernehmen:
            </p>
            <div className="flex flex-wrap gap-2">
              {extractedPartners.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => applyExtractedPartner(idx)}
                  className="rounded-lg border border-blue-200 bg-white px-3 py-1.5 text-sm text-slate-700 transition hover:border-blue-400 hover:bg-blue-50 dark:border-blue-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-blue-950/30"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-1.5 text-slate-400">({p.anteil} %)</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* GbR Stammdaten */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">GbR-Stammdaten</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Name der GbR</label>
            <input
              value={data.name}
              onChange={(e) => setData({ ...data, name: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="z.B. Immobilien-GbR Müller & Schmidt"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Steuernummer</label>
            <input
              value={data.steuernummer}
              onChange={(e) => setData({ ...data, steuernummer: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="z.B. 123/456/78901"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Finanzamt</label>
            <input
              value={data.finanzamt}
              onChange={(e) => setData({ ...data, finanzamt: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              placeholder="z.B. Finanzamt Hamburg-Nord"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Veranlagungszeitraum</label>
            <input
              type="number"
              min={2020}
              max={2030}
              value={data.veranlagungszeitraum}
              onChange={(e) => setData({ ...data, veranlagungszeitraum: parseInt(e.target.value) || new Date().getFullYear() })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
            />
          </div>
        </div>
      </section>

      {/* Optionen */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <h3 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Optionen</h3>
        <div className="space-y-3">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={data.sonder_werbungskosten}
              onChange={(e) => setData({ ...data, sonder_werbungskosten: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Sonderwerbungskosten je Partner erfassen</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={data.feststellungserklaerung}
              onChange={(e) => setData({ ...data, feststellungserklaerung: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Gesonderte und einheitliche Feststellungserklärung</span>
          </label>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={data.teilweise_eigennutzung}
              onChange={(e) => setData({ ...data, teilweise_eigennutzung: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">Teilweise Eigennutzung durch Partner</span>
          </label>
        </div>
      </section>

      {/* Save GbR settings first */}
      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Speichern..." : "GbR-Einstellungen speichern"}
        </button>
        {saved && (
          <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
            Gespeichert!
          </span>
        )}
      </div>

      {/* Partner */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Partner ({data.gbr_partner.length})
          </h3>
          <div className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            Math.abs(totalAnteil - 100) < 0.01
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
              : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400"
          }`}>
            Summe: {totalAnteil.toFixed(1)} %
          </div>
        </div>

        {data.gbr_partner.length > 0 && (
          <div className="mb-4 overflow-hidden rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
                  <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">Anteil</th>
                  <th className="hidden px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400 sm:table-cell">E-Mail</th>
                  <th className="px-4 py-2 text-right font-medium text-slate-500 dark:text-slate-400"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                {data.gbr_partner.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900 dark:text-slate-100">{p.name}</td>
                    <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{p.anteil} %</td>
                    <td className="hidden px-4 py-2.5 text-slate-500 dark:text-slate-400 sm:table-cell">{p.email || "–"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => removePartner(p.id)}
                        className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add partner form */}
        {data.id ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-3 dark:border-slate-700">
            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Neuen Partner hinzufügen</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Name *"
              />
              <input
                type="number"
                min={0}
                max={100}
                step={0.1}
                value={newAnteil}
                onChange={(e) => setNewAnteil(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Anteil % *"
              />
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="E-Mail (optional)"
              />
              <button
                onClick={addPartner}
                disabled={addingPartner || !newName.trim() || !newAnteil}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
              >
                {addingPartner ? "..." : "Hinzufügen"}
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Bitte erst die GbR-Einstellungen speichern, bevor Partner hinzugefügt werden.
          </p>
        )}
      </section>
    </div>
  );
}
