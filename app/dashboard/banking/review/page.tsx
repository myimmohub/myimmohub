"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import {
  ANLAGE_V_CATEGORY_LABELS,
  ANLAGE_V_ZEILEN,
  TAX_DEDUCTIBLE,
  type AnlageVCategory,
} from "@/lib/banking/categorizeTransaction";
import {
  loadCategoryLookup,
  getCategoryVariant as getCategoryVariantFromLookup,
  type CategoryLookup,
  type BadgeVariant,
} from "@/lib/banking/categoryLookup";
import ReceiptButton from "@/components/banking/ReceiptButton";

// ── Typen ─────────────────────────────────────────────────────────────────────

type Transaction = {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  counterpart: string | null;
  category: string | null;
  confidence: number | null;
  is_tax_deductible: boolean | null;
  anlage_v_zeile: number | null;
  is_confirmed: boolean;
  property_id: string | null;
  split_from_transaction_id: string | null;
  property?: { name: string } | null;
  receipt: { id: string; filename: string } | null;
};

type Property = { id: string; name: string };
type SplitDraft = { interestAmount: string; principalAmount: string };
type ViewMode = "list" | "grouped" | "kreditraten";

// ── Kategorie-Gruppen ─────────────────────────────────────────────────────────

const BADGE: Record<BadgeVariant, string> = {
  einnahmen:       "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
  werbungskosten:  "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400",
  nicht_absetzbar: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
  unbekannt:       "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400",
};

// ── Kredit-Erkennung ──────────────────────────────────────────────────────────

const KREDIT_RE =
  /annuit[äa]t|kreditrate|darlehensrate|tilgung.{0,10}zins|zins.{0,10}tilgung|rate.{0,6}darlehen/i;

function looksLikeCredit(tx: Transaction): boolean {
  if (tx.split_from_transaction_id || tx.category === "aufgeteilt") return false;
  // KI hat es bereits als Kredit-Kategorie eingestuft → immer aufteilen anbieten
  if (tx.category === "tilgung_kredit" || tx.category === "schuldzinsen") return true;
  return KREDIT_RE.test(`${tx.description ?? ""} ${tx.counterpart ?? ""}`);
}

// ── Formatierung ──────────────────────────────────────────────────────────────

const fmt     = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

// ── Kategorie-Dropdown (wiederverwendbar) ─────────────────────────────────────

function CategorySelect({
  value, onChange, className = "", catLookup,
}: { value: string; onChange: (v: string) => void; className?: string; catLookup: CategoryLookup | null }) {
  // DB categories grouped
  if (catLookup && catLookup.categories.length > 0) {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${className}`}
      >
        <option value="">— Keine Kategorie —</option>
        {catLookup.grouped.map((g) => (
          <optgroup key={g.gruppe} label={g.gruppe}>
            {g.items.map((c) => (
              <option key={c.id} value={c.label}>
                {c.icon} {c.label}{c.anlage_v ? ` (${c.anlage_v})` : ""}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    );
  }

  // Fallback: old hardcoded categories (if DB not yet seeded)
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 ${className}`}
    >
      <option value="">— Keine Kategorie —</option>
      {Object.entries(ANLAGE_V_CATEGORY_LABELS).map(([key, label]) => (
        <option key={key} value={key}>{label}</option>
      ))}
    </select>
  );
}

// ── Hauptkomponente ───────────────────────────────────────────────────────────

export default function BankingReviewPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [properties, setProperties]     = useState<Property[]>([]);
  const [loading, setLoading]           = useState(true);
  const [confirmed, setConfirmed]       = useState<Set<string>>(new Set());
  const [catLookup, setCatLookup]       = useState<CategoryLookup | null>(null);

  // View-Modus
  const [viewMode, setViewMode] = useState<ViewMode>("list");

  // Einzel-Edit
  const [editingId, setEditingId]         = useState<string | null>(null);
  const [editCategory, setEditCategory]   = useState("");
  const [editPropertyId, setEditPropertyId] = useState("");

  // Split
  const [splitId, setSplitId]     = useState<string | null>(null);
  const [splitDraft, setSplitDraft] = useState<SplitDraft>({ interestAmount: "", principalAmount: "" });
  const [splitError, setSplitError] = useState<string | null>(null);
  const [unsplitting, setUnsplitting] = useState<string | null>(null); // ID der Kind-Tx die gerade zurückgesetzt wird
  const [pendingSplitId, setPendingSplitId] = useState<string | null>(null); // nach Reload split-Dialog öffnen

  // Gruppen-Edit (einzelne Gruppe)
  const [groupEditing, setGroupEditing]       = useState<string | null>(null); // counterpart-Key
  const [groupCategory, setGroupCategory]     = useState("");
  const [groupPropertyId, setGroupPropertyId] = useState("");
  const [groupSaving, setGroupSaving]         = useState(false);

  // Globales Gruppen-Mapping (alle Gruppen auf einmal)
  const [globalGroupOpen, setGlobalGroupOpen]         = useState(false);
  const [globalGroupCategory, setGlobalGroupCategory] = useState("");
  const [globalGroupPropertyId, setGlobalGroupPropertyId] = useState("");
  const [globalGroupSaving, setGlobalGroupSaving]     = useState(false);

  // Globale Aktionen
  const [savingId, setSavingId]           = useState<string | null>(null);
  const [batchConfirming, setBatchConfirming] = useState(false);
  const [batchResult, setBatchResult]     = useState<number | null>(null);
  const [saveError, setSaveError]         = useState<string | null>(null);
  const [loadError, setLoadError]         = useState<string | null>(null);

  // KI-Kategorisierung
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiResult, setAiResult]             = useState<{ categorized: number; errors: number; firstError: string | null } | null>(null);

  // Detail-Expansion (Verwendungszweck)
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Mehrfachauswahl
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = useState("");
  const [bulkPropertyId, setBulkPropertyId] = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // ── Daten laden ─────────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    setSelectedIds(new Set());
    setLoading(true);
    setLoadError(null);
    setBatchResult(null);

    // Kategorien aus DB laden
    try {
      const lookup = await loadCategoryLookup();
      setCatLookup(lookup);
    } catch { /* Fallback auf alte Konstanten */ }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Basis-Spalten die in jeder Migration vorhanden sind
    const baseSelect = [
      "id", "date", "amount", "description", "counterpart",
      "category", "property_id", "property:properties(name)",
    ];
    // Erweiterte Spalten aus späteren Migrationen — werden separat abgefragt
    // um bei fehlenden Spalten dennoch die Grunddaten anzeigen zu können.
    const extendedSelect = [...baseSelect,
      "confidence", "is_tax_deductible", "anlage_v_zeile", "split_from_transaction_id", "is_confirmed",
      "receipts!receipts_transaction_id_fkey(id, filename)",
    ];

    const [{ data: txData, error: txError }, { data: propData }] = await Promise.all([
      supabase
        .from("transactions")
        .select(extendedSelect.join(", "))
        .eq("user_id", user.id)
        // NULL-sichere Filterung: .neq() schließt NULLs aus, daher .or() verwenden
        .or("category.is.null,category.neq.aufgeteilt")
        .order("date", { ascending: false }),
      supabase.from("properties").select("id, name").eq("user_id", user.id).order("name"),
    ]);

    if (txError) {
      // Fallback: ohne erweiterte Spalten versuchen (falls Migration noch nicht ausgeführt)
      const { data: fallbackData, error: fallbackError } = await supabase
        .from("transactions")
        .select(baseSelect.join(", "))
        .eq("user_id", user.id)
        .or("category.is.null,category.neq.aufgeteilt")
        .order("date", { ascending: false });

      if (fallbackError) {
        setLoadError(`Transaktionen konnten nicht geladen werden: ${fallbackError.message}`);
        setLoading(false);
        return;
      }

      setLoadError(
        "Hinweis: Einige Datenbank-Spalten fehlen noch. Bitte die SQL-Migrationen in Supabase ausführen " +
        "(is_tax_deductible, anlage_v_zeile, confidence, split_from_transaction_id).",
      );
      const txs: Transaction[] = ((fallbackData as unknown as Omit<Transaction, "receipt">[]) ?? []).map((t) => ({ ...t, receipt: null }));
      setTransactions(txs);
      setProperties(propData ?? []);
      setConfirmed(new Set(txs.filter((t) => t.is_confirmed).map((t) => t.id)));
      setLoading(false);
      return;
    }

    const rawTxs = (txData as unknown as (Omit<Transaction, "receipt"> & { receipts?: { id: string; filename: string }[] })[]) ?? [];
    const txs: Transaction[] = rawTxs.map((tx) => ({
      ...tx,
      receipt: tx.receipts?.[0] ?? null,
    }));
    setTransactions(txs);
    setProperties(propData ?? []);
    setConfirmed(new Set(txs.filter((t) => t.category !== null).map((t) => t.id)));
    setLoading(false);
  }, []);

  useEffect(() => { void loadData(); }, [loadData]);

  // ── Kategorie-Helfer (DB-first, Fallback auf alte Konstanten) ──────────────
  const getCatLabel = useCallback((cat: string | null): string => {
    if (!cat) return "Nicht kategorisiert";
    if (catLookup) {
      const dbCat = catLookup.byLabel.get(cat);
      if (dbCat) return `${dbCat.icon} ${dbCat.label}`;
    }
    return ANLAGE_V_CATEGORY_LABELS[cat as AnlageVCategory] ?? cat;
  }, [catLookup]);

  const getCatAnlageV = useCallback((cat: string | null): string | null => {
    if (!cat) return null;
    if (catLookup) {
      const dbCat = catLookup.byLabel.get(cat);
      if (dbCat) return dbCat.anlage_v;
    }
    const z = ANLAGE_V_ZEILEN[cat as AnlageVCategory];
    return z != null ? `Z. ${z}` : null;
  }, [catLookup]);

  const getCatTaxDeductible = useCallback((cat: string | null): boolean | null => {
    if (!cat) return null;
    if (catLookup) {
      const dbCat = catLookup.byLabel.get(cat);
      if (dbCat) return dbCat.typ === "ausgabe";
    }
    return TAX_DEDUCTIBLE[cat as AnlageVCategory] ?? null;
  }, [catLookup]);

  const getCatAnlageVZeile = useCallback((cat: string | null): number | null => {
    if (!cat) return null;
    if (catLookup) {
      const dbCat = catLookup.byLabel.get(cat);
      if (dbCat && dbCat.anlage_v) {
        const match = dbCat.anlage_v.match(/(\d+)/);
        return match ? parseInt(match[1]) : null;
      }
    }
    return ANLAGE_V_ZEILEN[cat as AnlageVCategory] ?? null;
  }, [catLookup]);

  const getVariant = useCallback((cat: string | null): BadgeVariant => {
    return getCategoryVariantFromLookup(cat, catLookup ?? undefined);
  }, [catLookup]);

  // Nach Unsplit: Split-Dialog auf dem Original-Eintrag öffnen sobald er geladen ist
  useEffect(() => {
    if (!pendingSplitId || transactions.length === 0) return;
    const tx = transactions.find((t) => t.id === pendingSplitId);
    if (tx) {
      startSplit(tx);
      setPendingSplitId(null);
    }
  // startSplit ist stabil (keine externen deps) — kein Lint-Problem
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSplitId, transactions]);

  // ── Berechnungen ─────────────────────────────────────────────────────────────
  const total     = transactions.length;
  const doneCount = confirmed.size;
  const progress  = total === 0 ? 100 : Math.round((doneCount / total) * 100);

  // Transaktionen die für "Alle bestätigen" in Frage kommen
  const batchEligible = useMemo(
    () => transactions.filter(
      (tx) => tx.category && !confirmed.has(tx.id) && (tx.confidence ?? 0) > 0.85,
    ),
    [transactions, confirmed],
  );

  // Erkannte Kreditraten die noch nicht aufgeteilt wurden
  const unsplitCredits = useMemo(
    () => transactions.filter((tx) => looksLikeCredit(tx)),
    [transactions],
  );

  // Anzuzeigende Transaktionen je nach View-Modus
  const displayedTxs = useMemo(() => {
    if (viewMode === "kreditraten") return unsplitCredits;
    return transactions;
  }, [viewMode, transactions, unsplitCredits]);

  // Gruppiert nach Auftraggeber (für Grouped-View)
  const grouped = useMemo<[string, Transaction[]][]>(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of displayedTxs) {
      const key = tx.counterpart?.trim() || "(kein Auftraggeber)";
      const arr = map.get(key) ?? [];
      arr.push(tx);
      map.set(key, arr);
    }
    // Sortierung: Gruppen mit offenen Transaktionen zuerst, dann nach Größe
    return [...map.entries()].sort((a, b) => {
      const aOpen = a[1].filter((t) => !confirmed.has(t.id)).length;
      const bOpen = b[1].filter((t) => !confirmed.has(t.id)).length;
      if (bOpen !== aOpen) return bOpen - aOpen;
      return b[1].length - a[1].length;
    });
  }, [displayedTxs, confirmed]);

  // ── Alle bestätigen (confidence > 0.85) ──────────────────────────────────────
  const handleBatchConfirm = async () => {
    if (batchEligible.length === 0) return;
    setBatchConfirming(true);
    setSaveError(null);

    const updates = batchEligible.map((tx) => {
      return supabase
        .from("transactions")
        .update({
          is_tax_deductible: getCatTaxDeductible(tx.category) ?? null,
          anlage_v_zeile:    getCatAnlageVZeile(tx.category) ?? null,
          is_confirmed:      true,
        })
        .eq("id", tx.id);
    });

    const results = await Promise.all(updates);
    const errors  = results.filter((r) => r.error);
    const successIds = batchEligible
      .filter((_, i) => !results[i].error)
      .map((tx) => tx.id);

    setBatchConfirming(false);

    if (errors.length > 0) {
      setSaveError(`${errors.length} Transaktionen konnten nicht bestätigt werden.`);
    }

    if (successIds.length > 0) {
      setConfirmed((prev) => {
        const next = new Set(prev);
        successIds.forEach((id) => next.add(id));
        return next;
      });
      setBatchResult(successIds.length);
    }
  };

  // ── KI-Kategorisierung ───────────────────────────────────────────────────────
  const uncategorizedCount = useMemo(
    () => transactions.filter((tx) => !tx.category).length,
    [transactions],
  );

  const handleAiCategorize = async (force = false) => {
    setAiCategorizing(true);
    setAiResult(null);
    setSaveError(null);
    const res = await fetch(`/api/banking/categorize${force ? "?force=true" : ""}`, {
      method: "POST",
    });
    setAiCategorizing(false);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setSaveError(body.error ?? "KI-Kategorisierung fehlgeschlagen.");
      return;
    }
    const body = (await res.json()) as { total: number; categorized: number; errors: number; firstError: string | null };
    setAiResult({ categorized: body.categorized, errors: body.errors, firstError: body.firstError ?? null });
    await loadData();
  };

  // ── Mehrfachauswahl speichern ────────────────────────────────────────────────
  const handleBulkSave = async () => {
    if (selectedIds.size === 0) return;
    if (!bulkCategory && !bulkPropertyId) return;
    setBulkSaving(true);
    setSaveError(null);

    const cat = bulkCategory as AnlageVCategory;
    const updates = Array.from(selectedIds).map((txId) => {
      const payload: Record<string, unknown> = {};
      if (bulkCategory) {
        payload.category          = cat;
        payload.is_tax_deductible = getCatTaxDeductible(cat) ?? null;
        payload.anlage_v_zeile    = getCatAnlageVZeile(cat) ?? null;
        payload.is_confirmed      = true;
      }
      if (bulkPropertyId !== "") {
        payload.property_id = bulkPropertyId === "__clear__" ? null : bulkPropertyId;
      }
      return supabase.from("transactions").update(payload).eq("id", txId);
    });

    const results = await Promise.all(updates);
    const errors = results.filter((r) => r.error);
    setBulkSaving(false);
    if (errors.length > 0) {
      setSaveError(`${errors.length} Transaktionen konnten nicht gespeichert werden.`);
    }
    setSelectedIds(new Set());
    setBulkCategory("");
    setBulkPropertyId("");
    await loadData();
  };

  // ── Mehrfachauswahl löschen ──────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    setSaveError(null);

    const ids = Array.from(selectedIds);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBulkDeleting(false); return; }

    const { error } = await supabase
      .from("transactions")
      .delete()
      .in("id", ids)
      .eq("user_id", user.id);

    setBulkDeleting(false);
    setBulkDeleteConfirm(false);

    if (error) {
      setSaveError(`Löschen fehlgeschlagen: ${error.message}`);
      return;
    }

    setSelectedIds(new Set());
    setBulkCategory("");
    setBulkPropertyId("");
    await loadData();
  };

  // ── Einzel bestätigen ─────────────────────────────────────────────────────────
  const handleConfirm = async (tx: Transaction) => {
    if (!tx.category) return;
    setSavingId(tx.id);
    setSaveError(null);
    const cat = tx.category as AnlageVCategory;
    const { error } = await supabase
      .from("transactions")
      .update({
        is_tax_deductible: getCatTaxDeductible(cat) ?? null,
        anlage_v_zeile:    getCatAnlageVZeile(cat) ?? null,
        is_confirmed:      true,
      })
      .eq("id", tx.id);
    setSavingId(null);
    if (error) { setSaveError(error.message); return; }
    setConfirmed((prev) => new Set(prev).add(tx.id));
    setTransactions((prev) =>
      prev.map((t) => t.id === tx.id
        ? { ...t, is_tax_deductible: getCatTaxDeductible(cat) ?? null, anlage_v_zeile: getCatAnlageVZeile(cat) ?? null, is_confirmed: true }
        : t),
    );
  };

  // ── Einzel speichern ─────────────────────────────────────────────────────────
  const handleSaveEdit = async (txId: string) => {
    setSavingId(txId);
    setSaveError(null);
    const cat = editCategory as AnlageVCategory;

    // Basis-Update (immer verfügbar)
    const updatePayload: Record<string, unknown> = {
      category:    cat || null,
      property_id: editPropertyId || null,
    };

    // Erweiterte Felder nur hinzufügen wenn die Spalten laut loadData existieren
    const hasExtendedColumns = !loadError?.includes("fehlen noch");
    if (hasExtendedColumns && cat) {
      updatePayload.is_tax_deductible = getCatTaxDeductible(cat) ?? null;
      updatePayload.anlage_v_zeile    = getCatAnlageVZeile(cat) ?? null;
      updatePayload.is_confirmed      = true;
    }

    const { error } = await supabase
      .from("transactions")
      .update(updatePayload)
      .eq("id", txId);

    setSavingId(null);
    if (error) {
      setSaveError(`Speichern fehlgeschlagen: ${error.message}`);
      return;
    }
    setTransactions((prev) =>
      prev.map((t) => t.id === txId
        ? { ...t, category: cat || null, property_id: editPropertyId || null,
            is_tax_deductible: cat ? (getCatTaxDeductible(cat) ?? null) : null,
            anlage_v_zeile:    cat ? (getCatAnlageVZeile(cat) ?? null) : null,
            is_confirmed:      !!cat }
        : t),
    );
    if (cat) setConfirmed((prev) => new Set(prev).add(txId));
    setEditingId(null);
  };

  const startEdit = (tx: Transaction) => {
    setSplitId(null);
    setEditingId(tx.id);
    setEditCategory(tx.category ?? "");
    setEditPropertyId(tx.property_id ?? "");
  };

  // ── Gruppen-Edit: alle Transaktionen einer Gruppe auf einmal ─────────────────
  const handleGroupSave = async (counterpartKey: string, txIds: string[]) => {
    if (!groupCategory) return;
    setGroupSaving(true);
    setSaveError(null);
    const cat = groupCategory as AnlageVCategory;

    const hasExtendedColumns = !loadError?.includes("fehlen noch");
    const groupPayload: Record<string, unknown> = {
      category:    cat,
      property_id: groupPropertyId || null,
    };
    if (hasExtendedColumns) {
      groupPayload.is_tax_deductible = getCatTaxDeductible(cat) ?? null;
      groupPayload.anlage_v_zeile    = getCatAnlageVZeile(cat) ?? null;
    }

    const updates = txIds.map((id) =>
      supabase.from("transactions").update(groupPayload).eq("id", id),
    );

    const results = await Promise.all(updates);
    const errors  = results.filter((r) => r.error);
    const successIds = txIds.filter((_, i) => !results[i].error);

    setGroupSaving(false);

    if (errors.length > 0) {
      setSaveError(`${errors.length} Transaktionen konnten nicht gespeichert werden.`);
    }

    if (successIds.length > 0) {
      setTransactions((prev) =>
        prev.map((t) => successIds.includes(t.id)
          ? { ...t, category: cat, property_id: groupPropertyId || null,
              is_tax_deductible: getCatTaxDeductible(cat) ?? null,
              anlage_v_zeile:    getCatAnlageVZeile(cat) ?? null }
          : t),
      );
      setConfirmed((prev) => {
        const next = new Set(prev);
        successIds.forEach((id) => next.add(id));
        return next;
      });
    }

    setGroupEditing(null);
    void counterpartKey; // suppress unused-var
  };

  // ── Globales Gruppen-Mapping: alle sichtbaren Transaktionen auf einmal ─────────
  const handleGlobalGroupSave = async () => {
    if (!globalGroupCategory) return;
    setGlobalGroupSaving(true);
    setSaveError(null);
    const cat = globalGroupCategory as AnlageVCategory;
    const hasExtendedColumns = !loadError?.includes("fehlen noch");

    const payload: Record<string, unknown> = {
      category:    cat,
      property_id: globalGroupPropertyId || null,
      is_confirmed: true,
    };
    if (hasExtendedColumns) {
      payload.is_tax_deductible = getCatTaxDeductible(cat) ?? null;
      payload.anlage_v_zeile    = getCatAnlageVZeile(cat) ?? null;
    }

    const allIds = displayedTxs.map((t) => t.id);
    const updates = allIds.map((id) =>
      supabase.from("transactions").update(payload).eq("id", id),
    );
    const results = await Promise.all(updates);
    const successIds = allIds.filter((_, i) => !results[i].error);

    setGlobalGroupSaving(false);
    setGlobalGroupOpen(false);
    setGlobalGroupCategory("");

    if (successIds.length > 0) {
      setTransactions((prev) =>
        prev.map((t) =>
          successIds.includes(t.id)
            ? { ...t, category: cat, property_id: globalGroupPropertyId || null,
                is_tax_deductible: getCatTaxDeductible(cat) ?? null,
                anlage_v_zeile: getCatAnlageVZeile(cat) ?? null,
                is_confirmed: true }
            : t,
        ),
      );
      setConfirmed((prev) => {
        const next = new Set(prev);
        successIds.forEach((id) => next.add(id));
        return next;
      });
    }

    const errorCount = results.filter((r) => r.error).length;
    if (errorCount > 0) setSaveError(`${errorCount} Transaktionen konnten nicht gespeichert werden.`);
  };

  // ── Aufteilen ─────────────────────────────────────────────────────────────────
  const handleInterestChange = (txAmount: number, value: string) => {
    const interest  = parseFloat(value.replace(",", ".")) || 0;
    const principal = Math.max(0, Math.abs(txAmount) - interest);
    setSplitDraft({ interestAmount: value, principalAmount: principal.toFixed(2) });
  };

  const handlePrincipalChange = (txAmount: number, value: string) => {
    const principal = parseFloat(value.replace(",", ".")) || 0;
    const interest  = Math.max(0, Math.abs(txAmount) - principal);
    setSplitDraft({ interestAmount: interest.toFixed(2), principalAmount: value });
  };

  const handleSplit = async (tx: Transaction) => {
    setSplitError(null);
    const interest  = parseFloat(splitDraft.interestAmount.replace(",", "."));
    const principal = parseFloat(splitDraft.principalAmount.replace(",", "."));
    if (isNaN(interest) || isNaN(principal)) { setSplitError("Bitte gültige Beträge eingeben."); return; }

    setSavingId(tx.id);
    const res = await fetch("/api/banking/split-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: tx.id, interestAmount: interest, principalAmount: principal }),
    });
    setSavingId(null);

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setSplitError(body.error ?? "Aufteilen fehlgeschlagen.");
      return;
    }
    setSplitId(null);
    await loadData();
  };

  const startSplit = (tx: Transaction) => {
    setEditingId(null);
    setGroupEditing(null);
    setSplitId(tx.id);
    setSplitDraft({ interestAmount: "", principalAmount: String(Math.abs(Number(tx.amount))) });
    setSplitError(null);
  };

  // ── Aufteilung rückgängig + neu öffnen ───────────────────────────────────────
  const handleUnsplit = async (tx: Transaction) => {
    if (!tx.split_from_transaction_id) return;
    setUnsplitting(tx.id);
    setSaveError(null);
    const res = await fetch("/api/banking/unsplit-transaction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ originalTransactionId: tx.split_from_transaction_id }),
    });
    setUnsplitting(null);
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setSaveError(body.error ?? "Aufteilung konnte nicht zurückgesetzt werden.");
      return;
    }
    // Original-ID merken → nach Reload Split-Dialog öffnen
    setPendingSplitId(tx.split_from_transaction_id);
    await loadData();
  };

  // ── Zeilen-Render (shared zwischen List- und Grouped-View) ───────────────────
  const renderRow = (tx: Transaction) => {
    const isEditing   = editingId === tx.id;
    const isSplitting = splitId === tx.id;
    const isSaving    = savingId === tx.id;
    const isDone      = confirmed.has(tx.id);
    const isCredit    = looksLikeCredit(tx);
    const variant     = getVariant(tx.category);
    const isSplitChild = !!tx.split_from_transaction_id;
    const isExpanded  = expandedId === tx.id;
    const isLearned   = tx.confidence === 0.95;
    const splitSum    =
      (parseFloat(splitDraft.interestAmount.replace(",", ".")) || 0) +
      (parseFloat(splitDraft.principalAmount.replace(",", ".")) || 0);
    const splitOk     = Math.abs(splitSum - Math.abs(Number(tx.amount))) <= 0.02;

    return (
      <Fragment key={tx.id}>
        <tr
          onClick={(e) => {
            // Klick auf interaktive Elemente nicht weiterleiten
            const target = e.target as HTMLElement;
            if (target.closest("button,input,select,a")) return;
            setExpandedId((prev) => (prev === tx.id ? null : tx.id));
          }}
          className={`cursor-pointer transition ${
            isEditing || isSplitting
              ? "bg-slate-50 dark:bg-slate-800/40"
              : isExpanded
              ? "bg-slate-50 dark:bg-slate-800/40"
              : isDone
              ? "hover:bg-slate-50 dark:hover:bg-slate-800/30"
              : "bg-yellow-50/40 hover:bg-yellow-50 dark:bg-yellow-950/10 dark:hover:bg-yellow-950/20"
          }`}
        >
          {/* Checkbox */}
          <td className="w-10 px-3 py-3">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-slate-900 dark:border-slate-600"
              checked={selectedIds.has(tx.id)}
              onChange={(e) => {
                setSelectedIds((prev) => {
                  const next = new Set(prev);
                  if (e.target.checked) next.add(tx.id);
                  else next.delete(tx.id);
                  return next;
                });
              }}
            />
          </td>

          {/* Datum */}
          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
            <div className="flex items-center gap-1.5">
              {isSplitChild && (
                <span title="Teil einer aufgeteilten Transaktion"
                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
              )}
              {fmtDate(tx.date)}
            </div>
          </td>

          {/* Betrag */}
          <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-semibold tabular-nums ${
            Number(tx.amount) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"
          }`}>
            {fmt(Number(tx.amount))}
            {tx.confidence !== null && tx.confidence !== undefined && (
              <div className={`text-[10px] font-normal ${
                tx.confidence > 0.85 ? "text-emerald-500" : "text-slate-400"
              }`}>
                {Math.round(tx.confidence * 100)} % sicher
              </div>
            )}
          </td>

          {/* Beschreibung */}
          <td className="max-w-[220px] px-4 py-3">
            <p className="truncate font-medium text-slate-800 dark:text-slate-200">
              {tx.counterpart ?? <span className="text-slate-400">—</span>}
            </p>
            {tx.description && (
              <p className="truncate text-xs text-slate-400 dark:text-slate-500">{tx.description}</p>
            )}
          </td>

          {/* Kategorie */}
          <td className="px-4 py-3">
            {tx.category ? (
              <div className="flex flex-col gap-1">
                <span className={`inline-flex w-fit items-center rounded-md px-2 py-0.5 text-xs font-medium ${BADGE[variant]}`}>
                  {getCatLabel(tx.category)}
                </span>
                {getCatAnlageV(tx.category) && (
                  <span className="text-[10px] text-slate-400 dark:text-slate-500">
                    Anlage V · {getCatAnlageV(tx.category)}
                  </span>
                )}
              </div>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400">
                <span className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                Nicht kategorisiert
              </span>
            )}
          </td>

          {/* Immobilie */}
          <td className="px-4 py-3">
            {tx.property?.name
              ? <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-400">{tx.property.name}</span>
              : <span className="text-xs text-slate-300 dark:text-slate-600">—</span>}
          </td>

          {/* Aktionen */}
          <td className="px-4 py-3">
            <div className="flex items-center justify-end gap-1.5">
              <ReceiptButton
                transactionId={tx.id}
                receipt={tx.receipt}
                onLinked={loadData}
              />
              {isSplitChild && !isSplitting && (
                <button type="button" onClick={() => void handleUnsplit(tx)}
                  disabled={unsplitting === tx.id}
                  className="rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 transition hover:bg-blue-100 disabled:opacity-60 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400">
                  {unsplitting === tx.id
                    ? <span className="flex items-center gap-1"><span className="h-3 w-3 animate-spin rounded-full border border-blue-400/40 border-t-blue-400" /></span>
                    : "Aufteilung bearbeiten"}
                </button>
              )}
              {isCredit && !isSplitChild && !isSplitting && (
                <button type="button" onClick={() => startSplit(tx)}
                  className="rounded-md border border-yellow-300 bg-yellow-50 px-2.5 py-1 text-xs font-medium text-yellow-700 transition hover:bg-yellow-100 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400">
                  Aufteilen
                </button>
              )}
              {!isEditing && !isSplitting && (
                <button type="button" onClick={() => startEdit(tx)}
                  className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                  Ändern
                </button>
              )}
              {!isEditing && !isSplitting && tx.category && (
                <button type="button" onClick={() => void handleConfirm(tx)}
                  disabled={isSaving || isDone}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    isDone
                      ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                  }`}>
                  {isSaving
                    ? <span className="flex items-center gap-1"><span className="h-3 w-3 animate-spin rounded-full border border-white/40 border-t-white" /></span>
                    : isDone ? "✓ Bestätigt"
                    : "Bestätigen"}
                </button>
              )}
            </div>
          </td>
        </tr>

        {/* ── Detail-Expansion ───────────────────────────────────────────────── */}
        {isExpanded && !isEditing && !isSplitting && (
          <tr key={`${tx.id}-detail`} className="bg-slate-50 dark:bg-slate-800/30">
            <td colSpan={7} className="px-4 pb-4 pt-0">
              <div className="rounded-lg border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900">
                <div className="grid gap-3 sm:grid-cols-2">

                  {/* Verwendungszweck */}
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Verwendungszweck
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 break-words">
                      {tx.description ?? <span className="italic text-slate-400">—</span>}
                    </p>
                  </div>

                  {/* Auftraggeber / Empfänger */}
                  <div>
                    <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      Auftraggeber / Empfänger
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 break-words">
                      {tx.counterpart ?? <span className="italic text-slate-400">—</span>}
                    </p>
                  </div>

                </div>

                {/* KI-Konfidenz + Lernregel-Hinweis */}
                {tx.confidence !== null && tx.confidence !== undefined && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-700">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                      tx.confidence >= 0.9
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                        : tx.confidence >= 0.7
                        ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-400"
                        : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400"
                    }`}>
                      {Math.round(tx.confidence * 100)} % Konfidenz
                    </span>
                    {isLearned && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-3 w-3">
                          <path d="M8 1a5 5 0 0 1 3.536 8.536l2.964 2.964-1.414 1.414-2.964-2.964A5 5 0 1 1 8 1Zm0 2a3 3 0 1 0 0 6A3 3 0 0 0 8 3Z"/>
                        </svg>
                        Automatisch per Lernregel kategorisiert
                      </span>
                    )}
                    {!isLearned && tx.confidence !== null && (
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        KI-Kategorisierung
                      </span>
                    )}
                  </div>
                )}
              </div>
            </td>
          </tr>
        )}

        {/* ── Edit-Zeile ─────────────────────────────────────────────────────── */}
        {isEditing && (
          <tr key={`${tx.id}-edit`} className="bg-slate-50 dark:bg-slate-800/40">
            <td colSpan={7} className="px-4 py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Kategorie</label>
                  <CategorySelect value={editCategory} onChange={setEditCategory} className="w-full" catLookup={catLookup} />
                </div>
                {properties.length > 0 && (
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Immobilie</label>
                    <select value={editPropertyId} onChange={(e) => setEditPropertyId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                      <option value="">Keine Zuordnung</option>
                      {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => setEditingId(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
                    Abbrechen
                  </button>
                  <button type="button" onClick={() => void handleSaveEdit(tx.id)} disabled={savingId === tx.id}
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60">
                    {savingId === tx.id ? "Speichert…" : "Speichern"}
                  </button>
                </div>
              </div>
            </td>
          </tr>
        )}

        {/* ── Split-Zeile ────────────────────────────────────────────────────── */}
        {isSplitting && (
          <tr key={`${tx.id}-split`} className="bg-yellow-50/60 dark:bg-yellow-950/20">
            <td colSpan={7} className="px-4 py-4">
              <p className="mb-3 text-xs font-medium text-yellow-800 dark:text-yellow-300">
                Kreditrate aufteilen — Originalbetrag: <strong>{fmt(Math.abs(Number(tx.amount)))}</strong>
              </p>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Zinsanteil (€) <span className="text-blue-500">· absetzbar Z. 35</span>
                  </label>
                  <input type="number" min="0" step="0.01"
                    value={splitDraft.interestAmount}
                    onChange={(e) => handleInterestChange(Number(tx.amount), e.target.value)}
                    placeholder="z. B. 312,50"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-medium text-slate-500">
                    Tilgungsanteil (€) <span className="text-slate-400">· nicht absetzbar</span>
                  </label>
                  <input type="number" min="0" step="0.01"
                    value={splitDraft.principalAmount}
                    onChange={(e) => handlePrincipalChange(Number(tx.amount), e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" />
                </div>
                <div className="shrink-0 text-right">
                  <p className="mb-1 text-xs text-slate-400">Summe</p>
                  <p className={`text-sm font-semibold tabular-nums ${splitOk ? "text-emerald-600 dark:text-emerald-400" : "text-red-500"}`}>
                    {fmt(splitSum)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => setSplitId(null)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400">
                    Abbrechen
                  </button>
                  <button type="button" onClick={() => void handleSplit(tx)} disabled={!splitOk || isSaving}
                    className="rounded-lg bg-yellow-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-yellow-700 disabled:opacity-60">
                    {isSaving ? "Teile auf…" : "Aufteilen"}
                  </button>
                </div>
              </div>
              {splitError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{splitError}</p>}
            </td>
          </tr>
        )}
      </Fragment>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-6xl space-y-5">

        {/* Header */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Transaktionen prüfen
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Kategorien bestätigen · Kreditraten aufteilen · ähnliche zusammen bearbeiten
            </p>
          </div>
          <Link href="/dashboard/banking"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800">
            ← Alle Transaktionen
          </Link>
        </div>

        {/* Migrations-Hinweis / Ladefehler */}
        {loadError && (
          <div className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 dark:border-orange-800/50 dark:bg-orange-950/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-orange-500" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-orange-700 dark:text-orange-300">{loadError}</p>
          </div>
        )}

        {/* Fortschrittsbalken */}
        {!loading && total > 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Fortschritt</span>
              <span className="text-sm text-slate-500 dark:text-slate-400">{doneCount} / {total} bestätigt</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${progress}%` }} />
            </div>
            {progress === 100 && (
              <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">✓ Alle Transaktionen wurden geprüft</p>
            )}
          </div>
        )}

        {/* ── Aktions-Toolbar ──────────────────────────────────────────────────── */}
        {!loading && total > 0 && (
          <div className="flex flex-wrap items-center gap-2">

            {/* KI-Kategorisierung */}
            <button
              type="button"
              onClick={() => void handleAiCategorize()}
              disabled={uncategorizedCount === 0 || aiCategorizing}
              title={
                uncategorizedCount === 0
                  ? "Alle Transaktionen sind bereits kategorisiert"
                  : `${uncategorizedCount} Transaktionen per KI kategorisieren`
              }
              className="inline-flex items-center gap-2 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-sm font-medium text-purple-700 transition hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-400 dark:hover:bg-purple-950/70"
            >
              {aiCategorizing ? (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-purple-300 border-t-purple-600 dark:border-purple-700 dark:border-t-purple-300" />
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                </svg>
              )}
              {aiCategorizing
                ? `Kategorisiere ${uncategorizedCount} Transaktionen…`
                : "KI-Kategorisierung starten"}
              {uncategorizedCount > 0 && !aiCategorizing && (
                <span className="rounded-full bg-purple-200 px-1.5 py-0.5 text-xs font-semibold text-purple-800 dark:bg-purple-900 dark:text-purple-300">
                  {uncategorizedCount}
                </span>
              )}
            </button>

            {/* Alle bestätigen */}
            <div className="relative">
              <button
                type="button"
                onClick={() => void handleBatchConfirm()}
                disabled={batchEligible.length === 0 || batchConfirming}
                title={
                  batchEligible.length === 0
                    ? "Keine Transaktionen mit KI-Konfidenz > 85 % vorhanden"
                    : `${batchEligible.length} Transaktionen bestätigen`
                }
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                {batchConfirming ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
                Alle bestätigen
                {batchEligible.length > 0 && (
                  <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                    {batchEligible.length}
                  </span>
                )}
              </button>
              {batchResult !== null && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-[10px] font-bold text-white">
                  ✓
                </span>
              )}
            </div>

            {/* Ähnliche zusammen bearbeiten */}
            <button
              type="button"
              onClick={() => setViewMode((m) => m === "grouped" ? "list" : "grouped")}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${
                viewMode === "grouped"
                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              Ähnliche bearbeiten
              {viewMode === "grouped" && (
                <span className="rounded-full bg-blue-200 px-1.5 py-0.5 text-xs font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                  {grouped.length} Gruppen
                </span>
              )}
            </button>

            {/* Kreditraten aufteilen */}
            <button
              type="button"
              onClick={() => setViewMode((m) => m === "kreditraten" ? "list" : "kreditraten")}
              disabled={unsplitCredits.length === 0}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                viewMode === "kreditraten"
                  ? "border-yellow-300 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-400"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-yellow-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
              </svg>
              Kreditrate aufteilen
              {unsplitCredits.length > 0 && (
                <span className="rounded-full bg-yellow-100 px-1.5 py-0.5 text-xs font-semibold text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400">
                  {unsplitCredits.length}
                </span>
              )}
            </button>

            {/* Aktiver Filter-Hinweis */}
            {viewMode !== "list" && (
              <button type="button" onClick={() => setViewMode("list")}
                className="ml-auto text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-300">
                Filter aufheben
              </button>
            )}
          </div>
        )}

        {/* Batch-Ergebnis */}
        {batchResult !== null && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {batchResult} Transaktion{batchResult !== 1 ? "en" : ""} automatisch bestätigt (Konfidenz &gt; 85 %)
            <button type="button" onClick={() => setBatchResult(null)} className="ml-auto text-xs underline">
              Schließen
            </button>
          </div>
        )}

        {/* KI-Ergebnis */}
        {aiResult !== null && (
          <div className={`rounded-lg px-4 py-3 text-sm ${
            aiResult.categorized > 0
              ? "bg-purple-50 text-purple-700 dark:bg-purple-950/30 dark:text-purple-400"
              : "bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400"
          }`}>
            <div className="flex items-start gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
              </svg>
              <span className="flex-1">
                <strong>{aiResult.categorized}</strong> Transaktion{aiResult.categorized !== 1 ? "en" : ""} kategorisiert
                {aiResult.errors > 0 && ` · ${aiResult.errors} Fehler`}
                {aiResult.categorized > 0 && " · Kategorien prüfen und bestätigen"}
              </span>
              <button type="button" onClick={() => setAiResult(null)} className="text-xs underline opacity-70">
                Schließen
              </button>
            </div>
            {/* Erster Fehlertext zur Diagnose */}
            {aiResult.firstError && (
              <p className="mt-2 rounded bg-red-100/60 px-2 py-1.5 font-mono text-xs dark:bg-red-950/40">
                Fehler: {aiResult.firstError}
              </p>
            )}
          </div>
        )}

        {/* Warnungen: unaufgeteilte Kreditraten */}
        {!loading && unsplitCredits.length > 0 && viewMode !== "kreditraten" && (
          <div className="flex items-start gap-3 rounded-xl border border-yellow-200 bg-yellow-50 px-4 py-3 dark:border-yellow-900/50 dark:bg-yellow-950/30">
            <svg xmlns="http://www.w3.org/2000/svg" className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600 dark:text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
                {unsplitCredits.length} mögliche Kreditrate{unsplitCredits.length !== 1 ? "n" : ""} noch nicht aufgeteilt
              </p>
              <p className="mt-0.5 text-xs text-yellow-700 dark:text-yellow-400">
                Kreditraten enthalten Zins- (Z. 35, absetzbar) und Tilgungsanteil (nicht absetzbar).
              </p>
            </div>
            <button type="button" onClick={() => setViewMode("kreditraten")}
              className="shrink-0 rounded-md bg-yellow-200 px-2.5 py-1 text-xs font-medium text-yellow-800 transition hover:bg-yellow-300 dark:bg-yellow-900/60 dark:text-yellow-300">
              Jetzt aufteilen
            </button>
          </div>
        )}

        {/* Fehler */}
        {saveError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {saveError}
            <button type="button" onClick={() => setSaveError(null)} className="ml-auto underline">Schließen</button>
          </div>
        )}

        {/* ── Mehrfachauswahl-Aktionsleiste ───────────────────────────────────────── */}
        {selectedIds.size > 0 && (
          <div className="sticky bottom-4 z-20 rounded-xl border border-blue-200 bg-blue-50 p-3 shadow-lg dark:border-blue-800/50 dark:bg-blue-950/80">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-200 px-2.5 py-0.5 text-sm font-bold text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {selectedIds.size}
                </span>
                <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                  Transaktion{selectedIds.size !== 1 ? "en" : ""} ausgewählt
                </span>
                <button
                  type="button"
                  onClick={() => { setSelectedIds(new Set()); setBulkDeleteConfirm(false); }}
                  className="text-xs text-blue-500 underline underline-offset-2 hover:text-blue-700 dark:text-blue-400"
                >
                  Auswahl aufheben
                </button>
              </div>
              <div className="flex flex-1 flex-wrap items-end gap-2">
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-xs font-medium text-blue-700 dark:text-blue-300">Kategorie (optional)</label>
                  <CategorySelect value={bulkCategory} onChange={setBulkCategory} className="w-full" catLookup={catLookup} />
                </div>
                {properties.length > 0 && (
                  <div className="min-w-[160px] flex-1">
                    <label className="mb-1 block text-xs font-medium text-blue-700 dark:text-blue-300">Immobilie (optional)</label>
                    <select
                      value={bulkPropertyId}
                      onChange={(e) => setBulkPropertyId(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                    >
                      <option value="">— unverändert —</option>
                      <option value="__clear__">Keine Zuordnung</option>
                      {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => void handleBulkSave()}
                  disabled={bulkSaving || (!bulkCategory && !bulkPropertyId)}
                  className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                      Speichert…
                    </span>
                  ) : "Übernehmen"}
                </button>
              </div>

              {/* Trennlinie + Lösch-Aktion */}
              <div className="flex w-full items-center gap-3 border-t border-blue-200 pt-3 dark:border-blue-800/50">
                {!bulkDeleteConfirm ? (
                  <button
                    type="button"
                    onClick={() => setBulkDeleteConfirm(true)}
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800/60 dark:bg-slate-900 dark:text-red-400 dark:hover:bg-red-950/30"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="h-4 w-4">
                      <path fillRule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.712Z" clipRule="evenodd" />
                    </svg>
                    {selectedIds.size} Transaktion{selectedIds.size !== 1 ? "en" : ""} löschen
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 dark:border-red-800/60 dark:bg-red-950/30">
                    <span className="text-sm font-medium text-red-700 dark:text-red-300">
                      Wirklich {selectedIds.size} Transaktion{selectedIds.size !== 1 ? "en" : ""} unwiderruflich löschen?
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleBulkDelete()}
                      disabled={bulkDeleting}
                      className="rounded-md bg-red-600 px-3 py-1 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                    >
                      {bulkDeleting ? (
                        <span className="flex items-center gap-1.5">
                          <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          Löscht…
                        </span>
                      ) : "Ja, löschen"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setBulkDeleteConfirm(false)}
                      className="rounded-md border border-red-200 bg-white px-3 py-1 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:bg-slate-900 dark:text-red-400"
                    >
                      Abbrechen
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Tabelle ──────────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600 dark:border-slate-700 dark:border-t-slate-300" />
            </div>
          ) : displayedTxs.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center">
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {viewMode === "kreditraten"
                  ? "Keine unaufgeteilten Kreditraten gefunden."
                  : "Keine Transaktionen vorhanden."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                    <th className="w-10 px-3 py-3">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-slate-900 dark:border-slate-600"
                        checked={displayedTxs.length > 0 && displayedTxs.every((t) => selectedIds.has(t.id))}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedIds(new Set(displayedTxs.map((t) => t.id)));
                          } else {
                            setSelectedIds(new Set());
                          }
                        }}
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Datum</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Betrag</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Beschreibung</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Kategorie</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500">Immobilie</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-slate-500">Aktionen</th>
                  </tr>
                </thead>

                {/* ── List-View ─────────────────────────────────────────────── */}
                {viewMode !== "grouped" && (
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {displayedTxs.map((tx) => renderRow(tx))}
                  </tbody>
                )}

                {/* ── Grouped-View ──────────────────────────────────────────── */}
                {viewMode === "grouped" && grouped.map(([counterpartKey, groupTxs]) => {
                  const openCount   = groupTxs.filter((t) => !confirmed.has(t.id)).length;
                  const isGroupEdit = groupEditing === counterpartKey;

                  return (
                    <tbody key={counterpartKey} className="divide-y divide-slate-100 dark:divide-slate-800">

                      {/* Gruppen-Header */}
                      <tr className="border-b-2 border-slate-200 bg-slate-100/80 dark:border-slate-700 dark:bg-slate-800/80">
                        <td colSpan={7} className="px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <span className="font-medium text-slate-700 dark:text-slate-200">{counterpartKey}</span>
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                              {groupTxs.length} Transaktion{groupTxs.length !== 1 ? "en" : ""}
                            </span>
                            {openCount > 0 && (
                              <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700 dark:bg-yellow-950/50 dark:text-yellow-400">
                                {openCount} offen
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => {
                                if (isGroupEdit) { setGroupEditing(null); return; }
                                setGroupEditing(counterpartKey);
                                setGroupCategory(groupTxs[0]?.category ?? "");
                                setGroupPropertyId(groupTxs[0]?.property_id ?? "");
                              }}
                              className={`ml-auto rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                                isGroupEdit
                                  ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-400"
                                  : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              }`}
                            >
                              {isGroupEdit ? "Abbrechen" : "Alle bearbeiten"}
                            </button>
                          </div>

                          {/* Gruppen-Edit-Bar */}
                          {isGroupEdit && (
                            <div className="mt-3 flex flex-col gap-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3 dark:border-blue-900/50 dark:bg-blue-950/20 sm:flex-row sm:items-end">
                              <div className="flex-1">
                                <label className="mb-1 block text-xs font-medium text-slate-500">
                                  Kategorie für alle {groupTxs.length} Transaktionen
                                </label>
                                <CategorySelect value={groupCategory} onChange={setGroupCategory} className="w-full" catLookup={catLookup} />
                              </div>
                              {properties.length > 0 && (
                                <div className="flex-1">
                                  <label className="mb-1 block text-xs font-medium text-slate-500">Immobilie</label>
                                  <select value={groupPropertyId} onChange={(e) => setGroupPropertyId(e.target.value)}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100">
                                    <option value="">Keine Zuordnung</option>
                                    {properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                  </select>
                                </div>
                              )}
                              <button
                                type="button"
                                disabled={!groupCategory || groupSaving}
                                onClick={() => void handleGroupSave(counterpartKey, groupTxs.map((t) => t.id))}
                                className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                              >
                                {groupSaving ? "Speichert…" : `Alle ${groupTxs.length} speichern`}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Einzel-Zeilen der Gruppe */}
                      {groupTxs.map((tx) => renderRow(tx))}
                    </tbody>
                  );
                })}
              </table>

              <div className="border-t border-slate-100 px-4 py-2.5 dark:border-slate-800">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {displayedTxs.length} Transaktion{displayedTxs.length !== 1 ? "en" : ""}
                  {viewMode === "kreditraten" && " · Kreditraten-Filter aktiv"}
                  {viewMode === "grouped" && ` · ${grouped.length} Gruppen`}
                  {" · "}
                  <span className="text-emerald-600 dark:text-emerald-400">{doneCount} bestätigt</span>
                  {total - doneCount > 0 && (
                    <span className="text-yellow-600 dark:text-yellow-400">
                      {" · "}{total - doneCount} ausstehend
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

      </section>
    </main>
  );
}
