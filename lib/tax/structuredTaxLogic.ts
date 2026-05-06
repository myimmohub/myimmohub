import type {
  ComputedTaxDepreciationItem,
  ComputedTaxMaintenanceDistributionItem,
  StructuredTaxLineTotals,
  StructuredTaxWarning,
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";
import { calcElsterEuroFromCents, fromCents, ratioToBasisPoints, toCents } from "@/lib/tax/elsterMath";
import { ANSCHAFFUNGSNAHE_AUFWAND_QUOTE } from "@/lib/tax/constants";
import { resolveBuildingAfaRate } from "@/lib/tax/afa";

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: number | null | undefined) => Number(value ?? 0);
const sumAmounts = <T extends { deductible_amount_elster: number }>(items: T[]) =>
  items.reduce((sum, item) => sum + item.deductible_amount_elster, 0);
const taxFieldForItemType: Record<TaxDepreciationItem["item_type"], ComputedTaxDepreciationItem["tax_field"]> = {
  building: "depreciation_building",
  outdoor: "depreciation_outdoor",
  movable_asset: "depreciation_fixtures",
};
type ProRatableTaxField =
  | keyof StructuredTaxLineTotals
  | "loan_interest" | "property_tax" | "hoa_fees" | "insurance"
  | "water_sewage" | "waste_disposal"
  // Non-allocated and catch-all WK fields must also be pro-rated for partial private use
  | "property_management" | "bank_fees" | "other_expenses";

const RAW_PRORATED_FIELDS: ProRatableTaxField[] = [
  "loan_interest",
  "property_tax",
  "hoa_fees",
  "insurance",
  "water_sewage",
  "waste_disposal",
  "depreciation_building",
  "depreciation_outdoor",
  "depreciation_fixtures",
  "maintenance_costs",
  "property_management",
  "bank_fees",
  "other_expenses",
];

export type StructuredTaxComputation = {
  taxData: TaxData;
  depreciationItems: ComputedTaxDepreciationItem[];
  maintenanceDistributions: ComputedTaxMaintenanceDistributionItem[];
  lineTotals: StructuredTaxLineTotals;
  warnings: StructuredTaxWarning[];
};

function getDistributionSignature(item: TaxMaintenanceDistributionItem) {
  const transactionIds = (item.source_transaction_ids ?? []).filter(Boolean).slice().sort().join("|");
  return [
    item.property_id,
    item.source_year,
    item.label.trim().toLocaleLowerCase("de-DE"),
    round2(num(item.total_amount)),
    item.classification,
    item.deduction_mode,
    item.distribution_years,
    item.current_year_share_override == null ? "" : round2(num(item.current_year_share_override)),
    item.apply_rental_ratio ? "1" : "0",
    transactionIds,
  ].join("::");
}

function getDepreciationSignature(item: TaxDepreciationItem) {
  return [
    item.property_id,
    item.tax_year,
    item.item_type,
    item.label.trim().toLocaleLowerCase("de-DE"),
    round2(num(item.gross_annual_amount)),
    item.apply_rental_ratio ? "1" : "0",
  ].join("::");
}

function dedupeMaintenanceDistributions(items: TaxMaintenanceDistributionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const signature = getDistributionSignature(item);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
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

export function isDistributionActiveForYear(
  item: TaxMaintenanceDistributionItem,
  taxYear: number,
): boolean {
  if (item.status !== "active") return false;
  const normalizedYears = getNormalizedDistributionYears(item, taxYear);
  const lastYear = item.source_year + Math.max(1, normalizedYears) - 1;
  return taxYear >= item.source_year && taxYear <= lastYear;
}

export function computeStructuredTaxData(args: {
  taxData: TaxData;
  taxYear: number;
  rentalSharePct: number;
  depreciationItems?: TaxDepreciationItem[];
  maintenanceDistributions?: TaxMaintenanceDistributionItem[];
}): StructuredTaxComputation {
  const {
    taxData,
    taxYear,
    rentalSharePct,
    depreciationItems = [],
    maintenanceDistributions = [],
  } = args;
  const normalizedDepreciationItems = dedupeDepreciationItems(depreciationItems);
  const normalizedMaintenanceDistributions = dedupeMaintenanceDistributions(maintenanceDistributions);

  const rentalShareBasisPoints = ratioToBasisPoints(rentalSharePct);
  const warnings: StructuredTaxWarning[] = [];
  const computedDepreciationItems: ComputedTaxDepreciationItem[] = normalizedDepreciationItems.map((item) => ({
    ...item,
    tax_field: taxFieldForItemType[item.item_type],
    deductible_amount_elster: calcElsterEuroFromCents({
      amountCents: toCents(item.gross_annual_amount),
      applyRentalRatio: item.apply_rental_ratio,
      rentalShareBasisPoints,
    }),
  }));

  const depreciationLineTotals: StructuredTaxLineTotals = {
    depreciation_building: null,
    depreciation_outdoor: null,
    depreciation_fixtures: null,
    maintenance_costs: null,
  };

  for (const item of computedDepreciationItems) {
    depreciationLineTotals[item.tax_field] = (depreciationLineTotals[item.tax_field] ?? 0) + item.deductible_amount_elster;
  }

  const buildingCost = Math.max(0, Number(taxData.acquisition_cost_building ?? 0));
  const acquisitionYear = taxData.acquisition_date ? new Date(taxData.acquisition_date).getFullYear() : null;
  const buildingAfaRate = deriveBuildingAfaRate(taxData);
  const acquisitionRelatedTotals = new Map<number, number>();

  for (const item of normalizedMaintenanceDistributions) {
    if (acquisitionYear == null) continue;
    if (item.classification !== "maintenance_expense") continue;
    if (item.source_year < acquisitionYear || item.source_year > acquisitionYear + 2) continue;
    acquisitionRelatedTotals.set(
      item.source_year,
      (acquisitionRelatedTotals.get(item.source_year) ?? 0) + Number(item.total_amount ?? 0),
    );
  }

  const acquisitionRelatedTotal3y = Array.from(acquisitionRelatedTotals.values()).reduce((sum, value) => sum + value, 0);
  const exceeds15PctThreshold = buildingCost > 0 && acquisitionRelatedTotal3y > buildingCost * ANSCHAFFUNGSNAHE_AUFWAND_QUOTE;
  if (exceeds15PctThreshold) {
    warnings.push({
      code: "acquisition_related_costs",
      message: `Anschaffungsnahe Aufwendungen innerhalb von 3 Jahren überschreiten ${(ANSCHAFFUNGSNAHE_AUFWAND_QUOTE * 100).toFixed(0)} % der Gebäudekosten (${round2(acquisitionRelatedTotal3y).toLocaleString("de-DE")} € > ${(buildingCost * ANSCHAFFUNGSNAHE_AUFWAND_QUOTE).toLocaleString("de-DE", { maximumFractionDigits: 2 })} €) und werden als AfA behandelt.`,
    });
  }

  const computedMaintenanceDistributions = normalizedMaintenanceDistributions.map((item) => {
    const affectsTaxYear = isDistributionActiveForYear(item, taxYear);
    const hasClassification = Boolean(item.classification);
    const hasDeductionMode = Boolean(item.deduction_mode);
    if (!hasClassification) {
      warnings.push({
        code: "classification_required",
        message: `Die Ausgabe "${item.label}" ist noch nicht klassifiziert.`,
      });
    }
    if (item.classification === "maintenance_expense" && !hasDeductionMode) {
      warnings.push({
        code: "distribution_is_optional",
        message: `Für "${item.label}" muss gewählt werden, ob der Aufwand sofort abgezogen oder verteilt wird.`,
      });
    }

    const autoSwitchedToAfa = Boolean(
      exceeds15PctThreshold &&
      acquisitionYear != null &&
      item.classification === "maintenance_expense" &&
      item.source_year >= acquisitionYear &&
      item.source_year <= acquisitionYear + 2,
    );
    const effectiveClassification = autoSwitchedToAfa ? "production_cost" : item.classification;
    const taxField: ComputedTaxMaintenanceDistributionItem["tax_field"] = effectiveClassification === "maintenance_expense"
      ? "maintenance_costs"
      : effectiveClassification === "depreciation"
        ? "depreciation_fixtures"
        : "depreciation_building";

    const normalizedDistributionYears = getNormalizedDistributionYears(item, taxYear);
    const effectiveDistributionYears = effectiveClassification === "maintenance_expense"
      ? item.deduction_mode === "distributed"
        ? clampDistributionYears(normalizedDistributionYears)
        : 1
      : Math.max(1, Math.round(1 / Math.max(0.0001, buildingAfaRate)));

    const currentYearShareCents = item.current_year_share_override != null
      ? toCents(item.current_year_share_override)
      : calcAnnualShareDisplayCents(item.total_amount, effectiveDistributionYears);
    // A "carry-forward year share" is a manually-created DB entry for a prior year whose
    // total_amount already represents the annual share (not the full multi-year total).
    // This must NOT apply when distribution_years > 1, because those entries store the full
    // multi-year total and must be divided by effectiveDistributionYears.
    const looksLikeCarryForwardYearShare =
      item.source_year < taxYear &&
      item.current_year_share_override == null &&
      (item.source_transaction_ids?.length ?? 0) === 0 &&
      item.deduction_mode === "distributed" &&
      normalizedDistributionYears <= 1;

    return {
      ...item,
      affects_tax_year: affectsTaxYear,
      tax_field: taxField,
      effective_classification: effectiveClassification,
      auto_switched_to_afa: autoSwitchedToAfa,
      current_year_share: round2(fromCents(currentYearShareCents)),
      deductible_amount_elster: affectsTaxYear
        ? item.current_year_share_override != null
          ? calcElsterEuroFromCents({
              amountCents: currentYearShareCents,
              applyRentalRatio: item.apply_rental_ratio,
              rentalShareBasisPoints,
            })
          : looksLikeCarryForwardYearShare
            ? calcElsterEuroFromCents({
                amountCents: toCents(item.total_amount),
                applyRentalRatio: item.apply_rental_ratio,
                rentalShareBasisPoints,
              })
          : calcElsterEuroFromCents({
              amountCents: toCents(item.total_amount),
              applyRentalRatio: item.apply_rental_ratio,
              rentalShareBasisPoints,
              divisor: effectiveDistributionYears,
            })
        : 0,
    };
  }).filter((item) => item.affects_tax_year);

  if (computedMaintenanceDistributions.length > 0) {
    const maintenanceExpenseItems = computedMaintenanceDistributions.filter((item) => item.tax_field === "maintenance_costs");
    const buildingAfaItems = computedMaintenanceDistributions.filter((item) => item.tax_field === "depreciation_building");
    const fixturesAfaItems = computedMaintenanceDistributions.filter((item) => item.tax_field === "depreciation_fixtures");

    if (maintenanceExpenseItems.length > 0) {
      depreciationLineTotals.maintenance_costs = sumAmounts(maintenanceExpenseItems);
    }
    if (buildingAfaItems.length > 0) {
      depreciationLineTotals.depreciation_building = (depreciationLineTotals.depreciation_building ?? 0) + sumAmounts(buildingAfaItems);
    }
    if (fixturesAfaItems.length > 0) {
      depreciationLineTotals.depreciation_fixtures = (depreciationLineTotals.depreciation_fixtures ?? 0) + sumAmounts(fixturesAfaItems);
    }
  }

  const nextTaxData: TaxData = { ...taxData };
  for (const field of RAW_PRORATED_FIELDS) {
    const existingValue = nextTaxData[field];
    const hasStructuredOverride = depreciationLineTotals[field as keyof StructuredTaxLineTotals] != null;
    if (existingValue == null || hasStructuredOverride) continue;
    nextTaxData[field] = calcElsterEuroFromCents({
      amountCents: toCents(num(existingValue)),
      applyRentalRatio: true,
      rentalShareBasisPoints,
    });
  }
  if (depreciationLineTotals.depreciation_building != null) {
    nextTaxData.depreciation_building = preferImportedElsterLineValue({
      importSource: taxData.import_source,
      originalValue: taxData.depreciation_building,
      computedValue: depreciationLineTotals.depreciation_building,
    });
  } else if (taxData.import_source === "calculated" && taxData.depreciation_building != null) {
    // Calculated snapshots store the gross annual building AfA first.
    // For the Anlage V line we must still apply the rental ratio even if no
    // explicit depreciation item exists yet for the current year.
    nextTaxData.depreciation_building = calcElsterEuroFromCents({
      amountCents: toCents(num(taxData.depreciation_building)),
      applyRentalRatio: true,
      rentalShareBasisPoints,
    });
  }
  if (depreciationLineTotals.depreciation_outdoor != null) {
    nextTaxData.depreciation_outdoor = preferImportedElsterLineValue({
      importSource: taxData.import_source,
      originalValue: taxData.depreciation_outdoor,
      computedValue: depreciationLineTotals.depreciation_outdoor,
    });
  } else if (taxData.import_source === "calculated" && taxData.depreciation_outdoor != null) {
    nextTaxData.depreciation_outdoor = calcElsterEuroFromCents({
      amountCents: toCents(num(taxData.depreciation_outdoor)),
      applyRentalRatio: true,
      rentalShareBasisPoints,
    });
  }
  if (depreciationLineTotals.depreciation_fixtures != null) {
    nextTaxData.depreciation_fixtures = preferImportedElsterLineValue({
      importSource: taxData.import_source,
      originalValue: taxData.depreciation_fixtures,
      computedValue: depreciationLineTotals.depreciation_fixtures,
    });
  } else if (taxData.import_source === "calculated" && taxData.depreciation_fixtures != null) {
    nextTaxData.depreciation_fixtures = calcElsterEuroFromCents({
      amountCents: toCents(num(taxData.depreciation_fixtures)),
      applyRentalRatio: true,
      rentalShareBasisPoints,
    });
  }
  // NOTE: nextTaxData.maintenance_costs is intentionally NOT modified here.
  // taxData.maintenance_costs must always represent only the immediate (sofort abziehbarer)
  // Erhaltungsaufwand from transactions. The §82b distribution annual shares are tracked
  // separately in depreciationLineTotals.maintenance_costs and displayed as individual
  // year buckets by buildElsterLineSummary. Merging them here would cause double-counting
  // on every subsequent call to computeStructuredTaxData (e.g. in buildGbrTaxReport).

  return {
    taxData: nextTaxData,
    depreciationItems: computedDepreciationItems,
    maintenanceDistributions: computedMaintenanceDistributions,
    lineTotals: depreciationLineTotals,
    warnings,
  };
}

function calcAnnualShareDisplayCents(totalAmount: number, distributionYears: number): number {
  const years = Math.max(1, distributionYears);
  const cents = round2(totalAmount / years);
  return toCents(cents);
}

function clampDistributionYears(value: number) {
  return Math.min(5, Math.max(2, Math.round(value || 2)));
}

function getNormalizedDistributionYears(item: TaxMaintenanceDistributionItem, taxYear: number) {
  const minimumYearsForCarryForward = Math.max(1, taxYear - item.source_year + 1);
  if (item.deduction_mode === "distributed") {
    return Math.max(item.distribution_years || 0, minimumYearsForCarryForward);
  }
  return Math.max(1, item.distribution_years || 1);
}

function deriveBuildingAfaRate(taxData: TaxData) {
  // Konsolidiert in `lib/tax/afa.ts` (Auftrag C). Die alte Switch-Logik lebt
  // jetzt zentral dort; dieser Wrapper bleibt nur, damit die bestehenden
  // Aufrufer in dieser Datei kein Refactor brauchen.
  return resolveBuildingAfaRate({
    baujahr: taxData.build_year ?? null,
    kaufdatum: taxData.acquisition_date ?? null,
    propertyType: taxData.property_type ?? null,
  });
}

function preferImportedElsterLineValue(args: {
  importSource?: TaxData["import_source"];
  originalValue: number | null | undefined;
  computedValue: number | null | undefined;
}) {
  const { importSource, originalValue, computedValue } = args;
  if (importSource !== "pdf_import") return computedValue;
  if (originalValue == null || computedValue == null) return computedValue;
  return Math.abs(Number(originalValue) - Number(computedValue)) <= 2 ? Number(originalValue) : computedValue;
}
