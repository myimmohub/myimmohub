import type {
  ComputedTaxMaintenanceDistributionItem,
  ImportedExpenseBlockMetadata,
  TaxData,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";

export type ElsterLineBucket = {
  key: string;
  label: string;
  amount: number;
  detail?: string;
};

export type ElsterLineSummary = {
  income_total: number;
  advertising_costs_total: number;
  depreciation_total: number;
  special_deductions_total: number;
  result: number;
  income_buckets: ElsterLineBucket[];
  expense_buckets: ElsterLineBucket[];
  depreciation_buckets: ElsterLineBucket[];
  special_buckets: ElsterLineBucket[];
};

export type ElsterAllocatedBucket = ElsterLineBucket & {
  allocated_amount: number;
};

type BuildElsterLineSummaryOptions = {
  maintenanceDistributions?: Array<ComputedTaxMaintenanceDistributionItem | TaxMaintenanceDistributionItem>;
  taxYear?: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const num = (value: number | null | undefined) => Number(value ?? 0);

function readImportedExpenseBlocks(taxData: TaxData) {
  const metadata = taxData.import_confidence?.__expense_blocks;
  if (!Array.isArray(metadata)) return [] as ImportedExpenseBlockMetadata[];

  return metadata.reduce<ImportedExpenseBlockMetadata[]>((acc, item) => {
    if (!item || typeof item !== "object") return acc;
    const row = item as Record<string, unknown>;
    const key = typeof row.key === "string" ? row.key : null;
    const label = typeof row.label === "string" ? row.label : null;
    const amount = typeof row.amount === "number" ? row.amount : Number(row.amount ?? NaN);
    if (!key || !label || !Number.isFinite(amount)) return acc;
    acc.push({
      key,
      label,
      amount,
      detail: typeof row.detail === "string" ? row.detail : null,
    });
    return acc;
  }, []);
}

function normalizeImportedExpenseKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function buildExpenseBucketsFromImport(taxData: TaxData) {
  return readImportedExpenseBlocks(taxData)
    .map((bucket) => ({
      key: normalizeImportedExpenseKey(bucket.key),
      label: bucket.label,
      amount: round2(num(bucket.amount)),
      detail: bucket.detail ?? undefined,
    }))
    .filter((bucket) => bucket.amount !== 0);
}

function isComputedDistribution(
  item: ComputedTaxMaintenanceDistributionItem | TaxMaintenanceDistributionItem,
): item is ComputedTaxMaintenanceDistributionItem {
  return "deductible_amount_elster" in item;
}

function buildMaintenanceBuckets(
  maintenanceDistributions: Array<ComputedTaxMaintenanceDistributionItem | TaxMaintenanceDistributionItem>,
  taxYear: number,
) {
  const grouped = new Map<number, number>();
  let residualImmediateMaintenance = 0;

  for (const item of maintenanceDistributions) {
    const classification = "effective_classification" in item ? item.effective_classification : item.classification;
    if (classification !== "maintenance_expense") continue;

    const amount = isComputedDistribution(item)
      ? num(item.deductible_amount_elster)
      : item.current_year_share_override != null
        ? num(item.current_year_share_override)
        : item.distribution_years > 0
          ? round2(num(item.total_amount) / item.distribution_years)
          : num(item.total_amount);

    if (amount === 0) continue;
    if ((item.source_year ?? taxYear) === taxYear && (item.deduction_mode === "immediate" || item.distribution_years <= 1)) {
      residualImmediateMaintenance += amount;
      continue;
    }
    grouped.set(item.source_year ?? taxYear, round2((grouped.get(item.source_year ?? taxYear) ?? 0) + amount));
  }

  const buckets: ElsterLineBucket[] = Array.from(grouped.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([sourceYear, amount]) => ({
      key: sourceYear === taxYear ? `maintenance_${sourceYear}` : `maintenance_prior_${sourceYear}`,
      label: sourceYear === taxYear
        ? `Verteilter Erhaltungsaufwand ${sourceYear}`
        : `Verteilter Erhaltungsaufwand aus ${sourceYear}`,
      amount: round2(amount),
    }));

  if (residualImmediateMaintenance !== 0) {
    buckets.unshift({
      key: "maintenance_immediate",
      label: "Sofort abziehbarer Erhaltungsaufwand",
      amount: round2(residualImmediateMaintenance),
    });
  }

  return buckets;
}

export function buildElsterLineSummary(
  taxData: TaxData,
  options: BuildElsterLineSummaryOptions = {},
): ElsterLineSummary {
  const taxYear = options.taxYear ?? taxData.tax_year;
  const incomeBuckets: ElsterLineBucket[] = [
    { key: "rent_income", label: "Mieteinnahmen", amount: round2(num(taxData.rent_income)) },
    { key: "operating_costs_income", label: "Nebenkosten / Umlagen", amount: round2(num(taxData.operating_costs_income)) },
    { key: "deposits_received", label: "Vereinnahmte Kautionen", amount: round2(num(taxData.deposits_received)) },
    { key: "rent_prior_year", label: "Mietzahlungen für Vorjahre", amount: round2(num(taxData.rent_prior_year)) },
    { key: "other_income", label: "Sonstige Einnahmen", amount: round2(num(taxData.other_income)) },
  ].filter((bucket) => bucket.amount !== 0);

  const importedExpenseBuckets = buildExpenseBucketsFromImport(taxData);
  const maintenanceBuckets = buildMaintenanceBuckets(options.maintenanceDistributions ?? [], taxYear);
  const hasImportedMaintenanceBlock = importedExpenseBuckets.some((bucket) => bucket.key.includes("maintenance"));

  const fallbackExpenseBuckets: ElsterLineBucket[] = [
    {
      key: "allocated_costs",
      label: "Umlagefähige laufende Kosten",
      amount: round2(num(taxData.hoa_fees) + num(taxData.water_sewage) + num(taxData.waste_disposal)),
      detail: "WEG/Hausgeld, Wasser/Abwasser, Müll",
    },
    {
      key: "non_allocated_costs",
      label: "Nicht umlegbare Objektkosten",
      amount: round2(num(taxData.property_tax) + num(taxData.insurance)),
      detail: "Grundsteuer und Versicherungen",
    },
    {
      key: "financing_admin",
      label: "Finanzierungs- und Verwaltungskosten",
      amount: round2(num(taxData.loan_interest) + num(taxData.property_management) + num(taxData.bank_fees)),
      detail: "Schuldzinsen, Verwaltung, Kontoführung",
    },
    ...maintenanceBuckets,
    {
      key: "other_expenses",
      label: "Sonstige Werbungskosten",
      amount: round2(num(taxData.other_expenses)),
    },
  ].filter((bucket) => bucket.amount !== 0);

  const expenseBuckets = importedExpenseBuckets.length > 0
    ? [
        ...importedExpenseBuckets,
        ...(!hasImportedMaintenanceBlock ? maintenanceBuckets : []),
      ].filter((bucket) => bucket.amount !== 0)
    : fallbackExpenseBuckets;

  const depreciationBuckets: ElsterLineBucket[] = [
    { key: "depreciation_building", label: "AfA Gebäude", amount: round2(num(taxData.depreciation_building)) },
    { key: "depreciation_outdoor", label: "AfA Außenanlagen", amount: round2(num(taxData.depreciation_outdoor)) },
    { key: "depreciation_fixtures", label: "AfA Inventar", amount: round2(num(taxData.depreciation_fixtures)) },
  ].filter((bucket) => bucket.amount !== 0);

  const specialBuckets: ElsterLineBucket[] = [
    { key: "special_deduction_7b", label: "Sonderabschreibung § 7b", amount: round2(num(taxData.special_deduction_7b)) },
    { key: "special_deduction_renovation", label: "Weitere Sonderabzüge", amount: round2(num(taxData.special_deduction_renovation)) },
  ].filter((bucket) => bucket.amount !== 0);

  const incomeTotal = round2(incomeBuckets.reduce((sum, bucket) => sum + bucket.amount, 0));
  const advertisingCostsTotal = round2(expenseBuckets.reduce((sum, bucket) => sum + bucket.amount, 0));
  const depreciationTotal = round2(depreciationBuckets.reduce((sum, bucket) => sum + bucket.amount, 0));
  const specialDeductionsTotal = round2(specialBuckets.reduce((sum, bucket) => sum + bucket.amount, 0));
  const result = round2(incomeTotal - advertisingCostsTotal - depreciationTotal - specialDeductionsTotal);

  return {
    income_total: incomeTotal,
    advertising_costs_total: advertisingCostsTotal,
    depreciation_total: depreciationTotal,
    special_deductions_total: specialDeductionsTotal,
    result,
    income_buckets: incomeBuckets,
    expense_buckets: expenseBuckets,
    depreciation_buckets: depreciationBuckets,
    special_buckets: specialBuckets,
  };
}

export function allocateElsterLineSummary(summary: ElsterLineSummary, anteilPct: number) {
  const factor = anteilPct / 100;
  const allocateBuckets = (buckets: ElsterLineBucket[]): ElsterAllocatedBucket[] =>
    buckets
      .map((bucket) => ({
        ...bucket,
        allocated_amount: round2(bucket.amount * factor),
      }))
      .filter((bucket) => bucket.allocated_amount !== 0);

  return {
    income_total: round2(summary.income_total * factor),
    advertising_costs_total: round2(summary.advertising_costs_total * factor),
    depreciation_total: round2(summary.depreciation_total * factor),
    special_deductions_total: round2(summary.special_deductions_total * factor),
    result: round2(summary.result * factor),
    income_buckets: allocateBuckets(summary.income_buckets),
    expense_buckets: allocateBuckets(summary.expense_buckets),
    depreciation_buckets: allocateBuckets(summary.depreciation_buckets),
    special_buckets: allocateBuckets(summary.special_buckets),
  };
}
