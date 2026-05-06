"use client";

/**
 * NkaEditor — Client-Component für die Nebenkostenabrechnung einer Periode.
 *
 * Funktion (3 Tabs):
 *   1. Kostenpositionen — CRUD über `/api/nka/periods/{id}/cost-items`.
 *      BetrKV-Position, Brutto, Umlagefähig %, Schlüssel, optional
 *      direct_shares, consumption, Heiz-Verbrauchsanteil.
 *   2. Mieteranteile — Tabelle der `nka_mieteranteile` mit "Verteilung
 *      berechnen"-Trigger + Restbetrag-Block (`nka_unallocated`).
 *   3. PDF-Export — pro Mieter ein Direkt-Download-Link auf
 *      `/api/nka/periods/{id}/pdf/{tenantId}`.
 *
 * Optimistic UI mit Rollback bei API-Fehlern (Pattern aus SonderWkEditor).
 */

import { useEffect, useMemo, useState } from "react";
import {
  computeUmlagefaehigCents,
  validateDirectShares,
} from "@/lib/nka/editorValidation";
import { fmtDecimal, parseGermanDecimal } from "@/lib/utils/numberFormat";
import type {
  BetrkvPosition,
  NkaShareLine,
  Verteilungsschluessel,
} from "@/lib/nka/distribute";

export type NkaEditorPeriod = {
  id: string;
  tax_year: number;
  period_start: string;
  period_end: string;
  status: "draft" | "distributed" | "sent" | "closed";
};

export type NkaEditorUnit = {
  id: string;
  label: string;
  area_sqm?: number | null;
};

export type NkaEditorTenant = {
  id: string;
  first_name: string;
  last_name: string;
  email?: string | null;
  status: "active" | "notice_given" | "ended";
  unit?: { id: string; label: string } | null;
};

// ─── Suggest- & Versand-Typen (für die UI-Erweiterungen) ──────────────────────

export type NkaSuggestItem = {
  transaction_id: string;
  position: BetrkvPosition;
  brutto_cents: number;
  date: string;
  counterpart: string | null;
  description: string | null;
  confidence: "high" | "medium" | "low";
  reason: string;
};

export type NkaSuggestResponse = {
  suggestions: NkaSuggestItem[];
  skipped_already_linked: string[];
  skipped_positive: string[];
};

export type NkaVersandRecord = {
  id: string;
  tenant_id: string;
  status: "queued" | "sent" | "delivered" | "bounced" | "complained" | "failed";
  status_detail: string | null;
  sent_at: string | null;
  delivered_at: string | null;
  bounced_at: string | null;
  failed_at: string | null;
  resend_message_id: string | null;
};

type VersandPreview = {
  recipient_email: string;
  subject: string;
  body_text: string;
};

export type NkaEditorCostItem = {
  id: string;
  position: BetrkvPosition;
  label: string | null;
  brutto_cents: number;
  umlagefaehig_pct: number;
  verteilungsschluessel: Verteilungsschluessel;
  direct_shares: Record<string, number> | null;
  consumption: Record<string, { from: number; to: number }> | null;
  heizkosten_verbrauchsanteil_pct: number | null;
};

type DistributeResponse = {
  period_id: string;
  period_days: number;
  tenant_shares: Array<{
    tenant_id: string;
    unit_id: string;
    active_days: number;
    total_share_cents: number;
    total_paid_advance_cents: number;
    balance_cents: number;
    shares: NkaShareLine[];
  }>;
  unallocated_cents: Record<string, number>;
  warnings: Array<{ code: string; message: string; cost_item_id?: string; tenant_id?: string }>;
};

const POSITIONS: { value: BetrkvPosition; label: string }[] = [
  { value: "grundsteuer", label: "Grundsteuer" },
  { value: "wasser", label: "Wasser" },
  { value: "abwasser", label: "Abwasser" },
  { value: "heizung", label: "Heizung" },
  { value: "warmwasser", label: "Warmwasser" },
  { value: "strassenreinigung", label: "Straßenreinigung" },
  { value: "muellabfuhr", label: "Müllabfuhr" },
  { value: "gebaeudereinigung", label: "Gebäudereinigung" },
  { value: "gartenpflege", label: "Gartenpflege" },
  { value: "beleuchtung", label: "Beleuchtung" },
  { value: "schornsteinreinigung", label: "Schornsteinreinigung" },
  { value: "sach_haftpflicht_versicherung", label: "Sach-/Haftpflichtversicherung" },
  { value: "hauswart", label: "Hauswart" },
  { value: "gemeinschaftsantenne_kabel", label: "Gemeinschaftsantenne / Kabel" },
  { value: "wartung", label: "Wartung" },
  { value: "sonstiges", label: "Sonstiges" },
];
const SCHLUESSEL: { value: Verteilungsschluessel; label: string }[] = [
  { value: "sqm", label: "m² (Wohnfläche)" },
  { value: "units", label: "Wohneinheiten" },
  { value: "persons", label: "Personen" },
  { value: "consumption", label: "Verbrauch" },
  { value: "direct", label: "Direkter Anteil pro Mieter" },
];

function fmtCents(cents: number) {
  return (cents / 100).toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
  });
}

function tenantName(t: NkaEditorTenant) {
  return `${t.first_name} ${t.last_name}`.trim();
}

type NewItemDraft = {
  position: BetrkvPosition;
  label: string;
  bruttoRaw: string;
  umlagefaehig_pct: number;
  schluessel: Verteilungsschluessel;
  direct_shares: Record<string, string>; // raw inputs per tenant
  consumption: Record<string, { from: string; to: string }>;
  heiz_verbrauch_pct: number;
};

function emptyDraft(): NewItemDraft {
  return {
    position: "grundsteuer",
    label: "",
    bruttoRaw: "",
    umlagefaehig_pct: 100,
    schluessel: "sqm",
    direct_shares: {},
    consumption: {},
    heiz_verbrauch_pct: 70,
  };
}

type Props = {
  propertyId: string;
  period: NkaEditorPeriod;
  units: NkaEditorUnit[];
  tenants: NkaEditorTenant[];
  initialCostItems: NkaEditorCostItem[];
};

export default function NkaEditor({
  period,
  units,
  tenants,
  initialCostItems,
}: Props) {
  const [tab, setTab] = useState<"items" | "shares" | "pdf">("items");
  const [items, setItems] = useState<NkaEditorCostItem[]>(initialCostItems);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<NewItemDraft>(emptyDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [distribution, setDistribution] = useState<DistributeResponse | null>(null);
  const [distributing, setDistributing] = useState(false);

  // ── Suggest-State (Tab "Kostenpositionen") ────────────────────────────────
  const [suggestions, setSuggestions] = useState<NkaSuggestItem[] | null>(null);
  const [suggestSelected, setSuggestSelected] = useState<Record<string, BetrkvPosition>>({});
  const [suggestLoading, setSuggestLoading] = useState(false);

  // ── Versand-State (Tab "PDF-Export"/"Versand") ────────────────────────────
  const [versandRecords, setVersandRecords] = useState<NkaVersandRecord[]>([]);
  const [versandLoading, setVersandLoading] = useState<string | null>(null); // tenant_id der gerade gesendet wird
  const [versandPreviews, setVersandPreviews] = useState<Record<string, VersandPreview>>({});
  const [confirmModal, setConfirmModal] = useState<{
    tenant_id: string;
    preview: VersandPreview;
  } | null>(null);

  const activeTenants = useMemo(
    () => tenants.filter((t) => t.status === "active" || t.status === "notice_given"),
    [tenants],
  );

  // ── Helpers ────────────────────────────────────────────────────────────────
  const flashInfo = (msg: string) => {
    setInfo(msg);
    setTimeout(() => setInfo(null), 2500);
  };

  // ── Create cost-item ───────────────────────────────────────────────────────
  const submitDraft = async () => {
    setError(null);
    const brutto = parseGermanDecimal(draft.bruttoRaw);
    if (!Number.isFinite(brutto)) {
      setError("Brutto ist keine gültige Zahl.");
      return;
    }
    const brutto_cents = Math.round(brutto * 100);

    let direct_shares: Record<string, number> | undefined;
    if (draft.schluessel === "direct") {
      direct_shares = {};
      for (const [tid, raw] of Object.entries(draft.direct_shares)) {
        if (!raw.trim()) continue;
        const n = parseGermanDecimal(raw);
        if (!Number.isFinite(n)) {
          setError(`Direct-Anteil für Mieter ${tid} ist ungültig.`);
          return;
        }
        direct_shares[tid] = Math.round(n * 100);
      }
      const v = validateDirectShares(brutto_cents, draft.umlagefaehig_pct, direct_shares);
      if (!v.ok) {
        // Wir blockieren nicht hart, sondern warnen — die Engine landet dann
        // den Restbetrag in `nka_unallocated`, was die Spec genau vorsieht.
        setError(`Hinweis: ${v.message} (Differenz wird in Restbetrag verbucht.)`);
      }
    }

    let consumption: Record<string, { from: number; to: number }> | undefined;
    if (draft.schluessel === "consumption") {
      consumption = {};
      for (const [uid, vals] of Object.entries(draft.consumption)) {
        if (!vals.from && !vals.to) continue;
        const from = parseGermanDecimal(vals.from);
        const to = parseGermanDecimal(vals.to);
        if (!Number.isFinite(from) || !Number.isFinite(to)) {
          setError(`Verbrauchswerte für Einheit ${uid} sind ungültig.`);
          return;
        }
        consumption[uid] = { from, to };
      }
    }

    const tempId = `tmp-${Math.random().toString(36).slice(2)}`;
    const optimistic: NkaEditorCostItem = {
      id: tempId,
      position: draft.position,
      label: draft.label.trim() || null,
      brutto_cents,
      umlagefaehig_pct: draft.umlagefaehig_pct,
      verteilungsschluessel: draft.schluessel,
      direct_shares: direct_shares ?? null,
      consumption: consumption ?? null,
      heizkosten_verbrauchsanteil_pct:
        draft.position === "heizung" ? draft.heiz_verbrauch_pct : null,
    };
    const prev = items;
    setItems([...items, optimistic]);
    setSaving(true);

    const body: Record<string, unknown> = {
      position: draft.position,
      label: draft.label.trim() || null,
      brutto_cents,
      umlagefaehig_pct: draft.umlagefaehig_pct,
      verteilungsschluessel: draft.schluessel,
      direct_shares: direct_shares ?? null,
      consumption: consumption ?? null,
      heizkosten_verbrauchsanteil_pct:
        draft.position === "heizung" ? draft.heiz_verbrauch_pct : null,
    };
    const res = await fetch(`/api/nka/periods/${period.id}/cost-items`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setItems(prev); // Rollback
      setError(data?.error ?? "Position konnte nicht gespeichert werden.");
      return;
    }
    const created = (await res.json()) as NkaEditorCostItem;
    setItems((curr) => curr.map((it) => (it.id === tempId ? created : it)));
    setCreating(false);
    setDraft(emptyDraft());
    flashInfo("Position gespeichert.");
  };

  const deleteItem = async (itemId: string) => {
    if (!window.confirm("Diese Position wirklich löschen?")) return;
    const prev = items;
    setItems(items.filter((it) => it.id !== itemId));
    const res = await fetch(`/api/nka/periods/${period.id}/cost-items/${itemId}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setItems(prev); // Rollback
      setError(data?.error ?? "Position konnte nicht gelöscht werden.");
      return;
    }
    flashInfo("Position gelöscht.");
  };

  // ── Suggest: Vorschläge aus Banking laden ─────────────────────────────────
  const loadSuggestions = async () => {
    setSuggestLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/nka/periods/${period.id}/suggest`);
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Vorschläge konnten nicht geladen werden.");
        return;
      }
      const json = (await res.json()) as NkaSuggestResponse;
      setSuggestions(json.suggestions);
      // Initialauswahl: Position aus Suggestion (User kann pro Zeile Override)
      const initSel: Record<string, BetrkvPosition> = {};
      for (const s of json.suggestions) initSel[s.transaction_id] = s.position;
      setSuggestSelected(initSel);
      flashInfo(
        `${json.suggestions.length} Vorschläge geladen (${json.skipped_already_linked.length} bereits verknüpft).`,
      );
    } finally {
      setSuggestLoading(false);
    }
  };

  const acceptSuggestions = async (txIds: string[]) => {
    if (txIds.length === 0) return;
    const accepted = txIds.map((tid) => ({
      transaction_id: tid,
      position: suggestSelected[tid] ?? "sonstiges",
    }));
    const res = await fetch(
      `/api/nka/periods/${period.id}/cost-items/bulk-from-suggestions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accepted }),
      },
    );
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Übernahme fehlgeschlagen.");
      return;
    }
    const json = (await res.json()) as { created: number; items: NkaEditorCostItem[] };
    setItems((curr) => [...curr, ...(json.items ?? [])]);
    setSuggestions((curr) =>
      curr ? curr.filter((s) => !txIds.includes(s.transaction_id)) : curr,
    );
    flashInfo(`${json.created} Position(en) übernommen.`);
  };

  // ── Versand: Records laden, Vorschau, Senden ──────────────────────────────
  const loadVersandRecords = async () => {
    const res = await fetch(`/api/nka/periods/${period.id}/versand`);
    if (!res.ok) return;
    const json = (await res.json()) as { versand: NkaVersandRecord[] };
    setVersandRecords(json.versand ?? []);
  };

  const requestPreview = async (tenantId: string) => {
    const res = await fetch(`/api/nka/periods/${period.id}/versand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tenant_ids: [tenantId], dry_run: true }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Vorschau konnte nicht erzeugt werden.");
      return null;
    }
    const json = (await res.json()) as {
      results: Array<{
        tenant_id: string;
        status: string;
        preview?: VersandPreview;
        error?: string;
      }>;
    };
    const r = json.results[0];
    if (r?.preview) {
      setVersandPreviews((curr) => ({ ...curr, [tenantId]: r.preview! }));
      return r.preview;
    }
    setError(r?.error ?? "Vorschau leer.");
    return null;
  };

  const openVersandConfirm = async (tenantId: string) => {
    const preview = versandPreviews[tenantId] ?? (await requestPreview(tenantId));
    if (!preview) return;
    setConfirmModal({ tenant_id: tenantId, preview });
  };

  const confirmVersand = async (forceResend = false) => {
    if (!confirmModal) return;
    const tid = confirmModal.tenant_id;
    setVersandLoading(tid);
    setConfirmModal(null);
    // Optimistic: queued
    setVersandRecords((curr) => {
      const without = curr.filter((r) => r.tenant_id !== tid);
      return [
        ...without,
        {
          id: `tmp-${tid}`,
          tenant_id: tid,
          status: "queued",
          status_detail: null,
          sent_at: null,
          delivered_at: null,
          bounced_at: null,
          failed_at: null,
          resend_message_id: null,
        },
      ];
    });
    const res = await fetch(`/api/nka/periods/${period.id}/versand`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(forceResend ? { "X-Force-Resend": "true" } : {}),
      },
      body: JSON.stringify({ tenant_ids: [tid] }),
    });
    setVersandLoading(null);
    if (!res.ok && res.status !== 409) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Versand fehlgeschlagen.");
      await loadVersandRecords();
      return;
    }
    await loadVersandRecords();
    flashInfo("Versand abgeschlossen.");
  };

  // Beim Aktivieren des PDF-/Versand-Tabs: bestehende Versand-Records laden.
  useEffect(() => {
    if (tab === "pdf") void loadVersandRecords();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Distribute ─────────────────────────────────────────────────────────────
  const distribute = async () => {
    setDistributing(true);
    setError(null);
    const res = await fetch(`/api/nka/periods/${period.id}/distribute`, { method: "POST" });
    setDistributing(false);
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Verteilung konnte nicht berechnet werden.");
      return;
    }
    const json = (await res.json()) as DistributeResponse;
    setDistribution(json);
    flashInfo("Verteilung berechnet.");
  };

  // Beim Aktivieren des Tabs: Verteilung aus DB laden, falls nicht im State.
  useEffect(() => {
    if (tab !== "shares" || distribution) return;
    // Wir triggern keinen Auto-Distribute (kostspielig); der Nutzer drückt
    // den Button explizit.
  }, [tab, distribution]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {info}
        </div>
      )}

      {/* Tab-Bar */}
      <div className="flex gap-2 border-b border-slate-200 dark:border-slate-800">
        {[
          { key: "items" as const, label: "Kostenpositionen" },
          { key: "shares" as const, label: "Mieteranteile" },
          { key: "pdf" as const, label: "PDF-Export" },
        ].map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t.key
                ? "border-slate-900 text-slate-900 dark:border-slate-100 dark:text-slate-100"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "items" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Kostenpositionen ({items.length})
            </h2>
            {!creating && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={loadSuggestions}
                  disabled={suggestLoading}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                  data-testid="nka-suggest-load"
                >
                  {suggestLoading ? "Lade…" : "Vorschläge laden"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDraft(emptyDraft());
                    setCreating(true);
                    setError(null);
                  }}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                >
                  + Neue Position
                </button>
              </div>
            )}
          </div>

          {suggestions && suggestions.length > 0 && (
            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/40 dark:bg-blue-950/30">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
                  Vorschläge aus Banking ({suggestions.length})
                </h3>
                <button
                  type="button"
                  onClick={() =>
                    acceptSuggestions(suggestions.map((s) => s.transaction_id))
                  }
                  className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  data-testid="nka-suggest-accept-all"
                >
                  Alle übernehmen
                </button>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-blue-900/70 dark:text-blue-200/70">
                    <tr className="border-b border-blue-200 dark:border-blue-900/40">
                      <th className="py-1 pr-2 text-left">Datum</th>
                      <th className="py-1 pr-2 text-left">Counterpart</th>
                      <th className="py-1 pr-2 text-right">Brutto</th>
                      <th className="py-1 pr-2 text-left">Position</th>
                      <th className="py-1 pr-2 text-left">Confidence</th>
                      <th className="py-1 pr-2 text-right">Aktion</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suggestions.map((s) => (
                      <tr key={s.transaction_id} className="border-b border-blue-100 last:border-b-0 dark:border-blue-900/30">
                        <td className="py-1 pr-2">{s.date}</td>
                        <td className="py-1 pr-2 text-slate-700 dark:text-slate-200">
                          {s.counterpart ?? s.description ?? "—"}
                        </td>
                        <td className="py-1 pr-2 text-right">{fmtCents(s.brutto_cents)}</td>
                        <td className="py-1 pr-2">
                          <select
                            value={suggestSelected[s.transaction_id] ?? s.position}
                            onChange={(e) =>
                              setSuggestSelected((curr) => ({
                                ...curr,
                                [s.transaction_id]: e.target.value as BetrkvPosition,
                              }))
                            }
                            className="rounded border border-slate-300 bg-white px-2 py-0.5 text-xs dark:border-slate-700 dark:bg-slate-900"
                          >
                            {POSITIONS.map((p) => (
                              <option key={p.value} value={p.value}>{p.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="py-1 pr-2 capitalize">{s.confidence}</td>
                        <td className="py-1 pr-2 text-right">
                          <button
                            type="button"
                            onClick={() => acceptSuggestions([s.transaction_id])}
                            className="rounded bg-blue-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-blue-700"
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
          )}

          {suggestions && suggestions.length === 0 && (
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-800/40 dark:text-slate-300">
              Keine neuen Vorschläge gefunden — alle relevanten Banking-Transaktionen sind bereits verlinkt.
            </div>
          )}

          {creating && (
            <CostItemForm
              draft={draft}
              setDraft={setDraft}
              units={units}
              tenants={activeTenants}
              onSubmit={submitDraft}
              onCancel={() => {
                setCreating(false);
                setDraft(emptyDraft());
                setError(null);
              }}
              saving={saving}
            />
          )}

          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3 text-left">Position</th>
                  <th className="py-2 pr-3 text-left">Label</th>
                  <th className="py-2 pr-3 text-right">Brutto</th>
                  <th className="py-2 pr-3 text-right">Umlagef. %</th>
                  <th className="py-2 pr-3 text-left">Schlüssel</th>
                  <th className="py-2 pr-3 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 && (
                  <tr>
                    <td className="py-4 text-slate-500" colSpan={6}>
                      Noch keine Position angelegt.
                    </td>
                  </tr>
                )}
                {items.map((it) => (
                  <tr key={it.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                    <td className="py-2 pr-3">
                      {POSITIONS.find((p) => p.value === it.position)?.label ?? it.position}
                    </td>
                    <td className="py-2 pr-3">{it.label ?? "—"}</td>
                    <td className="py-2 pr-3 text-right">{fmtCents(it.brutto_cents)}</td>
                    <td className="py-2 pr-3 text-right">{fmtDecimal(it.umlagefaehig_pct, 0, 2)} %</td>
                    <td className="py-2 pr-3">
                      {SCHLUESSEL.find((s) => s.value === it.verteilungsschluessel)?.label ?? it.verteilungsschluessel}
                    </td>
                    <td className="py-2 pr-3 text-right">
                      <button
                        type="button"
                        onClick={() => deleteItem(it.id)}
                        className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Löschen
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "shares" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Mieteranteile
            </h2>
            <button
              type="button"
              onClick={distribute}
              disabled={distributing}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              {distributing ? "Berechne…" : "Verteilung berechnen"}
            </button>
          </div>

          {!distribution && (
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
              Drück auf „Verteilung berechnen", um den aktuellen Stand der
              Kostenpositionen auf die Mieter aufzuteilen.
            </p>
          )}

          {distribution && (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <Stat label="Periodendauer" value={`${distribution.period_days} Tage`} />
                <Stat label="Mieter mit Anteil" value={String(distribution.tenant_shares.length)} />
                <Stat
                  label="Restbetrag (Vermieter)"
                  value={fmtCents(
                    Object.values(distribution.unallocated_cents).reduce(
                      (s, v) => s + Number(v ?? 0),
                      0,
                    ),
                  )}
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                    <tr>
                      <th className="py-2 pr-3 text-left">Mieter</th>
                      <th className="py-2 pr-3 text-right">Aktive Tage</th>
                      <th className="py-2 pr-3 text-right">Mieteranteil</th>
                      <th className="py-2 pr-3 text-right">Vorausz.</th>
                      <th className="py-2 pr-3 text-right">Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {distribution.tenant_shares.map((ts) => {
                      const tenant = tenants.find((t) => t.id === ts.tenant_id);
                      return (
                        <TenantShareRow
                          key={ts.tenant_id}
                          name={tenant ? tenantName(tenant) : ts.tenant_id}
                          ts={ts}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {Object.keys(distribution.unallocated_cents).length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-900/40 dark:bg-amber-950/30">
                  <p className="font-medium text-amber-800 dark:text-amber-300">
                    Restbeträge (Leerstand / direct-Mismatch)
                  </p>
                  <ul className="mt-1 space-y-0.5 text-amber-800 dark:text-amber-300">
                    {Object.entries(distribution.unallocated_cents).map(([costItemId, cents]) => {
                      const it = items.find((x) => x.id === costItemId);
                      return (
                        <li key={costItemId}>
                          {it ? `${POSITIONS.find((p) => p.value === it.position)?.label ?? it.position}` : costItemId}:{" "}
                          {fmtCents(Number(cents))}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}

              {distribution.warnings.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-800/50">
                  <p className="font-medium text-slate-700 dark:text-slate-200">Hinweise</p>
                  <ul className="mt-1 space-y-0.5 text-slate-600 dark:text-slate-300">
                    {distribution.warnings.map((w, i) => (
                      <li key={i}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {tab === "pdf" && (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">PDF-Export & Versand</h2>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            PDF zur Vorschau direkt herunterladen oder per E-Mail an den Mieter senden. Status-Updates kommen über
            den Resend-Webhook in Echtzeit zurück.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800">
                <tr>
                  <th className="py-2 pr-3 text-left">Mieter</th>
                  <th className="py-2 pr-3 text-left">E-Mail</th>
                  <th className="py-2 pr-3 text-left">Status</th>
                  <th className="py-2 pr-3 text-right">Aktion</th>
                </tr>
              </thead>
              <tbody>
                {activeTenants.map((t) => {
                  const rec = versandRecords.find((r) => r.tenant_id === t.id);
                  const isLoading = versandLoading === t.id;
                  return (
                    <tr key={t.id} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                      <td className="py-2 pr-3 text-slate-800 dark:text-slate-200">{tenantName(t)}</td>
                      <td className="py-2 pr-3 text-slate-600 dark:text-slate-400">{t.email ?? "—"}</td>
                      <td className="py-2 pr-3">
                        <VersandStatusBadge status={rec?.status ?? null} />
                      </td>
                      <td className="py-2 pr-3 text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            href={`/api/nka/periods/${period.id}/pdf/${t.id}`}
                            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            PDF
                          </a>
                          <button
                            type="button"
                            onClick={() => requestPreview(t.id)}
                            className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            data-testid={`nka-versand-preview-${t.id}`}
                          >
                            Vorschau
                          </button>
                          <button
                            type="button"
                            disabled={isLoading || !t.email}
                            onClick={() => openVersandConfirm(t.id)}
                            className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
                            data-testid={`nka-versand-send-${t.id}`}
                          >
                            {isLoading ? "Sende…" : "Versenden"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {activeTenants.length === 0 && (
                  <tr>
                    <td className="py-3 text-sm text-slate-500" colSpan={4}>
                      Keine aktiven Mieter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {confirmModal && (
            <ConfirmVersandModal
              tenantName={
                tenants.find((t) => t.id === confirmModal.tenant_id)
                  ? tenantName(tenants.find((t) => t.id === confirmModal.tenant_id)!)
                  : confirmModal.tenant_id
              }
              alreadySent={
                versandRecords.find((r) => r.tenant_id === confirmModal.tenant_id)?.status ===
                  "sent" ||
                versandRecords.find((r) => r.tenant_id === confirmModal.tenant_id)?.status ===
                  "delivered"
              }
              preview={confirmModal.preview}
              onCancel={() => setConfirmModal(null)}
              onConfirm={(force) => confirmVersand(force)}
            />
          )}
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
      <div className="text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-1 text-base font-semibold text-slate-900 dark:text-slate-100">{value}</div>
    </div>
  );
}

function TenantShareRow({
  name,
  ts,
}: {
  name: string;
  ts: DistributeResponse["tenant_shares"][number];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer border-b border-slate-100 last:border-b-0 dark:border-slate-800"
        onClick={() => setOpen((v) => !v)}
      >
        <td className="py-2 pr-3 font-medium text-slate-900 dark:text-slate-100">{name}</td>
        <td className="py-2 pr-3 text-right">{ts.active_days}</td>
        <td className="py-2 pr-3 text-right">{fmtCents(ts.total_share_cents)}</td>
        <td className="py-2 pr-3 text-right">{fmtCents(ts.total_paid_advance_cents)}</td>
        <td
          className={`py-2 pr-3 text-right font-medium ${
            ts.balance_cents < 0
              ? "text-red-600 dark:text-red-400"
              : ts.balance_cents > 0
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-slate-500"
          }`}
        >
          {fmtCents(ts.balance_cents)}
        </td>
      </tr>
      {open && (
        <tr className="bg-slate-50 dark:bg-slate-800/30">
          <td colSpan={5} className="px-3 py-2 text-xs">
            <div className="space-y-1">
              {ts.shares.map((s, i) => (
                <div key={i} className="flex justify-between gap-3 text-slate-600 dark:text-slate-300">
                  <span>
                    {s.label} <span className="text-slate-400">({s.schluessel})</span>
                    {s.note ? <span className="ml-1 italic text-slate-400">— {s.note}</span> : null}
                  </span>
                  <span>{fmtCents(s.tenant_share_cents)}</span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Sub-Form: Cost Item ─────────────────────────────────────────────────────

function CostItemForm({
  draft,
  setDraft,
  units,
  tenants,
  onSubmit,
  onCancel,
  saving,
}: {
  draft: NewItemDraft;
  setDraft: (d: NewItemDraft) => void;
  units: NkaEditorUnit[];
  tenants: NkaEditorTenant[];
  onSubmit: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const brutto = parseGermanDecimal(draft.bruttoRaw);
  const brutto_cents = Number.isFinite(brutto) ? Math.round(brutto * 100) : 0;
  const umlagefaehig_cents = computeUmlagefaehigCents(brutto_cents, draft.umlagefaehig_pct);

  return (
    <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="text-sm">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Position</span>
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            value={draft.position}
            onChange={(e) => setDraft({ ...draft, position: e.target.value as BetrkvPosition })}
          >
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Label (optional)</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            value={draft.label}
            onChange={(e) => setDraft({ ...draft, label: e.target.value })}
            placeholder="Frei wählbar"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Brutto (€)</span>
          <input
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            value={draft.bruttoRaw}
            onChange={(e) => setDraft({ ...draft, bruttoRaw: e.target.value })}
            placeholder="z.B. 264,00"
          />
        </label>
        <label className="text-sm">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Umlagefähig %</span>
          <input
            type="number"
            min={0}
            max={100}
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            value={draft.umlagefaehig_pct}
            onChange={(e) => setDraft({ ...draft, umlagefaehig_pct: Number(e.target.value) })}
          />
          <span className="mt-1 block text-xs text-slate-500">
            = {fmtCents(umlagefaehig_cents)} umlagefähig
          </span>
        </label>
        <label className="text-sm md:col-span-2">
          <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">Verteilungsschlüssel</span>
          <select
            className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
            value={draft.schluessel}
            onChange={(e) => setDraft({ ...draft, schluessel: e.target.value as Verteilungsschluessel })}
          >
            {SCHLUESSEL.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {draft.position === "heizung" && (
        <div className="mt-3">
          <label className="text-sm">
            <span className="block text-xs font-medium uppercase tracking-wide text-slate-500">
              Heizung · Verbrauchsanteil % (Default 70, gesetzl. min. 50)
            </span>
            <input
              type="number"
              min={50}
              max={100}
              className="mt-1 w-32 rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
              value={draft.heiz_verbrauch_pct}
              onChange={(e) => setDraft({ ...draft, heiz_verbrauch_pct: Number(e.target.value) })}
            />
          </label>
        </div>
      )}

      {draft.schluessel === "direct" && tenants.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Direkter Anteil pro Mieter (€)
          </p>
          <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2">
            {tenants.map((t) => (
              <label key={t.id} className="text-sm">
                <span className="block text-slate-600 dark:text-slate-300">{tenantName(t)}</span>
                <input
                  className="mt-1 w-full rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                  value={draft.direct_shares[t.id] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      direct_shares: { ...draft.direct_shares, [t.id]: e.target.value },
                    })
                  }
                  placeholder="0,00"
                />
              </label>
            ))}
          </div>
        </div>
      )}

      {draft.schluessel === "consumption" && units.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Verbrauch pro Einheit (von / bis)
          </p>
          <div className="mt-1 grid grid-cols-1 gap-2 md:grid-cols-2">
            {units.map((u) => (
              <div key={u.id} className="rounded border border-slate-200 p-2 text-sm dark:border-slate-700">
                <div className="text-slate-600 dark:text-slate-300">{u.label}</div>
                <div className="mt-1 flex gap-2">
                  <input
                    className="w-1/2 rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                    value={draft.consumption[u.id]?.from ?? ""}
                    placeholder="von"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        consumption: {
                          ...draft.consumption,
                          [u.id]: {
                            from: e.target.value,
                            to: draft.consumption[u.id]?.to ?? "",
                          },
                        },
                      })
                    }
                  />
                  <input
                    className="w-1/2 rounded border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900"
                    value={draft.consumption[u.id]?.to ?? ""}
                    placeholder="bis"
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        consumption: {
                          ...draft.consumption,
                          [u.id]: {
                            from: draft.consumption[u.id]?.from ?? "",
                            to: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
        >
          {saving ? "Speichere…" : "Speichern"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Abbrechen
        </button>
      </div>
    </div>
  );
}

// ─── Versand-Helpers ─────────────────────────────────────────────────────────

function VersandStatusBadge({
  status,
}: {
  status:
    | "queued"
    | "sent"
    | "delivered"
    | "bounced"
    | "complained"
    | "failed"
    | null;
}) {
  if (status === null) {
    return <span className="text-xs text-slate-400">—</span>;
  }
  const map: Record<string, { label: string; cls: string }> = {
    queued: { label: "in Warteschlange", cls: "bg-slate-100 text-slate-700" },
    sent: { label: "gesendet", cls: "bg-blue-100 text-blue-800" },
    delivered: { label: "zugestellt", cls: "bg-emerald-100 text-emerald-800" },
    bounced: { label: "bounced", cls: "bg-red-100 text-red-800" },
    complained: { label: "Beschwerde", cls: "bg-amber-100 text-amber-800" },
    failed: { label: "Fehler", cls: "bg-red-100 text-red-800" },
  };
  const e = map[status] ?? { label: status, cls: "bg-slate-100 text-slate-700" };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${e.cls}`}>
      {e.label}
    </span>
  );
}

function ConfirmVersandModal({
  tenantName,
  preview,
  alreadySent,
  onCancel,
  onConfirm,
}: {
  tenantName: string;
  preview: VersandPreview;
  alreadySent: boolean;
  onCancel: () => void;
  onConfirm: (forceResend: boolean) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-slate-900">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          NKA an {tenantName} senden?
        </h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Empfänger: {preview.recipient_email}
        </p>
        {alreadySent && (
          <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            Achtung: Diese Abrechnung wurde bereits versendet. Erneuter Versand nur mit „Erneut versenden".
          </p>
        )}
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50">
          <p className="font-medium text-slate-700 dark:text-slate-200">Subject</p>
          <p className="mt-0.5 text-slate-600 dark:text-slate-300">{preview.subject}</p>
        </div>
        <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-700 dark:bg-slate-800/50">
          <p className="font-medium text-slate-700 dark:text-slate-200">Body</p>
          <pre className="mt-0.5 whitespace-pre-wrap text-slate-600 dark:text-slate-300">
{preview.body_text}
          </pre>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Abbrechen
          </button>
          {alreadySent ? (
            <button
              type="button"
              onClick={() => onConfirm(true)}
              className="rounded bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
            >
              Erneut versenden
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConfirm(false)}
              className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-white"
            >
              Jetzt versenden
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
