/**
 * POST /api/tax/calculate
 *
 * Berechnet tax_data-Felder aus Transaktionen und speichert/aktualisiert in tax_data.
 * Body: { property_id: string, tax_year: number }
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import {
  calculateTaxFromTransactions,
  getSignedTaxFieldAmount,
  mapTaxFieldToTargetBlock,
  resolveField,
  type TaxCalculationTransaction,
} from "@/lib/tax/calculateTaxFromTransactions";
import { computeStructuredTaxData, isDistributionActiveForYear } from "@/lib/tax/structuredTaxLogic";
import { runRentalTaxEngineFromExistingData } from "@/lib/tax/rentalTaxEngineBridge";
import { buildElsterLineSummary } from "@/lib/tax/elsterLineLogic";
import type {
  ImportedExpenseBlockMetadata,
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

type DbCategory = {
  label: string;
  typ: string;
  anlage_v: string | null;
  gruppe: string;
};

type MaintenanceSourceResolutionItem = {
  type: "maintenance_source";
  label: string;
  target_block: string;
  source_year: number | null;
  gross_amount: number;
  deductible_amount: number;
  included: boolean;
  exclusion_reason: string | null;
};

type ReconciliationItem =
  | MaintenanceSourceResolutionItem
  | {
      type: "transaction" | "maintenance_distribution" | "depreciation_item";
      label: string;
      target_block: string;
      source_year: number | null;
      gross_amount: number;
      deductible_amount: number;
      included: boolean;
      exclusion_reason: string | null;
    };

function normalizeForMatching(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function containsAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

function resolveTransactionTargetBlock(
  tx: TaxCalculationTransaction,
  fieldKey: ReturnType<typeof resolveField>,
) {
  const fallback = mapTaxFieldToTargetBlock(fieldKey);
  const haystack = normalizeForMatching([tx.category, tx.counterpart, tx.description].filter(Boolean).join(" "));
  const isExplicitOtherExpense = containsAny(haystack, [
    "steuerberater",
    "rechtskosten",
    "kammerjager",
    "kammerjaeger",
    "internet",
    "telefon",
    "tv",
    "kurtaxe",
    "tourismusabgabe",
    "werkzeug",
    "material",
    "einrichtung",
    "smart home",
    "entfeuchtungsanlage",
    "schlussel",
    "schluessel",
    "verpflegung",
  ]);

  if (isExplicitOtherExpense) {
    return "other_expenses";
  }

  if (
    fallback === "allocated_costs" ||
    containsAny(haystack, [
      "grundsteuer",
      "versicherung",
      "wohngebaude",
      "mull",
      "abfall",
      "wasser",
      "abwasser",
      "hauswart",
      "hausmeister",
      "heizung",
      "warmwasser",
      "hausbeleuchtung",
      "allgemeinstrom",
      "schornstein",
    ])
  ) {
    return "allocated_costs";
  }

  if (
    fallback === "non_allocated_costs" ||
    containsAny(haystack, [
      "verwaltung",
      "objektverwaltung",
      "immobilienverwaltung",
      "verwaltungspauschale",
      "porto",
      "buro",
      "buero",
      "verwaltungsaufwand",
      "kontofuhr",
      "kontogebuhr",
      "bankgebuhr",
    ])
  ) {
    return "non_allocated_costs";
  }

  if (fallback === "financing_costs") return "financing_costs";
  if (fallback === "maintenance") return "maintenance";
  if (fallback === "depreciation") return "depreciation";
  // Income and unmapped transactions must never land in an expense block
  if (fallback === "income" || fallback === "unmapped") return fallback;
  return "other_expenses";
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function num(value: number | null | undefined) {
  return Number(value ?? 0);
}

function getDepreciationSignature(item: TaxDepreciationItem) {
  return [
    item.property_id,
    item.tax_year,
    item.item_type,
    String(item.label ?? "").trim().toLocaleLowerCase("de-DE"),
    round2(Number(item.gross_annual_amount ?? 0)),
    item.apply_rental_ratio ? "1" : "0",
  ].join("::");
}

function dedupeDepreciationItems(items: TaxDepreciationItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const signature = getDepreciationSignature(item);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function getMaintenanceSignature(item: TaxMaintenanceDistributionItem) {
  const transactionIds = (item.source_transaction_ids ?? []).filter(Boolean).slice().sort().join("|");
  return [
    item.property_id,
    item.source_year,
    String(item.label ?? "").trim().toLocaleLowerCase("de-DE"),
    round2(Number(item.total_amount ?? 0)),
    item.classification,
    item.deduction_mode,
    item.distribution_years,
    item.current_year_share_override == null ? "" : round2(Number(item.current_year_share_override ?? 0)),
    item.apply_rental_ratio ? "1" : "0",
    transactionIds,
  ].join("::");
}

function dedupeMaintenanceItems(items: TaxMaintenanceDistributionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const signature = getMaintenanceSignature(item);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function computeTransactionDeductibleAmount(args: {
  tx: TaxCalculationTransaction;
  targetBlock: string;
  signedAmount: number;
  rentalSharePct: number;
}) {
  const haystack = normalizeForMatching([args.tx.category, args.tx.counterpart, args.tx.description].filter(Boolean).join(" "));
  const fullDeductionKeywords = ["kurtaxe", "tourismusabgabe", "verpflegung arbeitseinsatz", "verpflegung"];

  if (args.targetBlock === "allocated_costs" || args.targetBlock === "non_allocated_costs") {
    return round2(args.signedAmount * args.rentalSharePct);
  }

  if (args.targetBlock === "other_expenses") {
    const applyFullDeduction = containsAny(haystack, fullDeductionKeywords);
    return round2(args.signedAmount * (applyFullDeduction ? 1 : args.rentalSharePct));
  }

  if (args.targetBlock === "financing_costs") {
    return round2(args.signedAmount * args.rentalSharePct);
  }

  return round2(args.signedAmount);
}

function hasOwnManagementTransaction(
  transactions: TaxCalculationTransaction[],
  categories: DbCategory[],
  taxYear: number,
) {
  const dbCategoryMap = new Map(categories.map((category) => [category.label, category]));
  return transactions
    .filter((tx) => tx.date >= `${taxYear}-01-01` && tx.date <= `${taxYear}-12-31`)
    .filter((tx) => tx.category != null && tx.category !== "aufgeteilt")
    .filter((tx) => !(tx.amount < 0 && tx.is_tax_deductible === false))
    .some((tx) => resolveField(tx.category ?? "", tx.anlage_v_zeile, dbCategoryMap) === "property_management");
}

function hasOwnPortoTransaction(
  transactions: TaxCalculationTransaction[],
  taxYear: number,
) {
  return transactions
    .filter((tx) => tx.date >= `${taxYear}-01-01` && tx.date <= `${taxYear}-12-31`)
    .filter((tx) => tx.category != null && tx.category !== "aufgeteilt")
    .filter((tx) => !(tx.amount < 0 && tx.is_tax_deductible === false))
    .some((tx) => normalizeForMatching([tx.category, tx.counterpart, tx.description].filter(Boolean).join(" ")).includes("porto"));
}

function buildCalculatedExpenseBlocks(args: {
  items: ReconciliationItem[];
  taxYear: number;
  taxData?: Partial<TaxData>;
  rentalSharePct: number;
}): ImportedExpenseBlockMetadata[] {
  const totals = new Map<string, { label: string; amount: number; detail?: string | null }>();
  const add = (key: string, label: string, amount: number, detail?: string | null) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    const current = totals.get(key);
    totals.set(key, {
      label,
      amount: Math.round(((current?.amount ?? 0) + amount) * 100) / 100,
      detail: detail ?? current?.detail ?? null,
    });
  };

  for (const item of args.items) {
    if (!item.included) continue;

    if (item.type === "transaction") {
      if (item.target_block === "allocated_costs") {
        add("allocated_costs", "Umlagefähige laufende Kosten", item.deductible_amount, "Grundsteuer, Versicherungen, Betriebskosten");
      } else if (item.target_block === "non_allocated_costs") {
        add("non_allocated_costs", "Nicht umlegbare Objektkosten", item.deductible_amount, "Verwaltung und Kontoführung");
      } else if (item.target_block === "financing_costs") {
        add("financing_costs", "Finanzierungskosten", item.deductible_amount, "Schuldzinsen");
      } else if (item.target_block === "other_expenses") {
        add("other_expenses", "Sonstige Werbungskosten", item.deductible_amount, null);
      }
      continue;
    }

    if (item.type === "maintenance_source" && item.target_block === "maintenance_immediate") {
      add("maintenance_immediate", "Sofort abziehbarer Erhaltungsaufwand", item.deductible_amount, null);
      continue;
    }

    if (item.type === "maintenance_distribution") {
      const sourceYear = item.source_year ?? args.taxYear;
      const key = sourceYear === args.taxYear ? `maintenance_${sourceYear}` : `maintenance_prior_${sourceYear}`;
      const label = sourceYear === args.taxYear
        ? `Verteilter Erhaltungsaufwand ${sourceYear}`
        : `Verteilter Erhaltungsaufwand aus ${sourceYear}`;
      add(key, label, item.deductible_amount, null);
    }
  }

  const aggregatedTaxData = args.taxData;
  if (aggregatedTaxData) {
    const prorate = (value: number) => round2(value * args.rentalSharePct);
    const ensureMinimum = (key: string, label: string, minimumAmount: number, detail?: string | null) => {
      const normalizedMinimum = round2(minimumAmount);
      if (!Number.isFinite(normalizedMinimum) || normalizedMinimum <= 0) return;
      const currentAmount = totals.get(key)?.amount ?? 0;
      const delta = round2(normalizedMinimum - currentAmount);
      if (delta > 0) {
        add(key, label, delta, detail);
      }
    };

    ensureMinimum(
      "allocated_costs",
      "Umlagefähige laufende Kosten",
      prorate(
        num(aggregatedTaxData.property_tax) +
          num(aggregatedTaxData.insurance) +
          num(aggregatedTaxData.hoa_fees) +
          num(aggregatedTaxData.water_sewage) +
          num(aggregatedTaxData.waste_disposal)
      ),
      "Grundsteuer, Versicherungen, Betriebskosten",
    );
    ensureMinimum(
      "non_allocated_costs",
      "Nicht umlegbare Objektkosten",
      prorate(num(aggregatedTaxData.property_management) + num(aggregatedTaxData.bank_fees)),
      "Verwaltung und Kontoführung",
    );
    ensureMinimum(
      "financing_costs",
      "Finanzierungskosten",
      prorate(num(aggregatedTaxData.loan_interest)),
      "Schuldzinsen",
    );
  }

  return Array.from(totals.entries()).map(([key, value]) => ({
    key,
    label: value.label,
    amount: value.amount,
    detail: value.detail ?? null,
  }));
}

function buildMaintenanceSourceResolution(args: {
  transactions: TaxCalculationTransaction[];
  taxYear: number;
  categories: DbCategory[];
  maintenanceDistributions: TaxMaintenanceDistributionItem[];
}) {
  const dbCatMap = new Map(args.categories.map((category) => [category.label, category]));
  const activePlans = args.maintenanceDistributions.filter((item) => isDistributionActiveForYear(item, args.taxYear));
  const planBySourceTransactionId = new Map<string, TaxMaintenanceDistributionItem>();

  for (const plan of activePlans) {
    for (const transactionId of plan.source_transaction_ids ?? []) {
      if (transactionId && !planBySourceTransactionId.has(transactionId)) {
        planBySourceTransactionId.set(transactionId, plan);
      }
    }
  }

  const maintenanceTransactions = args.transactions
    .filter((tx) => tx.date >= `${args.taxYear}-01-01` && tx.date <= `${args.taxYear}-12-31`)
    .filter((tx) => tx.category != null && tx.category !== "aufgeteilt")
    .filter((tx) => resolveField(tx.category ?? "", tx.anlage_v_zeile, dbCatMap) === "maintenance_costs");

  const items: MaintenanceSourceResolutionItem[] = [];
  let immediateTotal = 0;

  for (const tx of maintenanceTransactions) {
    const grossAmount = Math.abs(Number(tx.amount ?? 0));
    const plan = tx.id ? planBySourceTransactionId.get(tx.id) : undefined;

    if (!plan) {
      items.push({
        type: "maintenance_source",
        label: tx.counterpart || tx.description || tx.category || "Erhaltungsaufwand",
        target_block: "excluded",
        source_year: args.taxYear,
        gross_amount: grossAmount,
        deductible_amount: 0,
        included: false,
        exclusion_reason: "Noch keinem steuerlichen Erhaltungsplan zugeordnet",
      });
      continue;
    }

    if (plan.classification === "maintenance_expense" && plan.deduction_mode === "distributed") {
      items.push({
        type: "maintenance_source",
        label: tx.counterpart || tx.description || plan.label,
        target_block: `maintenance_${plan.source_year ?? args.taxYear}`,
        source_year: plan.source_year ?? args.taxYear,
        gross_amount: grossAmount,
        deductible_amount: 0,
        included: false,
        exclusion_reason: `Bereits über Verteilungsplan "${plan.label}" berücksichtigt`,
      });
      continue;
    }

    if (plan.classification === "maintenance_expense") {
      immediateTotal += grossAmount;
      items.push({
        type: "maintenance_source",
        label: tx.counterpart || tx.description || plan.label,
        target_block: "maintenance_immediate",
        source_year: plan.source_year ?? args.taxYear,
        gross_amount: grossAmount,
        deductible_amount: grossAmount,
        included: true,
        exclusion_reason: null,
      });
      continue;
    }

    items.push({
      type: "maintenance_source",
      label: tx.counterpart || tx.description || plan.label,
      target_block: plan.classification === "production_cost" ? "capitalized" : "depreciation",
      source_year: plan.source_year ?? args.taxYear,
      gross_amount: grossAmount,
      deductible_amount: 0,
      included: false,
      exclusion_reason: plan.classification === "production_cost"
        ? "Als Herstellungskosten kapitalisiert"
        : "Über AfA berücksichtigt",
    });
  }

  const unlinkedCurrentYearPlans = activePlans.filter((plan) =>
    (plan.source_year ?? args.taxYear) === args.taxYear &&
    (plan.source_transaction_ids?.length ?? 0) === 0 &&
    plan.classification === "maintenance_expense",
  );

  for (const plan of unlinkedCurrentYearPlans) {
    const grossAmount = Math.abs(Number(plan.total_amount ?? 0));
    const isImmediatePlan = plan.deduction_mode === "immediate";
    if (isImmediatePlan) {
      immediateTotal += grossAmount;
    }
    items.push({
      type: "maintenance_source",
      label: `${plan.label} (Quelle ohne Transaktionslink)`,
      target_block: isImmediatePlan ? "maintenance_immediate" : `maintenance_${plan.source_year ?? args.taxYear}`,
      source_year: plan.source_year ?? args.taxYear,
      gross_amount: grossAmount,
      deductible_amount: isImmediatePlan ? grossAmount : 0,
      included: isImmediatePlan,
      exclusion_reason: isImmediatePlan ? null : "Quelle wird über Verteilungsplan statt Sofortabzug behandelt",
    });
  }

  return {
    immediateTotal: Math.round(immediateTotal * 100) / 100,
    items,
  };
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

  const { property_id, tax_year } = (await request.json()) as { property_id: string; tax_year: number };
  if (!property_id || !tax_year) {
    return NextResponse.json({ error: "property_id und tax_year erforderlich." }, { status: 400 });
  }

  // Load property
  const { data: prop } = await supabase
    .from("properties")
    .select("id, name, kaufpreis, gebaeudewert, grundwert, inventarwert, baujahr, afa_satz, afa_jahresbetrag, kaufdatum, address, type")
    .eq("id", property_id)
    .eq("user_id", user.id)
    .single();

  if (!prop) return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 403 });

  // Load transactions
  const { data: txData } = await supabase
    .from("transactions")
    .select("id, date, amount, category, is_tax_deductible, anlage_v_zeile, description, counterpart")
    .eq("property_id", property_id)
    .eq("user_id", user.id);

  // ── Split matched rent transactions into Kaltmiete + Nebenkosten ─────────────
  // Fetch confirmed payment matches with tenant rent split data
  const { data: paymentMatchData } = await supabase
    .from("payment_matches")
    .select("transaction_id, tenants(cold_rent_cents, additional_costs_cents)")
    .eq("property_id", property_id)
    .in("status", ["confirmed", "auto_matched"]);

  const splitMap = new Map<string, { coldRentCents: number; additionalCostsCents: number }>();
  for (const m of (paymentMatchData ?? [])) {
    const t = Array.isArray(m.tenants) ? m.tenants[0] : m.tenants;
    if (m.transaction_id && t) {
      splitMap.set(m.transaction_id as string, {
        coldRentCents: (t as { cold_rent_cents: number; additional_costs_cents: number }).cold_rent_cents ?? 0,
        additionalCostsCents: (t as { cold_rent_cents: number; additional_costs_cents: number }).additional_costs_cents ?? 0,
      });
    }
  }

  const RENT_INCOME_CATS = new Set(["Mieteinnahmen", "Ferienvermietung – Einnahmen", "miete_einnahmen_wohnen", "miete_einnahmen_gewerbe"]);

  const processedTxData: TaxCalculationTransaction[] = [];
  for (const tx of (txData ?? []) as TaxCalculationTransaction[]) {
    const split = tx.id ? splitMap.get(tx.id) : undefined;
    const isRent = tx.category != null && RENT_INCOME_CATS.has(tx.category);

    if (split && isRent && split.additionalCostsCents > 0) {
      const total = split.coldRentCents + split.additionalCostsCents;
      const coldRentRatio = total > 0 ? split.coldRentCents / total : 1;
      // Cold rent portion → Mieteinnahmen
      processedTxData.push({ ...tx, amount: Number(tx.amount) * coldRentRatio, category: "Mieteinnahmen" });
      // Additional costs portion → Nebenkostenerstattungen
      processedTxData.push({ ...tx, id: (tx.id ?? "") + "_nk", amount: Number(tx.amount) * (1 - coldRentRatio), category: "Nebenkostenerstattungen" });
    } else {
      processedTxData.push(tx);
    }
  }

  // Load categories
  const { data: categories } = await supabase
    .from("categories")
    .select("label, typ, anlage_v, gruppe");

  const [
    { data: gbrSettings },
    { data: taxSettings },
    { data: depreciationItems },
    { data: maintenanceItems },
  ] = await Promise.all([
    supabase.from("gbr_settings").select("*, gbr_partner(*)").eq("property_id", property_id).maybeSingle(),
    supabase
      .from("tax_settings")
      .select("eigennutzung_tage, gesamt_tage, rental_share_override_pct, verwaltungspauschale_eur, porto_pauschale_eur, tax_year")
      .eq("property_id", property_id)
      .in("tax_year", [0, tax_year])
      .order("tax_year", { ascending: false })
      .limit(1),
    supabase.from("tax_depreciation_items").select("*").eq("property_id", property_id).eq("tax_year", tax_year).order("created_at", { ascending: true }),
    supabase.from("tax_maintenance_distributions").select("*").eq("property_id", property_id).order("source_year", { ascending: true }),
  ]);
  const effectiveTaxSettings = taxSettings?.[0] ?? null;
  const normalizedDepreciationItems = dedupeDepreciationItems((depreciationItems ?? []) as TaxDepreciationItem[]);
  const normalizedMaintenanceItems = dedupeMaintenanceItems((maintenanceItems ?? []) as TaxMaintenanceDistributionItem[]);
  const excludedTransactionIds = Array.from(new Set(
    normalizedMaintenanceItems.flatMap((item) => Array.isArray(item.source_transaction_ids) ? item.source_transaction_ids : []),
  ));

  const rentalSharePct = effectiveTaxSettings?.rental_share_override_pct != null
    ? effectiveTaxSettings.rental_share_override_pct / 100
    : effectiveTaxSettings?.eigennutzung_tage != null && effectiveTaxSettings?.gesamt_tage != null
      ? Math.max(0, Math.min(1, 1 - effectiveTaxSettings.eigennutzung_tage / effectiveTaxSettings.gesamt_tage))
      : 1.0;

  const calculated = calculateTaxFromTransactions(
    processedTxData,
    prop as { kaufpreis: number | null; gebaeudewert: number | null; grundwert: number | null; inventarwert: number | null; baujahr: number | null; afa_satz: number | null; afa_jahresbetrag: number | null; kaufdatum: string | null; address: string | null; type: string | null },
    tax_year,
    (categories ?? []) as DbCategory[],
    excludedTransactionIds,
  );

  const maintenanceSourceResolution = buildMaintenanceSourceResolution({
    transactions: processedTxData,
    taxYear: tax_year,
    categories: ((categories ?? []) as DbCategory[]),
    maintenanceDistributions: normalizedMaintenanceItems,
  });
  calculated.maintenance_costs = maintenanceSourceResolution.immediateTotal;

  const managementFallback = Number(effectiveTaxSettings?.verwaltungspauschale_eur ?? 240);
  const portoFallback = Number(effectiveTaxSettings?.porto_pauschale_eur ?? 17);
  const hasManagementTx = hasOwnManagementTransaction(processedTxData, ((categories ?? []) as DbCategory[]), tax_year);
  const hasPortoTx = hasOwnPortoTransaction(processedTxData, tax_year);
  const nonAllocableFallback = round2(
    (!hasManagementTx && Number.isFinite(managementFallback) ? managementFallback * rentalSharePct : 0) +
    (!hasPortoTx && Number.isFinite(portoFallback) ? portoFallback * rentalSharePct : 0),
  );
  if (nonAllocableFallback > 0) {
    calculated.property_management = round2(Number(calculated.property_management ?? 0) + nonAllocableFallback);
  }

  // Upsert: nur berechnete Felder setzen, manuelle Werte nicht überschreiben
  const { data: existing } = await supabase
    .from("tax_data")
    .select("*")
    .eq("property_id", property_id)
    .eq("tax_year", tax_year)
    .single();

  // ── Hilfsfunktion: Structured Tax Data berechnen & in DB schreiben ──────────
  async function applyStructuredData(baseData: TaxData): Promise<{ finalData: TaxData; reconciliation: ReturnType<typeof buildReconciliation> }> {
    const structured = computeStructuredTaxData({
      taxData: baseData,
      taxYear: tax_year,
      rentalSharePct,
      depreciationItems: normalizedDepreciationItems,
      maintenanceDistributions: normalizedMaintenanceItems,
    });

    // Nur Felder aus dem strukturierten Ergebnis schreiben, die tatsächlich berechnet wurden
    const structuredPatch: Record<string, unknown> = {};
    const assignIfChanged = (key: "depreciation_building" | "depreciation_outdoor" | "depreciation_fixtures") => {
      const nextValue = structured.taxData[key];
      const baseValue = baseData[key];
      const normalizedNext = nextValue == null ? null : Number(nextValue);
      const normalizedBase = baseValue == null ? null : Number(baseValue);
      if (normalizedNext === normalizedBase) return;
      structuredPatch[key] = normalizedNext;
    };
    // maintenance_costs is NOT patched here: it must stay as the immediate-only transaction amount.
    // §82b distribution annual shares are computed on-the-fly by buildElsterLineSummary.
    if (structured.lineTotals.depreciation_building != null) {
      structuredPatch.depreciation_building = structured.taxData.depreciation_building;
    } else {
      assignIfChanged("depreciation_building");
    }
    if (structured.lineTotals.depreciation_outdoor != null) {
      structuredPatch.depreciation_outdoor = structured.taxData.depreciation_outdoor;
    } else {
      assignIfChanged("depreciation_outdoor");
    }
    if (structured.lineTotals.depreciation_fixtures != null) {
      structuredPatch.depreciation_fixtures = structured.taxData.depreciation_fixtures;
    } else {
      assignIfChanged("depreciation_fixtures");
    }

    let finalData = structured.taxData;
    if (Object.keys(structuredPatch).length > 0 && baseData.id) {
      const { data: patched } = await supabase
        .from("tax_data")
        .update(structuredPatch)
        .eq("id", baseData.id)
        .select()
        .single();
      if (patched) finalData = patched as TaxData;
    }

    const reconciliation = buildReconciliation(structured, finalData, maintenanceSourceResolution.items);
    const nextImportConfidence = {
      ...(typeof finalData.import_confidence === "object" && finalData.import_confidence != null ? finalData.import_confidence : {}),
      __expense_blocks: reconciliation.calculated_expense_blocks,
    };

    if (baseData.id) {
      const { data: patchedConfidence } = await supabase
        .from("tax_data")
        .update({ import_confidence: nextImportConfidence })
        .eq("id", baseData.id)
        .select()
        .single();
      if (patchedConfidence) {
        finalData = patchedConfidence as TaxData;
      } else {
        finalData = { ...finalData, import_confidence: nextImportConfidence };
      }
    } else {
      finalData = { ...finalData, import_confidence: nextImportConfidence };
    }

    return { finalData, reconciliation };
  }

  function buildReconciliation(
    structured: ReturnType<typeof computeStructuredTaxData>,
    finalData: TaxData,
    maintenanceSourceItems: MaintenanceSourceResolutionItem[],
  ) {
    const inferTargetBlock = (label: string, type: "transaction" | "maintenance_distribution" | "depreciation_item", sourceYear: number | null) => {
      if (type === "depreciation_item") return "depreciation";
      if (type === "maintenance_distribution") return sourceYear != null && sourceYear < tax_year ? `maintenance_${sourceYear}` : `maintenance_${tax_year}`;
      const normalized = label.toLowerCase();
      if (normalized.includes("grundsteuer") || normalized.includes("versicherung") || normalized.includes("hausgeld") || normalized.includes("weg") || normalized.includes("wasser") || normalized.includes("müll")) return "allocated_costs";
      if (normalized.includes("kontoführung") || normalized.includes("verwaltung")) return "non_allocated_costs";
      if (normalized.includes("schuldzinsen")) return "financing_costs";
      return "other_expenses";
    };

    const allDists = normalizedMaintenanceItems;
    const dbCategoryMap = new Map((categories ?? []).map((category) => [category.label, category]));
    const transactionItems = ((txData ?? []) as TaxCalculationTransaction[])
      .filter((tx) => tx.date >= `${tax_year}-01-01` && tx.date <= `${tax_year}-12-31`)
      .filter((tx) => tx.category != null && tx.category !== "aufgeteilt")
      .filter((tx) => !(tx.amount < 0 && tx.is_tax_deductible === false))
      .filter((tx) => !(tx.id && excludedTransactionIds.includes(tx.id)))
      .map((tx) => {
        const fieldKey = resolveField(tx.category ?? "", tx.anlage_v_zeile, dbCategoryMap);
        const block = resolveTransactionTargetBlock(tx, fieldKey);
        const dbCat = dbCategoryMap.get(tx.category ?? "");
        const signedTaxAmount = getSignedTaxFieldAmount({
          amount: Number(tx.amount ?? 0),
          category: tx.category ?? null,
          dbCategory: dbCat,
        });
        const absoluteAmount = Math.abs(signedTaxAmount);
        const deductibleAmount = computeTransactionDeductibleAmount({
          tx,
          targetBlock: block,
          signedAmount: signedTaxAmount,
          rentalSharePct,
        });
        return {
          type: "transaction" as const,
          label: tx.counterpart || tx.description || tx.category || "Transaktion",
          target_block: block,
          source_year: null as number | null,
          gross_amount: absoluteAmount,
          deductible_amount: deductibleAmount,
          included: fieldKey != null,
          exclusion_reason: fieldKey == null ? "Keine steuerliche Zuordnung" : null,
        };
      });
    const items = [
      ...maintenanceSourceItems,
      ...transactionItems,
      // Instandhaltungsverteilungen
      ...allDists.map((item) => {
        const active = isDistributionActiveForYear(item, tax_year);
        const computed = structured.maintenanceDistributions.find((d) => d.id === item.id);
        return {
          type: "maintenance_distribution" as const,
          label: item.label,
          target_block: inferTargetBlock(item.label, "maintenance_distribution", item.source_year),
          source_year: item.source_year,
          gross_amount: Number(item.total_amount),
          deductible_amount: computed?.deductible_amount_elster ?? 0,
          included: active,
          exclusion_reason: !active
            ? item.status !== "active"
              ? `Status: ${item.status}`
              : `Nicht aktiv für ${tax_year} (Quelljahr ${item.source_year}, Verteilung ${item.distribution_years} J.)`
            : null,
        };
      }),
      // AfA-Posten
      ...structured.depreciationItems.map((item) => ({
        type: "depreciation_item" as const,
        label: item.label,
        target_block: inferTargetBlock(item.label, "depreciation_item", null),
        source_year: null as number | null,
        gross_amount: Number(item.gross_annual_amount),
        deductible_amount: item.deductible_amount_elster,
        included: true,
        exclusion_reason: null as string | null,
      })),
      // Gebäude-AfA aus Property-Daten (falls keine expliziten AfA-Posten)
      ...(structured.depreciationItems.length === 0 && finalData.depreciation_building
        ? [{
            type: "depreciation_item" as const,
            label: "Gebäude-AfA (automatisch berechnet)",
            target_block: "depreciation",
            source_year: null as number | null,
            gross_amount: Number(finalData.depreciation_building),
            deductible_amount: Number(finalData.depreciation_building),
            included: true,
            exclusion_reason: null as string | null,
          }]
        : []),
    ];

    const calculatedExpenseBlocks = buildCalculatedExpenseBlocks({
      items,
      taxYear: tax_year,
      taxData: finalData,
      rentalSharePct,
    });
    const lineSummary = buildElsterLineSummary({
      ...finalData,
      import_confidence: {
        ...(typeof finalData.import_confidence === "object" && finalData.import_confidence != null ? finalData.import_confidence : {}),
        __expense_blocks: calculatedExpenseBlocks,
      },
    }, {
      maintenanceDistributions: structured.maintenanceDistributions,
      taxYear: tax_year,
    });

    const einnahmen = lineSummary.income_total;
    const afa = lineSummary.depreciation_total;
    const deductible_without_afa = lineSummary.advertising_costs_total;
    const total_deductible_with_afa = lineSummary.advertising_costs_total + lineSummary.depreciation_total + lineSummary.special_deductions_total;
    const result_before_partner = lineSummary.result;

    return {
      items,
      einnahmen,
      deductible_without_afa,
      total_deductible_with_afa,
      afa,
      result_before_partner,
      calculated_expense_blocks: calculatedExpenseBlocks,
      expense_buckets: lineSummary.expense_buckets,
      depreciation_buckets: lineSummary.depreciation_buckets,
    };
  }

  if (existing) {
    // Ein expliziter Recalculate soll den berechneten Snapshot vollständig erneuern,
    // statt alte importierte/manuelle Feldwerte still mitzuschleppen.
    const updates: Record<string, unknown> = {
      ...calculated,
      import_source: "calculated",
      updated_at: new Date().toISOString(),
    };
    delete updates.tax_year;

    const { data, error } = await supabase
      .from("tax_data")
      .update(updates)
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // ── Structured Data (Instandhaltungsverteilungen + AfA-Posten) persistieren ─
    const { finalData, reconciliation } = await applyStructuredData(data as TaxData);

    const engine = runRentalTaxEngineFromExistingData({
      property: { id: prop.id, name: prop.name ?? null, address: prop.address ?? null },
      taxData: finalData,
      gbrSettings: gbrSettings ?? null,
      taxSettings: effectiveTaxSettings,
      depreciationItems: normalizedDepreciationItems,
      maintenanceDistributions: normalizedMaintenanceItems,
      partnerTaxValues: [],
    });
    return NextResponse.json({
      ...finalData,
      _engine: {
        status: engine.status,
        filing_profile: engine.filingRecommendation.filingProfile,
        blocking_errors: engine.blockingErrors.map((item) => item.message),
        review_flags: engine.reviewFlags.map((item) => item.message),
      },
      _reconciliation: reconciliation,
    });
  }

  // Neuen Eintrag erstellen
  const { data, error } = await supabase
    .from("tax_data")
    .insert({ property_id, ...calculated })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // ── Structured Data persistieren ─────────────────────────────────────────────
  const { finalData, reconciliation } = await applyStructuredData(data as TaxData);

  const engine = runRentalTaxEngineFromExistingData({
    property: { id: prop.id, name: prop.name ?? null, address: prop.address ?? null },
    taxData: finalData,
    gbrSettings: gbrSettings ?? null,
    taxSettings: effectiveTaxSettings,
    depreciationItems: normalizedDepreciationItems,
    maintenanceDistributions: normalizedMaintenanceItems,
    partnerTaxValues: [],
  });
  return NextResponse.json({
    ...finalData,
    _engine: {
      status: engine.status,
      filing_profile: engine.filingRecommendation.filingProfile,
      blocking_errors: engine.blockingErrors.map((item) => item.message),
      review_flags: engine.reviewFlags.map((item) => item.message),
    },
    _reconciliation: reconciliation,
  });
}
