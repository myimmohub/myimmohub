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

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: number | null | undefined) => Number(value ?? 0);
const sumAmounts = <T extends { deductible_amount_elster: number }>(items: T[]) =>
  items.reduce((sum, item) => sum + item.deductible_amount_elster, 0);
const taxFieldForItemType: Record<TaxDepreciationItem["item_type"], ComputedTaxDepreciationItem["tax_field"]> = {
  building: "depreciation_building",
  outdoor: "depreciation_outdoor",
  movable_asset: "depreciation_fixtures",
};
const RAW_PRORATED_FIELDS: (keyof StructuredTaxLineTotals | "loan_interest" | "property_tax" | "hoa_fees" | "insurance" | "water_sewage" | "waste_disposal")[] = [
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
];

export type StructuredTaxComputation = {
  taxData: TaxData;
  depreciationItems: ComputedTaxDepreciationItem[];
  maintenanceDistributions: ComputedTaxMaintenanceDistributionItem[];
  lineTotals: StructuredTaxLineTotals;
  warnings: StructuredTaxWarning[];
};

export function isDistributionActiveForYear(
  item: TaxMaintenanceDistributionItem,
  taxYear: number,
): boolean {
  if (item.status !== "active") return false;
  const lastYear = item.source_year + Math.max(1, item.distribution_years) - 1;
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

  const rentalShareBasisPoints = ratioToBasisPoints(rentalSharePct);
  const warnings: StructuredTaxWarning[] = [];
  const computedDepreciationItems: ComputedTaxDepreciationItem[] = depreciationItems.map((item) => ({
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

  for (const item of maintenanceDistributions) {
    if (acquisitionYear == null) continue;
    if (item.classification !== "maintenance_expense") continue;
    if (item.source_year < acquisitionYear || item.source_year > acquisitionYear + 2) continue;
    acquisitionRelatedTotals.set(
      item.source_year,
      (acquisitionRelatedTotals.get(item.source_year) ?? 0) + Number(item.total_amount ?? 0),
    );
  }

  const acquisitionRelatedTotal3y = Array.from(acquisitionRelatedTotals.values()).reduce((sum, value) => sum + value, 0);
  const exceeds15PctThreshold = buildingCost > 0 && acquisitionRelatedTotal3y > buildingCost * 0.15;
  if (exceeds15PctThreshold) {
    warnings.push({
      code: "acquisition_related_costs",
      message: `Anschaffungsnahe Aufwendungen innerhalb von 3 Jahren überschreiten 15 % der Gebäudekosten (${round2(acquisitionRelatedTotal3y).toLocaleString("de-DE")} € > ${(buildingCost * 0.15).toLocaleString("de-DE", { maximumFractionDigits: 2 })} €) und werden als AfA behandelt.`,
    });
  }

  const computedMaintenanceDistributions = maintenanceDistributions.map((item) => {
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

    const effectiveDistributionYears = effectiveClassification === "maintenance_expense"
      ? item.deduction_mode === "distributed"
        ? clampDistributionYears(item.distribution_years)
        : 1
      : Math.max(1, Math.round(1 / Math.max(0.0001, buildingAfaRate)));

    const currentYearShareCents = item.current_year_share_override != null
      ? toCents(item.current_year_share_override)
      : calcAnnualShareDisplayCents(item.total_amount, effectiveDistributionYears);

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
    nextTaxData.depreciation_building = depreciationLineTotals.depreciation_building;
  }
  if (depreciationLineTotals.depreciation_outdoor != null) {
    nextTaxData.depreciation_outdoor = depreciationLineTotals.depreciation_outdoor;
  }
  if (depreciationLineTotals.depreciation_fixtures != null) {
    nextTaxData.depreciation_fixtures = depreciationLineTotals.depreciation_fixtures;
  }
  if (depreciationLineTotals.maintenance_costs != null) {
    nextTaxData.maintenance_costs = depreciationLineTotals.maintenance_costs;
  }

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

function deriveBuildingAfaRate(taxData: TaxData) {
  if (taxData.build_year != null) {
    if (taxData.build_year < 1925) return 0.025;
    if (taxData.build_year >= 2023) return 0.03;
  }
  return 0.02;
}
