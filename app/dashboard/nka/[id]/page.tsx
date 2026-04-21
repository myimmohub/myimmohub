"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { NkaCostItem, NkaPeriod, NkaTenantShare, NkaTransactionCandidate } from "@/types/nka";

type NkaResponse = {
  period: NkaPeriod & { property: { id: string; name: string; address: string | null; ist_weg?: boolean | null } | null };
  cost_items: NkaCostItem[];
  tenant_shares: NkaTenantShare[];
  transaction_candidates: NkaTransactionCandidate[];
};

function isNkaResponse(value: NkaResponse | { error?: string } | null): value is NkaResponse {
  return Boolean(value && "period" in value && "cost_items" in value && "tenant_shares" in value);
}

const UMLAGESCHLUESSEL_OPTIONS = [
  { value: "wohnflaeche", label: "Wohnfläche" },
  { value: "personen", label: "Personen" },
  { value: "verbrauch", label: "Verbrauch" },
  { value: "einheiten", label: "Einheiten" },
  { value: "mea", label: "MEA" },
] as const;

function parseGermanNumber(raw: string | number): number {
  if (typeof raw === "number") return raw;
  const trimmed = String(raw).trim();
  if (!trimmed) return NaN;
  // Strip thousand separators ("1.500,50" → "1500,50"); only drop dots when a comma decimal is present.
  const hasComma = trimmed.includes(",");
  const normalized = hasComma
    ? trimmed.replace(/\./g, "").replace(",", ".")
    : trimmed;
  return Number(normalized);
}

function emptyItemDraft() {
  return {
    bezeichnung: "",
    betr_kv_position: 1,
    betrag_brutto: "",
    umlageschluessel: "wohnflaeche",
    ist_umlagefaehig: true,
    notiz: "",
  };
}

export default function NkaEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<NkaResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { bezeichnung: string; betr_kv_position: number; betrag_brutto: string; umlageschluessel: string; ist_umlagefaehig: boolean; notiz: string }>>({});
  const [newItem, setNewItem] = useState(emptyItemDraft());
  const [transactionSearch, setTransactionSearch] = useState("");
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState("");

  const syncDraftsFromData = (nextData: NkaResponse) => {
    setDrafts(
      Object.fromEntries(
        nextData.cost_items.map((item) => [
          item.id,
          {
            bezeichnung: item.bezeichnung,
            betr_kv_position: item.betr_kv_position,
            betrag_brutto: Number(item.betrag_brutto ?? 0).toFixed(2),
            umlageschluessel: item.umlageschluessel,
            ist_umlagefaehig: item.ist_umlagefaehig,
            notiz: item.notiz ?? "",
          },
        ]),
      ),
    );
  };

  useEffect(() => {
    let cancelled = false;

    async function loadPeriod() {
      setLoading(true);
      const res = await fetch(`/api/nka/periods/${id}`);
      const json = await res.json().catch(() => null) as NkaResponse | { error?: string } | null;
      if (cancelled) return;
      if (!res.ok || !isNkaResponse(json)) {
        setError((json as { error?: string } | null)?.error ?? "NKA konnte nicht geladen werden.");
        setLoading(false);
        return;
      }
      setData(json);
      syncDraftsFromData(json);
      setError(null);
      setLoading(false);
    }

    void loadPeriod();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleAutofill = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/nka/periods/${id}/autofill`, { method: "POST" });
    const json = await res.json().catch(() => null) as { error?: string } | null;
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "Auto-Befüllung fehlgeschlagen.");
      return;
    }
    setLoading(true);
    const nextRes = await fetch(`/api/nka/periods/${id}`);
    const nextJson = await nextRes.json().catch(() => null) as NkaResponse | { error?: string } | null;
    if (!nextRes.ok || !isNkaResponse(nextJson)) {
      setError((nextJson as { error?: string } | null)?.error ?? "NKA konnte nicht geladen werden.");
      setLoading(false);
      return;
    }
    setData(nextJson);
    syncDraftsFromData(nextJson);
    setError(null);
    setLoading(false);
  };

  const handleDraftChange = (itemId: string, field: string, value: string | number | boolean) => {
    setDrafts((current) => ({
      ...current,
      [itemId]: {
        ...current[itemId],
        [field]: value,
      },
    }));
  };

  const handleCreateItem = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/nka/periods/${id}/cost-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newItem,
        betrag_brutto: parseGermanNumber(newItem.betrag_brutto),
      }),
    });
    const json = await res.json().catch(() => null) as { error?: string } | null;
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "Kostenposition konnte nicht angelegt werden.");
      return;
    }
    setNewItem(emptyItemDraft());
    await handleReload();
  };

  const handleReload = async () => {
    setLoading(true);
    const res = await fetch(`/api/nka/periods/${id}`);
    const json = await res.json().catch(() => null) as NkaResponse | { error?: string } | null;
    if (!res.ok || !isNkaResponse(json)) {
      setError((json as { error?: string } | null)?.error ?? "NKA konnte nicht geladen werden.");
      setLoading(false);
      return;
    }
    setData(json);
    syncDraftsFromData(json);
    setError(null);
    setLoading(false);
  };

  const handleSaveItem = async (itemId: string) => {
    const draft = drafts[itemId];
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/nka/periods/${id}/cost-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        betrag_brutto: parseGermanNumber(draft.betrag_brutto),
      }),
    });
    const json = await res.json().catch(() => null) as { error?: string } | null;
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "Kostenposition konnte nicht gespeichert werden.");
      return;
    }
    await handleReload();
  };

  const handleDeleteItem = async (itemId: string) => {
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/nka/periods/${id}/cost-items/${itemId}`, { method: "DELETE" });
    const json = await res.json().catch(() => null) as { error?: string } | null;
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "Kostenposition konnte nicht gelöscht werden.");
      return;
    }
    await handleReload();
  };

  const totalChargeable = useMemo(
    () => (data?.cost_items ?? []).filter((item) => item.ist_umlagefaehig).reduce((sum, item) => sum + Number(item.betrag_brutto ?? 0), 0),
    [data],
  );
  const totalNonChargeable = useMemo(
    () => (data?.cost_items ?? []).filter((item) => !item.ist_umlagefaehig).reduce((sum, item) => sum + Number(item.betrag_brutto ?? 0), 0),
    [data],
  );
  const availableCandidateCategories = useMemo(
    () => Array.from(new Set((data?.transaction_candidates ?? []).map((item) => item.category).filter(Boolean))) as string[],
    [data],
  );
  const filteredCandidates = useMemo(() => {
    const query = transactionSearch.trim().toLowerCase();
    return (data?.transaction_candidates ?? []).filter((candidate) => {
      const matchesCategory = transactionCategoryFilter ? candidate.category === transactionCategoryFilter : true;
      const haystack = [candidate.counterpart, candidate.description, candidate.category]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      const matchesSearch = query ? haystack.includes(query) : true;
      return matchesCategory && matchesSearch;
    });
  }, [data, transactionCategoryFilter, transactionSearch]);

  const handleImportCandidate = async (candidate: NkaTransactionCandidate) => {
    setSaving(true);
    setError(null);
    const bezeichnung = [candidate.counterpart, candidate.description, candidate.category].filter(Boolean).join(" · ");
    const res = await fetch(`/api/nka/periods/${id}/cost-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bezeichnung: bezeichnung || "Kostenposition",
        betr_kv_position: candidate.betr_kv_position,
        betrag_brutto: Math.abs(Number(candidate.amount ?? 0)),
        umlageschluessel: candidate.umlageschluessel,
        ist_umlagefaehig: candidate.ist_umlagefaehig,
        notiz: `${candidate.needs_betrkv_review ? "BetrKV bitte prüfen. " : ""}Übernommen aus Transaktion ${candidate.date}`,
      }),
    });
    const json = await res.json().catch(() => null) as { error?: string } | null;
    setSaving(false);
    if (!res.ok) {
      setError(json?.error ?? "Transaktion konnte nicht übernommen werden.");
      return;
    }
    await handleReload();
  };

  if (loading) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10"><section className="mx-auto max-w-6xl rounded-xl border border-slate-200 bg-white p-6 text-slate-500">Lade NKA…</section></main>;
  }

  if (!data) {
    return <main className="min-h-screen bg-slate-50 px-4 py-10"><section className="mx-auto max-w-6xl rounded-xl border border-slate-200 bg-white p-6 text-red-600">{error ?? "Unbekannter Fehler."}</section></main>;
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-slate-500">
              <Link href="/dashboard/nka" className="hover:text-slate-900">Nebenkostenabrechnung</Link> / {data.period.property?.name ?? "Objekt"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">
              NKA {data.period.zeitraum_von} bis {data.period.zeitraum_bis}
            </h1>
            <p className="mt-1 text-sm text-slate-500">Status: {data.period.status}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/dashboard/nka/${id}/pdf`}
              className="inline-flex rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              PDF-Vorschau
            </Link>
            <button
              type="button"
              onClick={() => void handleAutofill()}
              disabled={saving}
              className="inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Befülle…" : "Kosten aus Transaktionen sammeln"}
            </button>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Umlagefähig</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{totalChargeable.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Nicht umlagefähig</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{totalNonChargeable.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mieteranteile</p>
            <p className="mt-2 text-2xl font-semibold text-slate-900">{data.tenant_shares.length}</p>
          </div>
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Transaktionskandidaten</h2>
            <p className="mt-1 text-sm text-slate-500">Hier siehst du alle im Zeitraum gefundenen Kosten-Transaktionen mit BetrKV-Zuordnung. Du kannst sie durchsuchen, filtern und direkt übernehmen.</p>
          </div>
          <div className="flex flex-wrap gap-3 border-b border-slate-200 px-5 py-4">
            <input
              value={transactionSearch}
              onChange={(event) => setTransactionSearch(event.target.value)}
              placeholder="Nach Name, Beschreibung oder Kategorie suchen"
              className="min-w-[18rem] rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            />
            <select
              value={transactionCategoryFilter}
              onChange={(event) => setTransactionCategoryFilter(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
            >
              <option value="">Alle Kategorien</option>
              {availableCandidateCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">
              {filteredCandidates.length} passende Transaktionen
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Datum</th>
                  <th className="px-4 py-3">Transaktion</th>
                  <th className="px-4 py-3">Kategorie</th>
                  <th className="px-4 py-3">BetrKV</th>
                  <th className="px-4 py-3">Betrag</th>
                  <th className="px-4 py-3">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredCandidates.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>Keine passenden Transaktionskandidaten gefunden.</td></tr>
                ) : filteredCandidates.map((candidate) => (
                  <tr key={candidate.id}>
                    <td className="px-4 py-3 text-slate-700">{candidate.date}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{candidate.counterpart || candidate.description || "Transaktion"}</div>
                      <div className="text-xs text-slate-500">{candidate.description || "Ohne Beschreibung"}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{candidate.category ?? "—"}</td>
                    <td className="px-4 py-3 text-slate-700">
                      Nr. {candidate.betr_kv_position}
                      {candidate.needs_betrkv_review ? (
                        <span className="ml-2 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">prüfen</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{Math.abs(Number(candidate.amount ?? 0)).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void handleImportCandidate(candidate)}
                        disabled={saving}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                      >
                        Übernehmen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Kostenpositionen</h2>
            <p className="mt-1 text-sm text-slate-500">Auto-Befüllte Positionen aus Transaktionen. Du kannst Positionen hier ergänzen, anpassen oder löschen und die Mieteranteile werden danach direkt neu gerechnet.</p>
          </div>
          <div className="border-b border-slate-200 bg-slate-50/70 px-5 py-4">
            <div className="grid gap-3 md:grid-cols-[2fr,0.8fr,1fr,1fr,auto,1.2fr,auto]">
              <input
                value={newItem.bezeichnung}
                onChange={(event) => setNewItem((current) => ({ ...current, bezeichnung: event.target.value }))}
                placeholder="Neue Position, z. B. Hausreinigung"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <input
                type="number"
                min={1}
                max={17}
                value={newItem.betr_kv_position}
                onChange={(event) => setNewItem((current) => ({ ...current, betr_kv_position: Number(event.target.value || 1) }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <select
                value={newItem.umlageschluessel}
                onChange={(event) => setNewItem((current) => ({ ...current, umlageschluessel: event.target.value }))}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {UMLAGESCHLUESSEL_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <input
                value={newItem.betrag_brutto}
                onChange={(event) => setNewItem((current) => ({ ...current, betrag_brutto: event.target.value }))}
                placeholder="0,00"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <label className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={newItem.ist_umlagefaehig}
                  onChange={(event) => setNewItem((current) => ({ ...current, ist_umlagefaehig: event.target.checked }))}
                />
                Umlagefähig
              </label>
              <input
                value={newItem.notiz}
                onChange={(event) => setNewItem((current) => ({ ...current, notiz: event.target.value }))}
                placeholder="Optionale Notiz"
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <button
                type="button"
                onClick={() => void handleCreateItem()}
                disabled={saving}
                className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                Hinzufügen
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Bezeichnung</th>
                  <th className="px-4 py-3">BetrKV</th>
                  <th className="px-4 py-3">Umlageschlüssel</th>
                  <th className="px-4 py-3">Quelle</th>
                  <th className="px-4 py-3">Betrag</th>
                  <th className="px-4 py-3">Umlagefähig</th>
                  <th className="px-4 py-3">Notiz</th>
                  <th className="px-4 py-3">Aktion</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.cost_items.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={8}>Noch keine Kostenpositionen. Mit dem Button oben aus Transaktionen befüllen oder hier manuell ergänzen.</td></tr>
                ) : data.cost_items.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-slate-900">
                      <input
                        value={drafts[item.id]?.bezeichnung ?? item.bezeichnung}
                        onChange={(event) => handleDraftChange(item.id, "bezeichnung", event.target.value)}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <input
                        type="number"
                        min={1}
                        max={17}
                        value={drafts[item.id]?.betr_kv_position ?? item.betr_kv_position}
                        onChange={(event) => handleDraftChange(item.id, "betr_kv_position", Number(event.target.value || 1))}
                        className="w-20 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                      />
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <select
                        value={drafts[item.id]?.umlageschluessel ?? item.umlageschluessel}
                        onChange={(event) => handleDraftChange(item.id, "umlageschluessel", event.target.value)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                      >
                        {UMLAGESCHLUESSEL_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <span className={`rounded-full px-2 py-1 text-xs font-medium ${item.quelle === "manuell" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"}`}>
                        {item.quelle}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-900">
                      <input
                        value={drafts[item.id]?.betrag_brutto ?? Number(item.betrag_brutto ?? 0).toFixed(2)}
                        onChange={(event) => handleDraftChange(item.id, "betrag_brutto", event.target.value)}
                        className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={drafts[item.id]?.ist_umlagefaehig ?? item.ist_umlagefaehig}
                          onChange={(event) => handleDraftChange(item.id, "ist_umlagefaehig", event.target.checked)}
                        />
                        Ja
                      </label>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      <input
                        value={drafts[item.id]?.notiz ?? item.notiz ?? ""}
                        onChange={(event) => handleDraftChange(item.id, "notiz", event.target.value)}
                        placeholder="Optional"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => void handleSaveItem(item.id)}
                          disabled={saving}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Speichern
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteItem(item.id)}
                          disabled={saving}
                          className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-slate-900">Mieteranteile</h2>
            <p className="mt-1 text-sm text-slate-500">Erste tages- und flächenanteilige Verteilung aus den aktiven Mietverhältnissen der Periode.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Mieter</th>
                  <th className="px-4 py-3">Zeitraum</th>
                  <th className="px-4 py-3">Tage</th>
                  <th className="px-4 py-3">Anteil</th>
                  <th className="px-4 py-3">Vorauszahlungen</th>
                  <th className="px-4 py-3">Ergebnis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.tenant_shares.length === 0 ? (
                  <tr><td className="px-4 py-6 text-slate-500" colSpan={6}>Noch keine Mieteranteile berechnet.</td></tr>
                ) : data.tenant_shares.map((share) => (
                  <tr key={share.id}>
                    <td className="px-4 py-3 text-slate-900">
                      <div className="font-medium">{share.tenant_name ?? share.versandt_an_email ?? share.mieter_id}</div>
                      <div className="text-xs text-slate-500">{share.unit_label ?? "Einheit unbekannt"}</div>
                      {share.matched_payment_count ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {share.matched_payment_count} zugeordnete Zahlung{share.matched_payment_count === 1 ? "" : "en"}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{share.bewohnt_von} bis {share.bewohnt_bis}</td>
                    <td className="px-4 py-3 text-slate-700">{share.tage_anteil}</td>
                    <td className="px-4 py-3 text-slate-900">{Number(share.summe_anteile ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</td>
                    <td className="px-4 py-3 text-slate-700">
                      <div>{Number(share.summe_vorauszahlungen ?? 0).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</div>
                      {share.matched_payment_sources && share.matched_payment_sources.length > 0 ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {share.matched_payment_sources.slice(0, 2).join(" · ")}
                          {share.matched_payment_sources.length > 2 ? " …" : ""}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-slate-400">Aus Vertragsvorauszahlung berechnet</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-900">{Number(share.nachzahlung_oder_guthaben ?? (Number(share.summe_anteile ?? 0) - Number(share.summe_vorauszahlungen ?? 0))).toLocaleString("de-DE", { style: "currency", currency: "EUR" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
