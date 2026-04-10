"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { TAX_FIELDS, TAX_FIELD_GROUPS } from "@/lib/tax/fieldMeta";
import { calculateTaxTotals } from "@/lib/tax/gbrTaxReport";
import { computeStructuredTaxData } from "@/lib/tax/structuredTaxLogic";
import TaxYearNavigation from "@/components/tax/TaxYearNavigation";
import type {
  TaxConfidence,
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";

type Property = { id: string; name: string; address: string | null };
type GbrSettingsSummary = { id?: string; feststellungserklaerung: boolean; gbr_partner: { id: string; anteil: number }[] };
type TaxSettingsSummary = { eigennutzung_tage: number; gesamt_tage: number; rental_share_override_pct: number | null };
type LocalDepreciationItem = Partial<TaxDepreciationItem> & { id: string };
type LocalMaintenanceDistribution = Partial<TaxMaintenanceDistributionItem> & { id: string };

const CONFIDENCE_DOT: Record<TaxConfidence | "null", string> = {
  high:   "bg-emerald-500",
  medium: "bg-amber-400",
  low:    "bg-red-500",
  null:   "bg-slate-300 dark:bg-slate-600",
};

const fmtVal = (val: unknown, type: string) => {
  if (val == null || val === "") return "—";
  if (type === "numeric") return Number(val).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 2 });
  if (type === "date") return new Date(val as string).toLocaleDateString("de-DE");
  if (type === "integer") return String(val);
  return String(val);
};

export default function TaxYearPage() {
  const { id, year: yearParam } = useParams<{ id: string; year: string }>();
  const router = useRouter();
  const taxYear = Number(yearParam);

  const [property, setProperty] = useState<Property | null>(null);
  const [taxData, setTaxData] = useState<TaxData | null>(null);
  const [gbrSettings, setGbrSettings] = useState<GbrSettingsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [taxSettings, setTaxSettings] = useState<TaxSettingsSummary | null>(null);
  const [depreciationItems, setDepreciationItems] = useState<LocalDepreciationItem[]>([]);
  const [maintenanceDistributions, setMaintenanceDistributions] = useState<LocalMaintenanceDistribution[]>([]);
  const [logicError, setLogicError] = useState<string | null>(null);
  const [savingLogicId, setSavingLogicId] = useState<string | null>(null);
  const [deletingLogicId, setDeletingLogicId] = useState<string | null>(null);

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
    };
    setDepreciationItems(data.depreciation_items);
    setMaintenanceDistributions(data.maintenance_distributions);
    setLogicError(null);
  }, [id, taxYear]);

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [{ data: prop }, { data: entries }, gbrRes, { data: taxSettingsData }] = await Promise.all([
        supabase.from("properties").select("id, name, address").eq("id", id).eq("user_id", user.id).single(),
        supabase.from("tax_data").select("*").eq("property_id", id).eq("tax_year", taxYear).limit(1),
        fetch(`/api/settings/gbr?property_id=${id}`),
        supabase.from("tax_settings").select("eigennutzung_tage, gesamt_tage, rental_share_override_pct").eq("property_id", id).maybeSingle(),
      ]);

      setProperty(prop as Property | null);
      if (entries && entries.length > 0) {
        setTaxData(entries[0] as TaxData);
      }
      if (gbrRes.ok) {
        const gbr = await gbrRes.json() as GbrSettingsSummary;
        if (gbr.id) setGbrSettings(gbr);
      }
      setTaxSettings((taxSettingsData as TaxSettingsSummary | null) ?? null);
      await loadLogicItems();
      setLoading(false);
    };
    void load();
  }, [id, loadLogicItems, taxYear]);

  const handleCalculate = async () => {
    setCalculating(true);
    const res = await fetch("/api/tax/calculate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ property_id: id, tax_year: taxYear }),
    });
    if (res.ok) {
      setTaxData(await res.json());
    }
    setCalculating(false);
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
  };

  // Count filled fields
  const rentalSharePct = useMemo(() => {
    if (taxSettings?.rental_share_override_pct != null) return taxSettings.rental_share_override_pct;
    const totalDays = Math.max(1, taxSettings?.gesamt_tage ?? 365);
    const selfUseDays = Math.max(0, taxSettings?.eigennutzung_tage ?? 0);
    return Math.max(0, Math.min(1, 1 - selfUseDays / totalDays));
  }, [taxSettings]);

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

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">AfA-Komponenten</h3>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    Gebäude, Inventar und Außenanlagen werden hier positionsbezogen gerechnet und erst danach in die Anlage V übernommen.
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

            <section className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
                        const computed = structuredTax?.maintenanceDistributions.find((candidate) => candidate.id === item.id);
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
      </section>
    </main>
  );
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
