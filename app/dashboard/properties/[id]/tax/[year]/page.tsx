"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { TAX_FIELDS, TAX_FIELD_GROUPS } from "@/lib/tax/fieldMeta";
import { calculateTaxTotals } from "@/lib/tax/gbrTaxReport";
import { formatDateForDisplay } from "@/lib/tax/partnerNormalization";
import { computeRentalShare } from "@/lib/tax/rentalShare";
import { computeStructuredTaxData } from "@/lib/tax/structuredTaxLogic";
import TaxYearNavigation from "@/components/tax/TaxYearNavigation";
import type {
  TaxConfidence,
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";

type Property = {
  id: string;
  name: string;
  address: string | null;
  kaufpreis: number | null;
  gebaeudewert: number | null;
  grundwert: number | null;
  inventarwert: number | null;
  baujahr: number | null;
  afa_satz: number | null;
  afa_jahresbetrag: number | null;
};
type GbrSettingsSummary = { id?: string; feststellungserklaerung: boolean; gbr_partner: { id: string; anteil: number }[] };
type TaxSettingsSummary = { eigennutzung_tage: number; gesamt_tage: number; rental_share_override_pct: number | null };
type LocalDepreciationItem = Partial<TaxDepreciationItem> & { id: string };
type LocalMaintenanceDistribution = Partial<TaxMaintenanceDistributionItem> & { id: string };
type CandidateTransaction = {
  id: string;
  date: string;
  amount: number;
  description: string | null;
  counterpart: string | null;
  category: string | null;
  is_tax_deductible: boolean | null;
  anlage_v_zeile: number | null;
};
type YearlyChecklistItem = {
  label: string;
  targetId?: string;
  href?: string;
  actionLabel: string;
};

const CONFIDENCE_DOT: Record<TaxConfidence | "null", string> = {
  high:   "bg-emerald-500",
  medium: "bg-amber-400",
  low:    "bg-red-500",
  null:   "bg-slate-300 dark:bg-slate-600",
};

const fmtVal = (val: unknown, type: string) => {
  if (val == null || val === "") return "—";
  if (type === "numeric") return Number(val).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  if (type === "date") return formatDateForDisplay(val as string);
  if (type === "integer") return String(val);
  return String(val);
};

export default function TaxYearPage() {
  const { id, year: yearParam } = useParams<{ id: string; year: string }>();
  const router = useRouter();
  const taxYear = Number(yearParam);

  const [property, setProperty] = useState<Property | null>(null);
  const [taxData, setTaxData] = useState<TaxData | null>(null);
  const [reconciliation, setReconciliation] = useState<null | {
    items: Array<{
      type: string;
      label: string;
      target_block: string;
      source_year: number | null;
      gross_amount: number;
      deductible_amount: number;
      included: boolean;
      exclusion_reason: string | null;
    }>;
    einnahmen: number;
    deductible_without_afa: number;
    total_deductible_with_afa: number;
    afa: number;
    result_before_partner: number;
    expense_buckets?: Array<{ key: string; label: string; amount: number; detail?: string }>;
    depreciation_buckets?: Array<{ key: string; label: string; amount: number; detail?: string }>;
  }>(null);
  const [showReconciliation, setShowReconciliation] = useState(false);
  const [gbrSettings, setGbrSettings] = useState<GbrSettingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [showCalculationPrep, setShowCalculationPrep] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taxSettings, setTaxSettings] = useState<TaxSettingsSummary | null>(null);
  const [savingTaxSettings, setSavingTaxSettings] = useState(false);
  const [taxSettingsMessage, setTaxSettingsMessage] = useState<string | null>(null);
  const [depreciationItems, setDepreciationItems] = useState<LocalDepreciationItem[]>([]);
  const [maintenanceDistributions, setMaintenanceDistributions] = useState<LocalMaintenanceDistribution[]>([]);
  const [candidateTransactions, setCandidateTransactions] = useState<CandidateTransaction[]>([]);
  const [linkedTransactions, setLinkedTransactions] = useState<CandidateTransaction[]>([]);
  const [transactionNameFilter, setTransactionNameFilter] = useState("");
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState("");
  const [transactionAmountFilter, setTransactionAmountFilter] = useState("");
  const [showOnlyUnassignedTransactions, setShowOnlyUnassignedTransactions] = useState(true);
  const [logicError, setLogicError] = useState<string | null>(null);
  const [savingLogicId, setSavingLogicId] = useState<string | null>(null);
  const [deletingLogicId, setDeletingLogicId] = useState<string | null>(null);
  const [highlightedSectionId, setHighlightedSectionId] = useState<string | null>(null);

  const jumpToSection = useCallback((targetId: string) => {
    setHighlightedSectionId(targetId);
    document.getElementById(targetId)?.scrollIntoView({ behavior: "smooth", block: "start" });
    window.setTimeout(() => {
      setHighlightedSectionId((current) => (current === targetId ? null : current));
    }, 1800);
  }, []);

  const loadLogicItems = useCallback(async () => {
    const res = await fetch(`/api/tax/logic-items?property_id=${id}&tax_year=${taxYear}`);
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      setLogicError(data?.error ?? "Steuerlogik konnte nicht geladen werden.");
      return;
    }
    const data = await res.json() as {
      depreciation_items: TaxDepreciationItem[];
      maintenance_distributions: TaxMaintenanceDistributionItem[];
      candidate_transactions: CandidateTransaction[];
      linked_transactions: CandidateTransaction[];
    };
    setDepreciationItems(data.depreciation_items);
    setMaintenanceDistributions(data.maintenance_distributions);
    setCandidateTransactions(data.candidate_transactions ?? []);
    setLinkedTransactions(data.linked_transactions ?? []);
    setLogicError(null);
  }, [id, taxYear]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prop }, { data: entries }, gbrRes, taxSettingsRes, logicRes] = await Promise.all([
        supabase.from("properties").select("id, name, address, kaufpreis, gebaeudewert, grundwert, inventarwert, baujahr, afa_satz, afa_jahresbetrag").eq("id", id).eq("user_id", user.id).single(),
        supabase.from("tax_data").select("*").eq("property_id", id).eq("tax_year", taxYear).limit(1),
        fetch(`/api/settings/gbr?property_id=${id}`),
        fetch(`/api/settings/tax?property_id=${id}&tax_year=${taxYear}`),
        fetch(`/api/tax/logic-items?property_id=${id}&tax_year=${taxYear}`),
      ]);

      setProperty(prop as Property | null);
      const firstTaxData = entries && entries.length > 0 ? entries[0] as TaxData : null;
      if (entries && entries.length > 0) {
        setTaxData(firstTaxData);
      }
      if (gbrRes.ok) {
        const gbr = await gbrRes.json() as GbrSettingsSummary;
        if (gbr.id) setGbrSettings(gbr);
      }
      if (taxSettingsRes.ok) {
        setTaxSettings(await taxSettingsRes.json() as TaxSettingsSummary);
      }
      if (logicRes.ok) {
        const logic = await logicRes.json() as {
          depreciation_items: TaxDepreciationItem[];
          maintenance_distributions: TaxMaintenanceDistributionItem[];
          candidate_transactions: CandidateTransaction[];
          linked_transactions: CandidateTransaction[];
        };
        setDepreciationItems(
          logic.depreciation_items.length > 0
            ? mergeMissingPrefillDepreciationItems({
                existingItems: logic.depreciation_items,
                property: prop as Property | null,
                taxYear,
                taxData: firstTaxData,
              })
            : prop
              ? buildDefaultDepreciationItems({ property: prop as Property, taxYear, taxData: firstTaxData })
              : [],
        );
        setMaintenanceDistributions(logic.maintenance_distributions);
        setCandidateTransactions(logic.candidate_transactions ?? []);
        setLinkedTransactions(logic.linked_transactions ?? []);
      } else {
        await loadLogicItems();
      }
      setLoading(false);
    };
    void load();
  }, [id, loadLogicItems, taxYear]);

  const recalculateTaxData = useCallback(async () => {
    const res = await fetch("/api/tax/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: id, tax_year: taxYear }),
    });
    if (!res.ok) return false;
    const json = await res.json();
    if (json._reconciliation) {
      setReconciliation(json._reconciliation);
      const { _reconciliation, _engine, ...taxDataOnly } = json;
      void _reconciliation;
      void _engine;
      setTaxData(taxDataOnly);
    } else {
      setTaxData(json);
    }
    return true;
  }, [id, taxYear]);

  const saveTaxSettings = async () => {
    if (!taxSettings) return;
    setSavingTaxSettings(true);
    setTaxSettingsMessage(null);

    const res = await fetch("/api/settings/tax", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id: id,
        tax_year: taxYear,
        eigennutzung_tage: taxSettings.eigennutzung_tage,
        gesamt_tage: taxSettings.gesamt_tage,
        rental_share_override_pct: taxSettings.rental_share_override_pct,
      }),
    });

    setSavingTaxSettings(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      setTaxSettingsMessage(data?.error ?? "Jahreswerte konnten nicht gespeichert werden.");
      return;
    }

    setTaxSettingsMessage("Jahreswerte gespeichert.");
    setTimeout(() => setTaxSettingsMessage(null), 2000);
  };

  const runCalculation = async () => {
    setCalculating(true);
    await recalculateTaxData();
    setCalculating(false);
  };

  const handleCalculate = async () => {
    if (!taxData) {
      setShowCalculationPrep(true);
      return;
    }
    await runCalculation();
  };

  const startEdit = () => {
    const vals: Record<string, string> = {};
    for (const field of TAX_FIELDS) {
      const v = displayTaxData ? (displayTaxData as unknown as Record<string, unknown>)[field.key] : null;
      vals[field.key] = v != null ? String(v) : "";
    }
    setEditValues(vals);
    setEditing(true);
    setSaveError(null);
  };

  const handleSave = async () => {
    if (!taxData) return;
    setSaving(true);
    setSaveError(null);

    const updates: Record<string, unknown> = {};
    for (const field of TAX_FIELDS) {
      const isStructuredField = Boolean(
        field.key === "depreciation_building" && structuredTax?.lineTotals.depreciation_building != null ||
        field.key === "depreciation_outdoor" && structuredTax?.lineTotals.depreciation_outdoor != null ||
        field.key === "depreciation_fixtures" && structuredTax?.lineTotals.depreciation_fixtures != null ||
        field.key === "maintenance_costs" && structuredTax?.lineTotals.maintenance_costs != null,
      );
      if (isStructuredField) continue;

      const raw = editValues[field.key]?.trim();
      if (raw === "") {
        updates[field.key] = null;
      } else if (field.type === "numeric") {
        updates[field.key] = parseFloat(raw.replace(",", "."));
      } else if (field.type === "integer") {
        updates[field.key] = parseInt(raw, 10);
      } else {
        updates[field.key] = raw;
      }
    }

    const res = await fetch(`/api/tax/${taxData.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });

    if (res.ok) {
      setTaxData(await res.json());
      setEditing(false);
    } else {
      const data = await res.json();
      setSaveError(data.error ?? "Fehler beim Speichern.");
    }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!taxData) return;
    setDeleting(true);
    const res = await fetch(`/api/tax/${taxData.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push(`/dashboard/properties/${id}/tax`);
    }
    setDeleting(false);
  };

  const addDepreciationItem = () => {
    setDepreciationItems((current) => [
      ...current,
      {
        id: `new-dep-${Date.now()}`,
        property_id: id,
        tax_year: taxYear,
        item_type: "building",
        label: "",
        gross_annual_amount: 0,
        apply_rental_ratio: true,
      },
    ]);
  };

  const addMaintenanceDistribution = () => {
    setMaintenanceDistributions((current) => [
      ...current,
      {
        id: `new-dist-${Date.now()}`,
        property_id: id,
        source_year: taxYear,
        label: "",
        total_amount: 0,
        source_transaction_ids: [],
        classification: "maintenance_expense",
        deduction_mode: "distributed",
        distribution_years: 3,
        current_year_share_override: null,
        apply_rental_ratio: true,
        status: "active",
        note: "",
      },
    ]);
  };

  const saveLogicItem = async (kind: "depreciation" | "maintenance_distribution", item: LocalDepreciationItem | LocalMaintenanceDistribution) => {
    setSavingLogicId(item.id);
    setLogicError(null);
    const payload: Record<string, unknown> = { ...item };
    if (typeof payload.id === "string" && payload.id.startsWith("new-")) {
      payload.id = undefined;
    }

    const res = await fetch("/api/tax/logic-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, item: payload }),
    });

    setSavingLogicId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      setLogicError(data?.error ?? "Steuerlogik konnte nicht gespeichert werden.");
      return;
    }
    await loadLogicItems();
    await recalculateTaxData();
  };

  const deleteLogicItem = async (kind: "depreciation" | "maintenance_distribution", itemId: string) => {
    if (itemId.startsWith("new-")) {
      if (kind === "depreciation") {
        setDepreciationItems((current) => current.filter((item) => item.id !== itemId));
      } else {
        setMaintenanceDistributions((current) => current.filter((item) => item.id !== itemId));
      }
      return;
    }

    setDeletingLogicId(itemId);
    setLogicError(null);
    const res = await fetch("/api/tax/logic-items", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, id: itemId }),
    });
    setDeletingLogicId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null) as { error?: string } | null;
      setLogicError(data?.error ?? "Steuerlogik konnte nicht gelöscht werden.");
      return;
    }
    await loadLogicItems();
    await recalculateTaxData();
  };

  const transactionMap = useMemo(() => {
    const map = new Map<string, CandidateTransaction>();
    for (const transaction of [...candidateTransactions, ...linkedTransactions]) {
      map.set(transaction.id, transaction);
    }
    return map;
  }, [candidateTransactions, linkedTransactions]);

  const usedTransactionIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of maintenanceDistributions) {
      for (const transactionId of item.source_transaction_ids ?? []) {
        ids.add(transactionId);
      }
    }
    return ids;
  }, [maintenanceDistributions]);

  const normalizedTransactionNameFilter = transactionNameFilter.trim().toLocaleLowerCase("de-DE");
  const normalizedTransactionCategoryFilter = transactionCategoryFilter.trim().toLocaleLowerCase("de-DE");
  const normalizedTransactionAmountFilter = transactionAmountFilter.trim().replace(/\s/g, "").replace(",", ".");
  const availableTransactionCategories = useMemo(() => (
    Array.from(
      new Set(
        candidateTransactions
          .map((transaction) => transaction.category?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    ).sort((a, b) => a.localeCompare(b, "de-DE"))
  ), [candidateTransactions]);

  const transactionMatchesFilters = useCallback((transaction: CandidateTransaction) => {
    if (normalizedTransactionCategoryFilter) {
      const categoryValue = transaction.category?.trim().toLocaleLowerCase("de-DE") ?? "";
      if (categoryValue !== normalizedTransactionCategoryFilter) return false;
    }

    if (normalizedTransactionNameFilter) {
      const haystack = [
        transaction.counterpart,
        transaction.description,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase("de-DE");
      if (!haystack.includes(normalizedTransactionNameFilter)) return false;
    }

    if (normalizedTransactionAmountFilter) {
      const absoluteAmount = Math.abs(Number(transaction.amount ?? 0));
      const amountVariants = [
        absoluteAmount.toFixed(2),
        absoluteAmount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, "").replace(",", "."),
        absoluteAmount.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\s/g, ""),
      ];
      if (!amountVariants.some((value) => value.includes(normalizedTransactionAmountFilter))) return false;
    }

    return true;
  }, [normalizedTransactionAmountFilter, normalizedTransactionCategoryFilter, normalizedTransactionNameFilter]);

  const getAvailableTransactionsForItem = useCallback((selectedTransactionIds: string[]) => (
    candidateTransactions.filter((transaction) => {
      const isSelectedOnThisItem = selectedTransactionIds.includes(transaction.id);
      const isUsedElsewhere = usedTransactionIds.has(transaction.id) && !isSelectedOnThisItem;
      if (showOnlyUnassignedTransactions && isUsedElsewhere) return false;
      return transactionMatchesFilters(transaction);
    })
  ), [candidateTransactions, showOnlyUnassignedTransactions, transactionMatchesFilters, usedTransactionIds]);

  const toggleMaintenanceTransaction = (itemId: string, transactionId: string, checked: boolean) => {
    setMaintenanceDistributions((current) => current.map((candidate) => {
      if (candidate.id !== itemId) return candidate;

      const existingIds = new Set(candidate.source_transaction_ids ?? []);
      if (checked) existingIds.add(transactionId);
      else existingIds.delete(transactionId);

      const nextIds = Array.from(existingIds);
      const linked = nextIds
        .map((idValue) => transactionMap.get(idValue))
        .filter((value): value is CandidateTransaction => Boolean(value));
      const totalAmount = linked.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount ?? 0)), 0);
      const suggestedLabel = linked[0]
        ? [linked[0].counterpart, linked[0].description].filter(Boolean).join(" · ")
        : "";

      return {
        ...candidate,
        source_transaction_ids: nextIds,
        total_amount: totalAmount > 0 ? Math.round(totalAmount * 100) / 100 : candidate.total_amount ?? 0,
        label: candidate.label?.trim() ? candidate.label : suggestedLabel || candidate.label,
      };
    }));
  };

  const assignVisibleTransactionsToMaintenance = (itemId: string) => {
    setMaintenanceDistributions((current) => current.map((candidate) => {
      if (candidate.id !== itemId) return candidate;

      const selectedIds = new Set(candidate.source_transaction_ids ?? []);
      const visibleTransactions = getAvailableTransactionsForItem(Array.from(selectedIds));

      for (const transaction of visibleTransactions) {
        selectedIds.add(transaction.id);
      }

      const nextIds = Array.from(selectedIds);
      const linked = nextIds
        .map((idValue) => transactionMap.get(idValue))
        .filter((value): value is CandidateTransaction => Boolean(value));

      return {
        ...candidate,
        source_transaction_ids: nextIds,
        total_amount: linked.reduce((sum, transaction) => sum + Math.abs(Number(transaction.amount ?? 0)), 0),
      };
    }));
  };

  // Count filled fields
  const rentalSharePct = useMemo(
    () => computeRentalShare(taxSettings ?? {}).rental_share_pct,
    [taxSettings],
  );

  const structuredTax = taxData
    ? computeStructuredTaxData({
        taxData,
        taxYear,
        rentalSharePct,
        depreciationItems: depreciationItems as TaxDepreciationItem[],
        maintenanceDistributions: maintenanceDistributions as TaxMaintenanceDistributionItem[],
      })
    : null;

  const displayTaxData = structuredTax?.taxData ?? taxData;
  const filledCount = taxData
    ? TAX_FIELDS.filter((f) => (displayTaxData as unknown as Record<string, unknown>)[f.key] != null).length
    : 0;
  const missingCount = TAX_FIELDS.length - filledCount;
  const gbrTotals = displayTaxData ? calculateTaxTotals(displayTaxData) : null;
  const yearlyChecklist = useMemo(() => {
    const openItems: YearlyChecklistItem[] = [];
    if ((taxSettings?.gesamt_tage ?? 0) <= 0) {
      openItems.push({
        label: "Gesamttage fehlen",
        targetId: "jahreswerte-card",
        actionLabel: "Zu den Jahreswerten",
      });
    }
    if (gbrSettings && !gbrSettings.feststellungserklaerung) {
      openItems.push({
        label: "GbR-Feststellung ist noch nicht aktiviert",
        href: `/dashboard/settings/gbr?property_id=${id}`,
        actionLabel: "Zu den GbR-Einstellungen",
      });
    }
    if (candidateTransactions.length > 0 && maintenanceDistributions.length === 0) {
      openItems.push({
        label: "Mögliche verteilte Buchungen noch nicht geprüft",
        targetId: "maintenance-distributions-card",
        actionLabel: "Zu den Verteilungsblöcken",
      });
    }
    if (maintenanceDistributions.some((item) => (item.source_transaction_ids?.length ?? 0) === 0)) {
      openItems.push({
        label: "Ein oder mehrere Verteilungsblöcke haben noch keine Buchung",
        targetId: "maintenance-distributions-card",
        actionLabel: "Zu den Verteilungsblöcken",
      });
    }
    return {
      status: openItems.length === 0 ? "vollständig" : openItems.length <= 2 ? "prüfen" : "unvollständig",
      openItems,
    };
  }, [taxSettings, gbrSettings, candidateTransactions.length, maintenanceDistributions, id]);

  if (loading) return <Skeleton />;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        {/* Header */}
        <nav className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <Link href={`/dashboard/properties/${id}/tax`} className="hover:text-slate-900 dark:hover:text-slate-100">
            Steuerdaten
          </Link>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-100">{taxYear}</span>
        </nav>

        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
              Anlage V — {taxYear}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {property?.name}
              {displayTaxData ? ` · ${filledCount}/${TAX_FIELDS.length} Felder ausgefüllt` : ""}
              {missingCount > 0 && displayTaxData ? ` · ${missingCount} fehlen` : ""}
              {gbrSettings ? " · GbR-Feststellung verfügbar" : ""}
            </p>
          </div>
          <div className="flex gap-2">
            {taxData && (
              <>
                {gbrSettings && (
                  <Link
                    href={`/dashboard/properties/${id}/tax/${taxYear}/gbr`}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    FE/FB
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                >
                  Löschen
                </button>
                <Link
                  href={`/dashboard/properties/${id}/tax/${taxYear}/export`}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Export
                </Link>
              </>
            )}
            {!editing && (
              <button
                type="button"
                onClick={taxData ? startEdit : () => void handleCalculate()}
                disabled={calculating}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
              >
                {taxData ? "Bearbeiten" : calculating ? "Berechne…" : "Aus Transaktionen berechnen"}
              </button>
            )}
          </div>
        </div>

        <TaxYearNavigation
          propertyId={id}
          taxYear={taxYear}
          active="anlage-v"
          hasGbr={Boolean(gbrSettings)}
        />

        {structuredTax && structuredTax.warnings.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 dark:border-amber-900 dark:bg-amber-950/30">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Steuerlogik prüfen</p>
            <div className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-400">
              {structuredTax.warnings.map((warning, index) => (
                <p key={`${warning.code}-${index}`}>{warning.message}</p>
              ))}
            </div>
          </div>
        )}

        <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Jahresstatus</p>
              <p className="mt-1 text-sm font-medium text-slate-900 dark:text-slate-100">
                {yearlyChecklist.status === "vollständig" ? "Jahresdaten vollständig" : yearlyChecklist.status === "prüfen" ? "Noch offene Prüfpunkte" : "Mehrere offene Punkte"}
              </p>
            </div>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
              yearlyChecklist.status === "vollständig"
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                : yearlyChecklist.status === "prüfen"
                  ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                  : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
            }`}>
              {yearlyChecklist.openItems.length === 0 ? "Bereit" : `${yearlyChecklist.openItems.length} offen`}
            </span>
          </div>
          {yearlyChecklist.openItems.length > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
              <div className="space-y-2">
                {yearlyChecklist.openItems.map((item) => (
                  <div key={item.label} className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <p>{item.label}</p>
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {item.actionLabel}
                      </Link>
                    ) : item.targetId ? (
                      <button
                        type="button"
                        onClick={() => jumpToSection(item.targetId!)}
                        className="inline-flex items-center gap-2 self-start rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        {item.actionLabel}
                      </button>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {taxSettings && (
          <section
            id="jahreswerte-card"
            className={`rounded-xl border bg-white shadow-sm transition-all duration-500 dark:bg-slate-900 ${
              highlightedSectionId === "jahreswerte-card"
                ? "border-blue-400 ring-2 ring-blue-500/20 dark:border-blue-500"
                : "border-slate-200 dark:border-slate-800"
            }`}
          >
            <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Jahreswerte für Eigennutzung</h3>
              <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                Diese Werte gelten nur für {taxYear}. Die Objekt-Einstellungen bleiben als Fallback erhalten.
              </p>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-3">
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Eigennutzungstage</span>
                <input
                  type="number"
                  min={0}
                  value={taxSettings.eigennutzung_tage}
                  onChange={(e) => setTaxSettings((current) => current ? { ...current, eigennutzung_tage: Math.max(0, Number(e.target.value) || 0) } : current)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Gesamttage</span>
                <input
                  type="number"
                  min={1}
                  value={taxSettings.gesamt_tage}
                  onChange={(e) => setTaxSettings((current) => current ? { ...current, gesamt_tage: Math.max(1, Number(e.target.value) || 365) } : current)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Manueller Vermietungsanteil (%)</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={taxSettings.rental_share_override_pct != null ? (taxSettings.rental_share_override_pct * 100).toString().replace(".", ",") : ""}
                  onChange={(e) => {
                    const raw = e.target.value.trim();
                    setTaxSettings((current) => current ? {
                      ...current,
                      rental_share_override_pct: raw === "" ? null : Math.max(0, Math.min(100, Number(raw.replace(",", ".")) || 0)) / 100,
                    } : current);
                  }}
                  placeholder={`${(rentalSharePct * 100).toFixed(2).replace(".", ",")} % automatisch`}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </label>
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Automatischer Vermietungsanteil aktuell: {(rentalSharePct * 100).toFixed(2).replace(".", ",")} %
              </p>
              <div className="flex items-center gap-3">
                {taxSettingsMessage && <span className="text-xs text-slate-500 dark:text-slate-400">{taxSettingsMessage}</span>}
                <button
                  type="button"
                  onClick={() => void saveTaxSettings()}
                  disabled={savingTaxSettings}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingTaxSettings ? "Speichert…" : "Jahreswerte speichern"}
                </button>
              </div>
            </div>
          </section>
        )}

        {!taxData && !calculating ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 bg-white py-12 text-center dark:border-slate-700 dark:bg-slate-900">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Keine Daten für {taxYear}. Berechne aus Transaktionen oder importiere ein PDF.
            </p>
          </div>
        ) : taxData && (
          <div className="space-y-4">
            {gbrSettings && gbrTotals && (
              <div className="rounded-xl border border-blue-200 bg-white px-5 py-4 shadow-sm dark:border-blue-900 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">GbR-Feststellungserklärung</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Anlage FE/FB wird automatisch aus dieser Anlage V und den Partneranteilen abgeleitet.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold tabular-nums ${gbrTotals.result < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}`}>
                      {fmtVal(gbrTotals.result, "numeric")}
                    </p>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Festzustellendes Ergebnis</p>
                  </div>
                </div>
              </div>
            )}
            {TAX_FIELD_GROUPS.map(({ key: cat, label: groupLabel }) => {
              const fields = TAX_FIELDS.filter((f) => f.category === cat);

              return (
                <div key={cat} className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                  <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {groupLabel}
                    </h3>
                  </div>
                  <div className="divide-y divide-slate-100 px-5 dark:divide-slate-800">
                    {fields.map((field) => {
                      const val = (displayTaxData as unknown as Record<string, unknown>)[field.key];
                      const conf = taxData.import_confidence?.[field.key] as TaxConfidence | undefined;
                      const dot = CONFIDENCE_DOT[conf ?? "null"];
                      const isStructuredField = Boolean(
                        field.key === "depreciation_building" && structuredTax?.lineTotals.depreciation_building != null ||
                        field.key === "depreciation_outdoor" && structuredTax?.lineTotals.depreciation_outdoor != null ||
                        field.key === "depreciation_fixtures" && structuredTax?.lineTotals.depreciation_fixtures != null ||
                        field.key === "maintenance_costs" && structuredTax?.lineTotals.maintenance_costs != null,
                      );

                      return (
                        <div key={field.key} className="flex items-center justify-between gap-4 py-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            {conf && <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${dot}`} />}
                            <span className="text-sm text-slate-600 dark:text-slate-400 truncate">
                              <span className="mr-1.5 text-xs text-slate-400 dark:text-slate-500">{field.zeile}</span>
                              {field.label}
                              {isStructuredField && (
                                <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                                  aus Steuerlogik
                                </span>
                              )}
                            </span>
                          </div>
                          {editing ? (
                            <input
                              type={field.type === "date" ? "date" : "text"}
                              value={editValues[field.key] ?? ""}
                              onChange={(e) => setEditValues((v) => ({ ...v, [field.key]: e.target.value }))}
                              disabled={isStructuredField}
                              className="w-40 shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-right text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              placeholder={field.type === "numeric" ? "0,00" : ""}
                            />
                          ) : (
                            <span className={`shrink-0 text-sm tabular-nums ${val != null ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-300 dark:text-slate-600"}`}>
                              {fmtVal(val, field.type)}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {reconciliation && (
              <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                <button
                  type="button"
                  onClick={() => setShowReconciliation((v) => !v)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reconciliation — Werbungskosten-Nachweis</p>
                    <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                      Alle berücksichtigten und ausgeschlossenen Posten auf einen Blick
                    </p>
                  </div>
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                    {showReconciliation ? "Ausblenden" : "Einblenden"}
                  </span>
                </button>

                {showReconciliation && (
                  <div className="border-t border-slate-100 dark:border-slate-800">
                    {/* Summary row */}
                    <div className="grid grid-cols-2 gap-4 px-5 py-4 md:grid-cols-4 bg-slate-50 dark:bg-slate-800/40">
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Einnahmen</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {reconciliation.einnahmen.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Werbungskosten gesamt</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {reconciliation.total_deductible_with_afa.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">ohne AfA</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {reconciliation.deductible_without_afa.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">davon AfA</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {reconciliation.afa.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="md:col-span-1">
                        <p className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Ergebnis</p>
                        <p className={`mt-1 text-sm font-semibold ${reconciliation.result_before_partner < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                          {reconciliation.result_before_partner.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                        </p>
                      </div>
                    </div>

                    {/* Item table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Bezeichnung</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Typ</th>
                            <th className="px-4 py-2.5 text-left text-xs font-medium text-slate-500 dark:text-slate-400">Zielblock</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Brutto</th>
                            <th className="px-4 py-2.5 text-right text-xs font-medium text-slate-500 dark:text-slate-400">Absetzbar (ELSTER)</th>
                            <th className="px-4 py-2.5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {reconciliation.items.map((item, idx) => (
                            <tr
                              key={idx}
                              className={item.included ? "" : "opacity-50"}
                            >
                              <td className="px-4 py-2.5 text-slate-800 dark:text-slate-200">
                                {item.label}
                                {item.source_year != null && (
                                  <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    {item.source_year}
                                  </span>
                                )}
                                {item.exclusion_reason && (
                                  <span className="ml-2 text-xs text-red-500 dark:text-red-400">({item.exclusion_reason})</span>
                                )}
                              </td>
                              <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                                {item.type === "transaction" ? "Transaktion" : item.type === "maintenance_distribution" ? "Instandhaltungsverteilung" : "AfA"}
                              </td>
                              <td className="px-4 py-2.5 text-slate-500 dark:text-slate-400">
                                <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] dark:bg-slate-800">
                                  {item.target_block}
                                </span>
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums text-slate-700 dark:text-slate-300">
                                {item.gross_amount.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-900 dark:text-slate-100">
                                {item.deductible_amount.toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                              </td>
                              <td className="px-4 py-2.5 text-center">
                                {item.included ? (
                                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    ✓ berücksichtigt
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    ausgeschlossen
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </section>
            )}

            <section
              id="depreciation-items-card"
              className={`rounded-xl border bg-white shadow-sm transition-all duration-500 dark:bg-slate-900 ${
                highlightedSectionId === "depreciation-items-card"
                  ? "border-blue-400 ring-2 ring-blue-500/20 dark:border-blue-500"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">AfA-Komponenten</h3>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Gebäude, Inventar und Außenanlagen werden hier positionsbezogen gerechnet und erst danach in die Anlage V übernommen. Wenn im Steckbrief Werte vorhanden sind, werden sie hier automatisch vorgefüllt und bleiben bearbeitbar.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addDepreciationItem}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  AfA-Komponente hinzufügen
                </button>
              </div>
              {logicError && (
                <p className="mx-5 mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{logicError}</p>
              )}
              {depreciationItems.length === 0 ? (
                <p className="px-5 py-5 text-sm text-slate-500 dark:text-slate-400">Noch keine AfA-Komponenten erfasst.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                        <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Bezeichnung</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Typ</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Brutto/Jahr</th>
                        <th className="px-4 py-3 text-center font-medium text-slate-500 dark:text-slate-400">Quote</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">ELSTER</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {depreciationItems.map((item) => {
                        const computed = structuredTax?.depreciationItems.find((candidate) => candidate.id === item.id);
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={item.label ?? ""}
                                onChange={(e) => setDepreciationItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, label: e.target.value } : candidate))}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                placeholder="z. B. Gebäude Kesslerberg"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={item.item_type ?? "building"}
                                onChange={(e) => setDepreciationItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, item_type: e.target.value as TaxDepreciationItem["item_type"] } : candidate))}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              >
                                <option value="building">Gebäude</option>
                                <option value="movable_asset">Inventar</option>
                                <option value="outdoor">Außenanlagen</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.gross_annual_amount ?? ""}
                                onChange={(e) => setDepreciationItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, gross_annual_amount: Number(e.target.value.replace(",", ".")) || 0 } : candidate))}
                                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.apply_rental_ratio ?? true}
                                onChange={(e) => setDepreciationItems((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, apply_rental_ratio: e.target.checked } : candidate))}
                              />
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                              {computed != null ? `${computed.deductible_amount_elster.toLocaleString("de-DE")} €` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveLogicItem("depreciation", item)}
                                  disabled={savingLogicId === item.id}
                                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  {savingLogicId === item.id ? "..." : "Speichern"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteLogicItem("depreciation", item.id)}
                                  disabled={deletingLogicId === item.id}
                                  className="rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
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

            <section
              id="maintenance-distributions-card"
              className={`rounded-xl border bg-white shadow-sm transition-all duration-500 dark:bg-slate-900 ${
                highlightedSectionId === "maintenance-distributions-card"
                  ? "border-blue-400 ring-2 ring-blue-500/20 dark:border-blue-500"
                  : "border-slate-200 dark:border-slate-800"
              }`}
            >
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Klassifizierte Ausgaben</h3>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Jede Ausgabe wird als Erhaltungsaufwand, Herstellungskosten oder AfA eingeordnet. Bei Erhaltungsaufwand kannst du zwischen Sofortabzug und Verteilung wählen.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addMaintenanceDistribution}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Verteilungsblock hinzufügen
                </button>
              </div>
              <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-3 dark:border-slate-800 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={transactionNameFilter}
                    onChange={(e) => setTransactionNameFilter(e.target.value)}
                    placeholder="Nach Name oder Beschreibung filtern"
                    className="w-64 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <select
                    value={transactionCategoryFilter}
                    onChange={(e) => setTransactionCategoryFilter(e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="">Alle Kategorien</option>
                    {availableTransactionCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={transactionAmountFilter}
                    onChange={(e) => setTransactionAmountFilter(e.target.value)}
                    placeholder="Nach Betrag filtern"
                    className="w-48 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                  <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={showOnlyUnassignedTransactions}
                      onChange={(e) => setShowOnlyUnassignedTransactions(e.target.checked)}
                    />
                    Nur noch nicht verschobene Buchungen
                  </label>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Verknüpfte Zahlungen werden nach dem Speichern aus den normalen Werbungskosten entfernt.
                </p>
              </div>
              {maintenanceDistributions.length === 0 ? (
                <p className="px-5 py-5 text-sm text-slate-500 dark:text-slate-400">Noch keine Verteilungsblöcke für {taxYear} aktiv.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                        <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Bezeichnung</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Klasse</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Abzug</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Buchungen</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Ursprung</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Gesamt</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Jahre</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Jahresanteil</th>
                        <th className="px-4 py-3 text-center font-medium text-slate-500 dark:text-slate-400">Quote</th>
                        <th className="px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Ziel</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">ELSTER</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Aktion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {maintenanceDistributions.map((item) => {
                        const isNewItem = item.id.startsWith("new-");
                        const computed = structuredTax?.maintenanceDistributions.find((candidate) => candidate.id === item.id);
                        const selectedTransactionIds = item.source_transaction_ids ?? [];
                        const selectedTransactions = selectedTransactionIds
                          .map((transactionId) => transactionMap.get(transactionId))
                          .filter((value): value is CandidateTransaction => Boolean(value));
                        const availableForItem = getAvailableTransactionsForItem(selectedTransactionIds);
                        return (
                          <tr key={item.id}>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                value={item.label ?? ""}
                                onChange={(e) => setMaintenanceDistributions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, label: e.target.value } : candidate))}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                placeholder="z. B. Erhaltungsaufwand 2024"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={item.classification ?? "maintenance_expense"}
                                onChange={(e) => setMaintenanceDistributions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, classification: e.target.value as TaxMaintenanceDistributionItem["classification"] } : candidate))}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              >
                                <option value="maintenance_expense">Erhaltungsaufwand</option>
                                <option value="production_cost">Herstellungskosten</option>
                                <option value="depreciation">AfA</option>
                              </select>
                            </td>
                            <td className="px-4 py-3">
                              <select
                                value={item.deduction_mode ?? "distributed"}
                                onChange={(e) => setMaintenanceDistributions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, deduction_mode: e.target.value as TaxMaintenanceDistributionItem["deduction_mode"] } : candidate))}
                                disabled={(item.classification ?? "maintenance_expense") !== "maintenance_expense"}
                                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              >
                                <option value="immediate">sofort abziehen</option>
                                <option value="distributed">verteilen</option>
                              </select>
                            </td>
                            <td className="px-4 py-3 align-top">
                              <div className="w-72 space-y-2">
                                {isNewItem ? (
                                  <>
                                    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                                      1. Kategorie festlegen
                                      <br />
                                      2. Danach passende Buchungen aus {taxYear} auswählen
                                    </div>
                                    <div className="flex justify-end">
                                      <button
                                        type="button"
                                        onClick={() => assignVisibleTransactionsToMaintenance(item.id)}
                                        className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                      >
                                        Alle sichtbaren übernehmen
                                      </button>
                                    </div>
                                    <div className="max-h-36 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/60">
                                      {availableForItem.length === 0 && selectedTransactions.length === 0 ? (
                                        <p className="text-xs text-slate-500 dark:text-slate-400">Keine passenden Banking-Buchungen im Jahr {taxYear} gefunden.</p>
                                      ) : (
                                        availableForItem.map((transaction) => (
                                          <label key={transaction.id} className="flex items-start gap-2 rounded-md px-1 py-1 text-xs text-slate-600 dark:text-slate-300">
                                            <input
                                              type="checkbox"
                                              checked={selectedTransactionIds.includes(transaction.id)}
                                              onChange={(e) => toggleMaintenanceTransaction(item.id, transaction.id, e.target.checked)}
                                            />
                                            <span className="min-w-0">
                                              <span className="block truncate font-medium text-slate-700 dark:text-slate-200">
                                                {transaction.counterpart || transaction.description || "Buchung"}
                                              </span>
                                              <span className="block truncate text-slate-500 dark:text-slate-400">
                                                {formatDateForDisplay(transaction.date)} · {Math.abs(Number(transaction.amount)).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                                                {transaction.description ? ` · ${transaction.description}` : ""}
                                              </span>
                                            </span>
                                          </label>
                                        ))
                                      )}
                                    </div>
                                    {selectedTransactions.length > 0 && (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {selectedTransactions.length} Buchung(en) ausgewählt. Nach dem Speichern werden diese Zahlungen aus den normalen Werbungskosten herausgerechnet und in diesem Block fortgeführt.
                                      </p>
                                    )}
                                  </>
                                ) : (
                                  <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60">
                                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                      Fortgeführter Verteilungsblock
                                    </p>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                      Die Ursprungsbuchung stammt aus {item.source_year ?? "einem Vorjahr"} und ist hier deshalb nicht erneut auswählbar.
                                    </p>
                                    {selectedTransactions.length > 0 ? (
                                      <div className="space-y-1">
                                        {selectedTransactions.map((transaction) => (
                                          <div key={transaction.id} className="rounded-md bg-white px-2 py-1.5 text-[11px] text-slate-600 dark:bg-slate-900 dark:text-slate-300">
                                            <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                                              {transaction.counterpart || transaction.description || "Buchung"}
                                            </p>
                                            <p className="truncate text-slate-500 dark:text-slate-400">
                                              {formatDateForDisplay(transaction.date)} · {Math.abs(Number(transaction.amount)).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 })}
                                            </p>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        Keine verknüpfte Einzelbuchung hinterlegt. Der Block wird über die gespeicherten Vorjahreswerte fortgeführt.
                                      </p>
                                    )}
                                  </div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                value={item.source_year ?? taxYear}
                                onChange={(e) => setMaintenanceDistributions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, source_year: Number(e.target.value) || taxYear } : candidate))}
                                className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.total_amount ?? ""}
                                onChange={(e) => setMaintenanceDistributions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, total_amount: Number(e.target.value.replace(",", ".")) || 0 } : candidate))}
                                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="number"
                                min={(item.deduction_mode ?? "distributed") === "distributed" ? 2 : 1}
                                max={(item.deduction_mode ?? "distributed") === "distributed" ? 5 : 1}
                                value={(item.classification ?? "maintenance_expense") === "maintenance_expense"
                                  ? ((item.deduction_mode ?? "distributed") === "distributed" ? (item.distribution_years ?? 3) : 1)
                                  : (item.distribution_years ?? 50)}
                                onChange={(e) => setMaintenanceDistributions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, distribution_years: Number(e.target.value) || 1 } : candidate))}
                                disabled={(item.classification ?? "maintenance_expense") !== "maintenance_expense" || (item.deduction_mode ?? "distributed") === "immediate"}
                                className="w-20 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <input
                                type="text"
                                inputMode="decimal"
                                value={item.current_year_share_override ?? ""}
                                onChange={(e) => setMaintenanceDistributions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, current_year_share_override: e.target.value === "" ? null : (Number(e.target.value.replace(",", ".")) || null) } : candidate))}
                                className="w-28 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-right text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                                placeholder={computed?.current_year_share?.toString() ?? "auto"}
                              />
                            </td>
                            <td className="px-4 py-3 text-center">
                              <input
                                type="checkbox"
                                checked={item.apply_rental_ratio ?? true}
                                onChange={(e) => setMaintenanceDistributions((current) => current.map((candidate) => candidate.id === item.id ? { ...candidate, apply_rental_ratio: e.target.checked } : candidate))}
                              />
                            </td>
                            <td className="px-4 py-3">
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                <p>{computed?.tax_field === "maintenance_costs" ? "Z. 40" : computed?.tax_field === "depreciation_building" ? "Z. 33" : "Z. 36"}</p>
                                {computed?.auto_switched_to_afa && (
                                  <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
                                    15%-Grenze
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">
                              {computed != null ? `${computed.deductible_amount_elster.toLocaleString("de-DE")} €` : "—"}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => void saveLogicItem("maintenance_distribution", item)}
                                  disabled={savingLogicId === item.id}
                                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                >
                                  {savingLogicId === item.id ? "..." : "Speichern"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deleteLogicItem("maintenance_distribution", item.id)}
                                  disabled={deletingLogicId === item.id}
                                  className="rounded-lg border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
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

            {editing && (
              <div className="space-y-3">
                {saveError && (
                  <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">{saveError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    disabled={saving}
                    className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {saving ? "Speichert…" : "Änderungen speichern"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Steuerdaten löschen?</h3>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Alle Daten für das Steuerjahr {taxYear} werden unwiderruflich gelöscht.
              </p>
              <div className="mt-5 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => void handleDelete()}
                  disabled={deleting}
                  className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Lösche…" : "Endgültig löschen"}
                </button>
              </div>
            </div>
          </div>
        )}
        {showCalculationPrep && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Jahresdaten vor der Berechnung prüfen</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                    Das ist optional, hilft aber dabei, dass die Berechnung direkt mit den richtigen Jahreswerten arbeitet.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCalculationPrep(false)}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Schließen
                </button>
              </div>

              <div className="mt-5 grid gap-4 md:grid-cols-3">
                <div className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Eigennutzung</p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    {taxSettings ? `${taxSettings.eigennutzung_tage} von ${taxSettings.gesamt_tage} Tagen` : "Noch keine Jahreswerte"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Direkt oben auf dieser Seite bearbeitbar.
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">GbR Sonder-WK</p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    {gbrSettings ? "Je Beteiligtem im FE/FB-Bereich pflegbar" : "Nicht relevant für dieses Objekt"}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {gbrSettings ? "Vor allem bei Feststellungserklärungen sinnvoll." : "Nur bei GbR nötig."}
                  </p>
                </div>
                <div className="rounded-lg bg-slate-50 px-3 py-3 dark:bg-slate-800/60">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Verteilte Ausgaben</p>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">
                    {maintenanceDistributions.length} aktive Verteilungsblöcke
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Banking-Buchungen können unten direkt zugeordnet werden.
                  </p>
                </div>
              </div>

              <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                Empfohlene Reihenfolge:
                <div className="mt-2 space-y-1 text-sm">
                  <p>1. Jahreswerte für Eigennutzung prüfen</p>
                  <p>2. Verteilte Handwerker-/Sanierungsrechnungen zuordnen</p>
                  <p>3. Bei GbR Sonderwerbungskosten je Beteiligtem ergänzen</p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap justify-between gap-3">
                <div className="flex gap-3">
                  <button
                    type="button"
                      onClick={() => {
                        setShowCalculationPrep(false);
                        jumpToSection("jahreswerte-card");
                      }}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Jahreswerte prüfen
                  </button>
                  {gbrSettings && (
                    <Link
                      href={`/dashboard/properties/${id}/tax/${taxYear}/gbr`}
                      className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                      Sonder-WK öffnen
                    </Link>
                  )}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={async () => {
                      setShowCalculationPrep(false);
                      await runCalculation();
                    }}
                    disabled={calculating}
                    className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                  >
                    Überspringen & berechnen
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      if (taxSettings) {
                        await saveTaxSettings();
                      }
                      setShowCalculationPrep(false);
                      await runCalculation();
                    }}
                    disabled={calculating || savingTaxSettings}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                  >
                    {calculating || savingTaxSettings ? "Läuft…" : "Speichern & berechnen"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function buildDefaultDepreciationItems(args: {
  property: Property;
  taxYear: number;
  taxData: TaxData | null;
}): LocalDepreciationItem[] {
  const { property, taxYear, taxData } = args;
  const items: LocalDepreciationItem[] = [];
  const derivedBuildingAmount = deriveAnnualAmount(property.gebaeudewert, property.afa_satz, property.baujahr);
  const hasPropertyBuildingAmount = Number(property.afa_jahresbetrag ?? 0) > 0;
  const hasDerivedBuildingAmount = derivedBuildingAmount > 0;
  const buildingAmountSource =
    hasPropertyBuildingAmount
      ? Number(property.afa_jahresbetrag)
      : hasDerivedBuildingAmount
        ? derivedBuildingAmount
        : Number(taxData?.depreciation_building ?? 0);
  const buildingAmount = Math.max(0, Number(buildingAmountSource));

  if (buildingAmount > 0) {
    items.push({
      id: `prefill-building-${taxYear}`,
      property_id: property.id,
      tax_year: taxYear,
      item_type: "building",
      label: `Gebäude · ${property.name}`,
      gross_annual_amount: round2(buildingAmount),
      apply_rental_ratio: hasPropertyBuildingAmount || hasDerivedBuildingAmount,
    });
  }

  const fixturesAmount = Math.max(0, Number(taxData?.depreciation_fixtures ?? 0));
  if (fixturesAmount > 0) {
    items.push({
      id: `prefill-fixtures-${taxYear}`,
      property_id: property.id,
      tax_year: taxYear,
      item_type: "movable_asset",
      label: "Inventar",
      gross_annual_amount: round2(fixturesAmount),
      apply_rental_ratio: false,
    });
  }

  const outdoorAmount = Math.max(0, Number(taxData?.depreciation_outdoor ?? 0));
  if (outdoorAmount > 0) {
    items.push({
      id: `prefill-outdoor-${taxYear}`,
      property_id: property.id,
      tax_year: taxYear,
      item_type: "outdoor",
      label: "Außenanlagen",
      gross_annual_amount: round2(outdoorAmount),
      apply_rental_ratio: false,
    });
  }

  return items;
}

function mergeMissingPrefillDepreciationItems(args: {
  existingItems: TaxDepreciationItem[];
  property: Property | null;
  taxYear: number;
  taxData: TaxData | null;
}): LocalDepreciationItem[] {
  const { existingItems, property, taxYear, taxData } = args;
  if (!property) return existingItems;

  const prefills = buildDefaultDepreciationItems({ property, taxYear, taxData });
  const presentTypes = new Set(
    existingItems
      .filter((item) => Number(item.gross_annual_amount ?? 0) > 0)
      .map((item) => item.item_type),
  );

  const missingPrefills = prefills.filter(
    (item) => Number(item.gross_annual_amount ?? 0) > 0 && !presentTypes.has(item.item_type ?? "building"),
  );

  return [...existingItems, ...missingPrefills];
}

function deriveAnnualAmount(
  baseValue: number | null,
  afaRate: number | null,
  buildYear: number | null,
) {
  const basis = Number(baseValue ?? 0);
  if (basis <= 0) return 0;
  if (afaRate != null && afaRate > 0) return basis * afaRate;
  if (buildYear != null) {
    if (buildYear < 1925) return basis * 0.025;
    if (buildYear >= 2023) return basis * 0.03;
  }
  return basis * 0.02;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function Skeleton() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl space-y-6">
        <div className="h-8 w-64 animate-pulse rounded-lg bg-slate-200 dark:bg-slate-800" />
        {[1, 2, 3, 4].map((i) => <div key={i} className="h-40 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />)}
      </section>
    </main>
  );
}
