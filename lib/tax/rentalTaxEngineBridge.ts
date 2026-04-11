import {
  computeRentalTaxCase,
  type Asset,
  type ComputeRentalTaxCaseInput,
  type ComputeRentalTaxCaseOutput,
  type ExpenseEvent,
  type ExpenseCategory,
  type FilingProfile,
  type MaintenancePlan,
  type Owner,
  type OwnerSpecificItem,
  type OwnershipPeriod,
  type Property,
  type RevenueCategory,
  type RevenueEvent,
  type TaxSubject,
  type UsageYear,
} from "@/packages/tax-engine-rental-de/src";
import type {
  GbrPartnerTaxData,
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";

type PropertySummary = {
  id: string;
  name: string | null;
  address: string | null;
};

type GbrPartnerSummary = {
  id: string;
  name: string;
  anteil: number;
  email: string | null;
};

type GbrSettingsBridgeSummary = {
  id?: string;
  property_id: string;
  name: string;
  steuernummer: string;
  finanzamt: string;
  feststellungserklaerung: boolean;
  teilweise_eigennutzung: boolean;
  gbr_partner: GbrPartnerSummary[];
};

type TaxSettingsBridgeSummary = {
  eigennutzung_tage?: number | null;
  gesamt_tage?: number | null;
  rental_share_override_pct?: number | null;
};

const num = (value: number | null | undefined) => Number(value ?? 0);
const toCents = (value: number | null | undefined) => Math.round(num(value) * 100);
const fromCents = (value: number) => Math.round(value) / 100;

function deriveBuildingRate(buildYear: number | null | undefined) {
  if (buildYear != null && buildYear < 1925) return 0.025;
  if (buildYear != null && buildYear >= 2023) return 0.03;
  return 0.02;
}

function policyPackIdForYear(taxYear: number) {
  if (taxYear <= 2024) return "de-rental-2024";
  if (taxYear >= 2026) return "de-rental-2026-preview";
  return "de-rental-2025";
}

function mapPropertyType(value: string | null | undefined): Property["propertyType"] {
  const normalized = (value ?? "").toLowerCase();
  if (normalized.includes("ferien")) return "holiday_apartment";
  if (normalized.includes("haus")) return "house";
  if (normalized.includes("garage")) return "garage";
  if (normalized.includes("stellplatz")) return "parking";
  return "apartment";
}

function buildTaxSubject(args: {
  propertyId: string;
  gbrSettings: GbrSettingsBridgeSummary | null;
  partnerTaxValues: GbrPartnerTaxData[];
}): TaxSubject {
  const partners = args.gbrSettings?.gbr_partner ?? [];
  const owners: Owner[] = partners.length > 0
    ? partners.map((partner) => {
        const nameParts = partner.name.trim().split(/\s+/);
        return {
          id: partner.id,
          role: args.gbrSettings ? "participant" : "legal_owner",
          personType: "natural_person",
          firstName: nameParts.slice(0, -1).join(" ") || partner.name,
          lastName: nameParts.slice(-1).join(" ") || partner.name,
          email: partner.email ?? undefined,
        } satisfies Owner;
      })
    : [
        {
          id: `${args.propertyId}-owner`,
          role: "legal_owner",
          personType: "natural_person",
          firstName: "Eigentümer",
          lastName: "Standard",
        },
      ];

  return {
    id: args.gbrSettings?.id ?? `${args.propertyId}-subject`,
    displayName: args.gbrSettings?.name || "Steuersubjekt",
    subjectKind: args.gbrSettings?.feststellungserklaerung ? "assessment_unit" : "person",
    ownershipModelHint: args.gbrSettings?.feststellungserklaerung ? "partnership_asset_management" : undefined,
    residencyStatus: "unlimited_tax",
    filingCountry: "DE",
    taxNumber: args.gbrSettings?.steuernummer,
    taxOffice: args.gbrSettings?.finanzamt,
    owners,
  };
}

function buildOwnershipPeriods(args: {
  taxYear: number;
  propertyId: string;
  taxSubject: TaxSubject;
  gbrSettings: GbrSettingsBridgeSummary | null;
  taxData: TaxData;
}): OwnershipPeriod[] {
  const ownershipSharePct = num(args.taxData.ownership_share_pct) || 100;
  if (args.gbrSettings?.gbr_partner?.length) {
    return args.gbrSettings.gbr_partner.map((partner) => ({
      id: `${args.propertyId}-${partner.id}-${args.taxYear}`,
      propertyId: args.propertyId,
      ownerId: partner.id,
      startDate: `${args.taxYear}-01-01`,
      endDate: `${args.taxYear}-12-31`,
      numerator: Math.round(num(partner.anteil) * 100),
      denominator: 10000,
      reason: "initial",
    }));
  }
  const singleOwner = args.taxSubject.owners[0];
  return [
    {
      id: `${args.propertyId}-${singleOwner.id}-${args.taxYear}`,
      propertyId: args.propertyId,
      ownerId: singleOwner.id,
      startDate: `${args.taxYear}-01-01`,
      endDate: `${args.taxYear}-12-31`,
      numerator: Math.round(ownershipSharePct * 100),
      denominator: 10000,
      reason: "initial",
    },
  ];
}

function buildUsageYear(args: {
  propertyId: string;
  taxYear: number;
  gbrSettings: GbrSettingsBridgeSummary | null;
  taxSettings: TaxSettingsBridgeSummary | null | undefined;
}): UsageYear {
  const totalDays = Math.max(1, Number(args.taxSettings?.gesamt_tage ?? 365));
  const selfUseDays = Number(args.taxSettings?.eigennutzung_tage ?? 0);
  const rentalDays = Math.max(0, totalDays - selfUseDays);
  const mixedUse = Boolean(args.gbrSettings?.teilweise_eigennutzung) || selfUseDays > 0;

  return {
    id: `${args.propertyId}-usage-${args.taxYear}`,
    propertyId: args.propertyId,
    taxYear: args.taxYear,
    rentalModeHint: mixedUse ? "mixed_use" : "long_term_residential",
    totalDays,
    selfUseDays,
    rentalDays,
    vacancyDays: 0,
    heldAvailableForRent: rentalDays > 0,
    belowMarketRental: false,
  };
}

function buildProperty(args: {
  property: PropertySummary;
  taxData: TaxData;
}): Property {
  return {
    id: args.property.id,
    displayName: args.property.name || "Immobilie",
    propertyType: mapPropertyType(args.taxData.property_type),
    address: args.property.address
      ? { street1: args.property.address, countryCode: "DE" }
      : { countryCode: "DE" },
    countryCode: "DE",
    acquisitionDate: args.taxData.acquisition_date ?? undefined,
    yearBuilt: args.taxData.build_year ?? undefined,
    isResidential: true,
    usedForHolidayRental: args.taxData.property_type?.toLowerCase().includes("ferien") ?? false,
    usedForShortTermRental: args.taxData.property_type?.toLowerCase().includes("ferien") ?? false,
  };
}

function pushRevenue(list: RevenueEvent[], propertyId: string, taxYear: number, category: RevenueCategory, amount: number, suffix: string) {
  if (amount <= 0) return;
  list.push({
    id: `${propertyId}-revenue-${suffix}-${taxYear}`,
    propertyId,
    taxYear,
    bookingDate: `${taxYear}-12-31`,
    category,
    grossCents: toCents(amount),
  });
}

function pushExpense(list: ExpenseEvent[], propertyId: string, taxYear: number, category: ExpenseCategory, amount: number, suffix: string) {
  if (amount <= 0) return;
  list.push({
    id: `${propertyId}-expense-${suffix}-${taxYear}`,
    propertyId,
    taxYear,
    bookingDate: `${taxYear}-12-31`,
    description: suffix,
    amountCents: toCents(amount),
    category,
    allocationMode: "full",
  });
}

function buildRevenueEvents(taxData: TaxData): RevenueEvent[] {
  const events: RevenueEvent[] = [];
  pushRevenue(events, taxData.property_id, taxData.tax_year, "cold_rent", num(taxData.rent_income), "rent_income");
  pushRevenue(events, taxData.property_id, taxData.tax_year, "allocated_ancillary_prepayment", num(taxData.operating_costs_income), "operating_costs_income");
  pushRevenue(events, taxData.property_id, taxData.tax_year, "other_income", num(taxData.other_income), "other_income");
  pushRevenue(events, taxData.property_id, taxData.tax_year, "other_income", num(taxData.deposits_received), "deposits_received");
  pushRevenue(events, taxData.property_id, taxData.tax_year, "other_income", num(taxData.rent_prior_year), "rent_prior_year");
  return events;
}

function buildExpenseEvents(taxData: TaxData): ExpenseEvent[] {
  const events: ExpenseEvent[] = [];
  pushExpense(events, taxData.property_id, taxData.tax_year, "loan_interest", num(taxData.loan_interest), "loan_interest");
  pushExpense(events, taxData.property_id, taxData.tax_year, "property_tax", num(taxData.property_tax), "property_tax");
  pushExpense(events, taxData.property_id, taxData.tax_year, "administration", num(taxData.hoa_fees), "hoa_fees");
  pushExpense(events, taxData.property_id, taxData.tax_year, "insurance", num(taxData.insurance), "insurance");
  pushExpense(events, taxData.property_id, taxData.tax_year, "water", num(taxData.water_sewage), "water_sewage");
  pushExpense(events, taxData.property_id, taxData.tax_year, "waste", num(taxData.waste_disposal), "waste_disposal");
  pushExpense(events, taxData.property_id, taxData.tax_year, "administration", num(taxData.property_management), "property_management");
  pushExpense(events, taxData.property_id, taxData.tax_year, "bank_fees", num(taxData.bank_fees), "bank_fees");
  pushExpense(events, taxData.property_id, taxData.tax_year, "maintenance_candidate", num(taxData.maintenance_costs), "maintenance_costs");
  pushExpense(events, taxData.property_id, taxData.tax_year, "other", num(taxData.other_expenses), "other_expenses");
  return events;
}

function buildAssets(args: {
  propertyId: string;
  taxYear: number;
  taxData: TaxData;
  depreciationItems: TaxDepreciationItem[];
}): Asset[] {
  if (args.depreciationItems.length > 0) {
    const buildingRate = deriveBuildingRate(args.taxData.build_year);
    return args.depreciationItems
      .filter((item) => Number(item.gross_annual_amount ?? 0) > 0)
      .map((item) => ({
        id: item.id,
        propertyId: item.property_id,
        assetType:
          item.item_type === "building"
            ? "building"
            : item.item_type === "outdoor"
              ? "outdoor_facility"
              : "movable_inventory",
        description: item.label,
        acquisitionCostCents:
          item.item_type === "building"
            ? Math.max(1, Math.round(toCents(item.gross_annual_amount) / buildingRate))
            : item.item_type === "outdoor"
              ? Math.max(1, Math.round(toCents(item.gross_annual_amount) / 0.02))
              : Math.max(1, toCents(item.gross_annual_amount) * 10),
        usefulLifeYears: item.item_type === "movable_asset" ? 10 : undefined,
        depreciationMethodHint: item.item_type === "movable_asset" ? "linear" : undefined,
      }));
  }

  const assets: Asset[] = [];
  const buildingCost = num(args.taxData.acquisition_cost_building);
  if (buildingCost > 0) {
    assets.push({
      id: `${args.propertyId}-building-${args.taxYear}`,
      propertyId: args.propertyId,
      assetType: "building",
      description: "Gebäude",
      acquisitionCostCents: toCents(buildingCost),
    });
  }
  const fixtureDepreciation = num(args.taxData.depreciation_fixtures);
  if (fixtureDepreciation > 0) {
    assets.push({
      id: `${args.propertyId}-fixtures-${args.taxYear}`,
      propertyId: args.propertyId,
      assetType: "movable_inventory",
      description: "Inventar",
      acquisitionCostCents: toCents(fixtureDepreciation) * 10,
      usefulLifeYears: 10,
      depreciationMethodHint: "linear",
    });
  }
  const outdoorDepreciation = num(args.taxData.depreciation_outdoor);
  if (outdoorDepreciation > 0) {
    assets.push({
      id: `${args.propertyId}-outdoor-${args.taxYear}`,
      propertyId: args.propertyId,
      assetType: "outdoor_facility",
      description: "Außenanlagen",
      acquisitionCostCents: Math.round(toCents(outdoorDepreciation) / 0.02),
    });
  }
  return assets;
}

function buildMaintenancePlans(items: TaxMaintenanceDistributionItem[]): MaintenancePlan[] {
  return items
    .filter((item) => item.classification === "maintenance_expense" && item.deduction_mode === "distributed")
    .map((item) => ({
      id: item.id,
      propertyId: item.property_id,
      originTaxYear: item.source_year,
      firstDeductionTaxYear: item.source_year,
      distributionYears: Math.min(5, Math.max(2, Math.round(item.distribution_years || 2))) as 2 | 3 | 4 | 5,
      annualShareCents:
        item.current_year_share_override != null
          ? toCents(item.current_year_share_override)
          : Math.round(toCents(item.total_amount) / Math.max(1, item.distribution_years)),
      originalAmountCents: toCents(item.total_amount),
      sourceExpenseIds: [item.id],
      status: item.status === "completed" ? "completed" : "active",
    }));
}

function buildOwnerSpecificItems(args: {
  propertyId: string;
  taxYear: number;
  partnerTaxValues: GbrPartnerTaxData[];
}): OwnerSpecificItem[] {
  return args.partnerTaxValues
    .filter((item) => num(item.special_expenses) !== 0)
    .map((item) => ({
      id: `${item.gbr_partner_id}-${args.taxYear}-special-expense`,
      ownerId: item.gbr_partner_id,
      propertyId: args.propertyId,
      taxYear: args.taxYear,
      category: "special_expense",
      amountCents: -toCents(item.special_expenses),
      description: item.note ?? "Sonderwerbungskosten",
      sourceRef: item.id,
    }));
}

export function buildRentalTaxCaseInputFromExistingData(args: {
  property: PropertySummary;
  taxData: TaxData;
  gbrSettings: GbrSettingsBridgeSummary | null;
  partnerTaxValues?: GbrPartnerTaxData[];
  taxSettings?: TaxSettingsBridgeSummary | null;
  depreciationItems?: TaxDepreciationItem[];
  maintenanceDistributions?: TaxMaintenanceDistributionItem[];
  requestedFilingProfile?: FilingProfile;
}): ComputeRentalTaxCaseInput {
  const taxSubject = buildTaxSubject({
    propertyId: args.property.id,
    gbrSettings: args.gbrSettings,
    partnerTaxValues: args.partnerTaxValues ?? [],
  });

  return {
    policyPackId: policyPackIdForYear(args.taxData.tax_year),
    formPackId: args.gbrSettings?.feststellungserklaerung ? "elster-assessment-2025" : "elster-income-2025",
    taxYear: args.taxData.tax_year,
    taxSubject,
    properties: [buildProperty({ property: args.property, taxData: args.taxData })],
    usageYears: [buildUsageYear({
      propertyId: args.property.id,
      taxYear: args.taxData.tax_year,
      gbrSettings: args.gbrSettings,
      taxSettings: args.taxSettings,
    })],
    ownershipPeriods: buildOwnershipPeriods({
      taxYear: args.taxData.tax_year,
      propertyId: args.property.id,
      taxSubject,
      gbrSettings: args.gbrSettings,
      taxData: args.taxData,
    }),
    revenues: buildRevenueEvents(args.taxData),
    expenses: buildExpenseEvents(args.taxData),
    assets: buildAssets({
      propertyId: args.property.id,
      taxYear: args.taxData.tax_year,
      taxData: args.taxData,
      depreciationItems: args.depreciationItems ?? [],
    }),
    maintenancePlans: buildMaintenancePlans(args.maintenanceDistributions ?? []),
    loans: [],
    ownerSpecificItems: buildOwnerSpecificItems({
      propertyId: args.property.id,
      taxYear: args.taxData.tax_year,
      partnerTaxValues: args.partnerTaxValues ?? [],
    }),
    filingsContext: {
      requestedFilingProfile: args.requestedFilingProfile,
    },
    overrides: [],
    evidence: [],
  };
}

export function runRentalTaxEngineFromExistingData(args: {
  property: PropertySummary;
  taxData: TaxData;
  gbrSettings: GbrSettingsBridgeSummary | null;
  partnerTaxValues?: GbrPartnerTaxData[];
  taxSettings?: TaxSettingsBridgeSummary | null;
  depreciationItems?: TaxDepreciationItem[];
  maintenanceDistributions?: TaxMaintenanceDistributionItem[];
  requestedFilingProfile?: FilingProfile;
}): ComputeRentalTaxCaseOutput {
  const input = buildRentalTaxCaseInputFromExistingData(args);
  return computeRentalTaxCase(input);
}

export function summarizeEngineWarnings(output: ComputeRentalTaxCaseOutput): string[] {
  return [
    ...output.blockingErrors.map((item) => item.message),
    ...output.reviewFlags.map((item) => item.message),
    ...output.warnings.map((item) => item.message),
  ];
}

export function findOwnerAllocation(output: ComputeRentalTaxCaseOutput, ownerId: string) {
  const lines = output.ownerAllocations.flatMap((bucket) => bucket.lines);
  return lines.find((line) => line.ownerId === ownerId);
}

export function summarizeOwnerSpecialExpense(output: ComputeRentalTaxCaseOutput, ownerId: string) {
  const allocation = findOwnerAllocation(output, ownerId);
  return allocation ? Math.abs(fromCents(Math.min(0, allocation.specialItemsCents))) : 0;
}
