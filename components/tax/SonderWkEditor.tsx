"use client";

/**
 * SonderWkEditor — UI für Sonderwerbungskosten / Sondereinnahmen je
 * GbR-Beteiligten und Steuerjahr.
 *
 * Tabelle: gbr_partner_special_expenses (Migration 20260506).
 *
 * Vorzeichenkonvention (Server normalisiert beim Insert/Update):
 *   - special_income           → amount ≥ 0
 *   - special_expense_interest → amount ≤ 0
 *   - special_expense_other    → amount ≤ 0
 *
 * Der Editor zeigt im Eingabefeld nur den Absolutbetrag — das Vorzeichen
 * folgt aus der gewählten Klassifikation. Optimistic UI mit Rollback bei
 * API-Fehler.
 */

import { useEffect, useState } from "react";
import { fmtDecimal, parseGermanDecimal } from "@/lib/utils/numberFormat";

export type SonderWkClassification =
  | "special_income"
  | "special_expense_interest"
  | "special_expense_other";

export type SonderWkItem = {
  id: string;
  property_id: string;
  gbr_partner_id: string;
  tax_year: number;
  label: string;
  amount: number;
  classification: SonderWkClassification;
  note: string | null;
};

export type SonderWkPartner = {
  id: string;
  name: string;
};

type Props = {
  propertyId: string;
  taxYear: number;
  partners: SonderWkPartner[];
  /** Optional: vorgehydrierte Daten aus dem Server-Component, um Flicker zu vermeiden. */
  initialItems?: SonderWkItem[];
};

const CLASSIFICATION_LABELS: Record<SonderWkClassification, string> = {
  special_income: "Sondereinnahme",
  special_expense_interest: "Sonderwerbungskosten — Schuldzinsen",
  special_expense_other: "Sonderwerbungskosten — sonstige",
};

const CLASSIFICATION_BADGE: Record<SonderWkClassification, string> = {
  special_income: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  special_expense_interest: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  special_expense_other: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
};

const fmtEur = (value: number) =>
  value.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

type DraftForm = {
  gbr_partner_id: string;
  label: string;
  amountRaw: string;
  classification: SonderWkClassification;
  note: string;
};

const emptyDraft = (firstPartnerId: string): DraftForm => ({
  gbr_partner_id: firstPartnerId,
  label: "",
  amountRaw: "",
  classification: "special_expense_interest",
  note: "",
});

export default function SonderWkEditor({
  propertyId,
  taxYear,
  partners,
  initialItems,
}: Props) {
  const [items, setItems] = useState<SonderWkItem[]>(initialItems ?? []);
  const [loading, setLoading] = useState<boolean>(initialItems == null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<DraftForm>(() => emptyDraft(partners[0]?.id ?? ""));
  const [saving, setSaving] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<DraftForm | null>(null);

  // Initiale Items laden, falls nicht vom Server vorhydriert.
  useEffect(() => {
    if (initialItems != null) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/tax/sonder-wk?property_id=${propertyId}&tax_year=${taxYear}`,
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!cancelled) setError(data?.error ?? "Sonder-WK konnten nicht geladen werden.");
          return;
        }
        const list = (await res.json()) as SonderWkItem[];
        if (!cancelled) setItems(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [initialItems, propertyId, taxYear]);

  const partnerName = (partnerId: string) => {
    const found = partners.find((p) => p.id === partnerId);
    return found?.name ?? "—";
  };

  const flashInfo = (msg: string) => {
    setInfo(msg);
    setTimeout(() => setInfo(null), 2000);
  };

  const startCreate = () => {
    setError(null);
    setDraft(emptyDraft(partners[0]?.id ?? ""));
    setCreating(true);
  };

  const cancelCreate = () => {
    setCreating(false);
    setDraft(emptyDraft(partners[0]?.id ?? ""));
  };

  const submitCreate = async () => {
    if (!draft.gbr_partner_id) {
      setError("Bitte einen Beteiligten auswählen.");
      return;
    }
    if (!draft.label.trim()) {
      setError("Bitte ein Label angeben.");
      return;
    }
    const parsed = parseGermanDecimal(draft.amountRaw);
    if (Number.isNaN(parsed)) {
      setError("Betrag ist keine gültige Zahl.");
      return;
    }
    setSaving(true);
    setError(null);

    // Optimistic insert mit Temp-ID.
    const tempId = `tmp-${Math.random().toString(36).slice(2)}`;
    const optimistic: SonderWkItem = {
      id: tempId,
      property_id: propertyId,
      gbr_partner_id: draft.gbr_partner_id,
      tax_year: taxYear,
      label: draft.label.trim(),
      amount: draft.classification === "special_income" ? Math.abs(parsed) : -Math.abs(parsed),
      classification: draft.classification,
      note: draft.note.trim() || null,
    };
    const prevItems = items;
    setItems([...items, optimistic]);

    const res = await fetch("/api/tax/sonder-wk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id: propertyId,
        gbr_partner_id: draft.gbr_partner_id,
        tax_year: taxYear,
        label: optimistic.label,
        amount: parsed,
        classification: draft.classification,
        note: optimistic.note,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setItems(prevItems); // Rollback
      setError(data?.error ?? "Eintrag konnte nicht gespeichert werden.");
      return;
    }

    const created = (await res.json()) as SonderWkItem;
    setItems((prev) => prev.map((it) => (it.id === tempId ? created : it)));
    setCreating(false);
    setDraft(emptyDraft(partners[0]?.id ?? ""));
    flashInfo("Eintrag gespeichert.");
  };

  const startEdit = (item: SonderWkItem) => {
    setError(null);
    setEditingId(item.id);
    setEditDraft({
      gbr_partner_id: item.gbr_partner_id,
      label: item.label,
      amountRaw: fmtDecimal(Math.abs(item.amount), 2, 2),
      classification: item.classification,
      note: item.note ?? "",
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(null);
  };

  const submitEdit = async (id: string) => {
    if (!editDraft) return;
    if (!editDraft.label.trim()) {
      setError("Bitte ein Label angeben.");
      return;
    }
    const parsed = parseGermanDecimal(editDraft.amountRaw);
    if (Number.isNaN(parsed)) {
      setError("Betrag ist keine gültige Zahl.");
      return;
    }
    setSaving(true);
    setError(null);

    const prevItems = items;
    const normalizedAmount =
      editDraft.classification === "special_income" ? Math.abs(parsed) : -Math.abs(parsed);
    setItems((prev) =>
      prev.map((it) =>
        it.id === id
          ? {
              ...it,
              label: editDraft.label.trim(),
              amount: normalizedAmount,
              classification: editDraft.classification,
              note: editDraft.note.trim() || null,
            }
          : it,
      ),
    );

    const res = await fetch(`/api/tax/sonder-wk/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: editDraft.label.trim(),
        amount: parsed,
        classification: editDraft.classification,
        note: editDraft.note.trim() || null,
      }),
    });

    setSaving(false);

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setItems(prevItems); // Rollback
      setError(data?.error ?? "Eintrag konnte nicht aktualisiert werden.");
      return;
    }

    const updated = (await res.json()) as SonderWkItem;
    setItems((prev) => prev.map((it) => (it.id === id ? updated : it)));
    cancelEdit();
    flashInfo("Eintrag aktualisiert.");
  };

  const deleteItem = async (id: string) => {
    const item = items.find((it) => it.id === id);
    if (!item) return;
    const ok = window.confirm(
      `Eintrag "${item.label}" für ${partnerName(item.gbr_partner_id)} wirklich löschen?`,
    );
    if (!ok) return;

    setError(null);
    const prevItems = items;
    setItems((prev) => prev.filter((it) => it.id !== id));

    const res = await fetch(`/api/tax/sonder-wk/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setItems(prevItems);
      setError(data?.error ?? "Eintrag konnte nicht gelöscht werden.");
      return;
    }
    flashInfo("Eintrag gelöscht.");
  };

  const noPartners = partners.length === 0;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Sondereinnahmen / Sonderwerbungskosten je Beteiligten
          </h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Itemisierte Werte je GbR-Partner für die Anlage FE/FB ({taxYear}).
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={creating || noPartners}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          Neuer Eintrag
        </button>
      </div>

      {error && (
        <p className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </p>
      )}
      {info && (
        <p className="mx-5 mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
          {info}
        </p>
      )}
      {noPartners && (
        <p className="mx-5 mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
          Es sind keine GbR-Partner hinterlegt. Bitte Partner in den GbR-Einstellungen anlegen.
        </p>
      )}

      {creating && (
        <DraftFormPanel
          mode="create"
          partners={partners}
          draft={draft}
          onChange={setDraft}
          onCancel={cancelCreate}
          onSubmit={() => void submitCreate()}
          saving={saving}
        />
      )}

      {loading ? (
        <p className="px-5 py-5 text-sm text-slate-500 dark:text-slate-400">Lade Einträge…</p>
      ) : items.length === 0 ? (
        <p className="px-5 py-5 text-sm text-slate-500 dark:text-slate-400">
          Keine Sondereinnahmen oder Sonderwerbungskosten für {taxYear} hinterlegt.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Beteiligter</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Label</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Betrag</th>
                <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Klassifikation</th>
                <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Aktionen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => {
                const isEditing = editingId === item.id;
                if (isEditing && editDraft) {
                  return (
                    <tr key={item.id} className="bg-slate-50/60 dark:bg-slate-800/30">
                      <td colSpan={5} className="px-4 py-4">
                        <DraftFormPanel
                          mode="edit"
                          partners={partners}
                          draft={editDraft}
                          onChange={(d) => setEditDraft(d)}
                          onCancel={cancelEdit}
                          onSubmit={() => void submitEdit(item.id)}
                          saving={saving}
                          /* Beteiligter ist beim Edit fix (sonst müsste Server validieren) */
                          partnerLocked
                        />
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={item.id}>
                    <td className="px-4 py-3 text-slate-900 dark:text-slate-100">
                      {partnerName(item.gbr_partner_id)}
                    </td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300">
                      <p>{item.label}</p>
                      {item.note && (
                        <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">{item.note}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700 dark:text-slate-300">
                      {fmtEur(item.amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${CLASSIFICATION_BADGE[item.classification]}`}
                      >
                        {CLASSIFICATION_LABELS[item.classification]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(item)}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Bearbeiten
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteItem(item.id)}
                          className="rounded-lg border border-red-200 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/30"
                        >
                          Löschen
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function DraftFormPanel({
  mode,
  partners,
  draft,
  onChange,
  onCancel,
  onSubmit,
  saving,
  partnerLocked = false,
}: {
  mode: "create" | "edit";
  partners: SonderWkPartner[];
  draft: DraftForm;
  onChange: (next: DraftForm) => void;
  onCancel: () => void;
  onSubmit: () => void;
  saving: boolean;
  partnerLocked?: boolean;
}) {
  return (
    <div className="grid gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/40 md:grid-cols-2">
      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
        Beteiligter
        <select
          value={draft.gbr_partner_id}
          disabled={partnerLocked}
          onChange={(e) => onChange({ ...draft, gbr_partner_id: e.target.value })}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          {partners.length === 0 && <option value="">— keine Partner —</option>}
          {partners.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>

      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
        Klassifikation
        <select
          value={draft.classification}
          onChange={(e) =>
            onChange({ ...draft, classification: e.target.value as SonderWkClassification })
          }
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        >
          <option value="special_expense_interest">Sonderwerbungskosten — Schuldzinsen</option>
          <option value="special_expense_other">Sonderwerbungskosten — sonstige</option>
          <option value="special_income">Sondereinnahme</option>
        </select>
      </label>

      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
        Label
        <input
          type="text"
          maxLength={200}
          value={draft.label}
          onChange={(e) => onChange({ ...draft, label: e.target.value })}
          placeholder="z.B. Eigenfinanzierte Schuldzinsen Bank XY"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
        Betrag (€)
        <input
          type="text"
          inputMode="decimal"
          value={draft.amountRaw}
          onChange={(e) => onChange({ ...draft, amountRaw: e.target.value })}
          placeholder="0,00"
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-right text-sm tabular-nums text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
        <span className="mt-1 block text-[11px] text-slate-400 dark:text-slate-500">
          Absolutwert eingeben — Vorzeichen folgt aus der Klassifikation.
        </span>
      </label>

      <label className="text-xs font-medium text-slate-600 dark:text-slate-300 md:col-span-2">
        Notiz (optional)
        <textarea
          value={draft.note}
          onChange={(e) => onChange({ ...draft, note: e.target.value })}
          rows={2}
          maxLength={2000}
          className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
        />
      </label>

      <div className="flex justify-end gap-2 md:col-span-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-white dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-900"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={onSubmit}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? "Speichern…" : mode === "create" ? "Anlegen" : "Speichern"}
        </button>
      </div>
    </div>
  );
}
