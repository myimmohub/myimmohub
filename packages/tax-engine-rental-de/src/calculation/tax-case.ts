import { buildAuditLog } from "../audit/audit-log";
import { resolveFilingProfile } from "../classification/filing-profile";
import { resolveIncomeRegime } from "../classification/income-regime";
import { resolveOwnershipModel } from "../classification/ownership-model";
import { resolveRentalMode, resolveSpecialCaseRouting } from "../classification/special-case-routing";
import type { BlockingError, ComputeRentalTaxCaseInput, ComputeRentalTaxCaseOutput, FilingPreview, ReviewFlag, WarningFlag } from "../domain/types";
import { computeAcquisitionNearCosts } from "./acquisition-near-costs";
import { computeDeductibleExpenses } from "./expense-deduction";
import { computeBelowMarketRent } from "./below-market-rent";
import { computeBuildingDepreciation } from "./depreciation/building";
import { computeMovableAssetDepreciation } from "./depreciation/movable-assets";
import { computeHolidayApartmentResult } from "./holiday-apartment";
import { computeMaintenancePlans } from "./maintenance-distribution";
import { computeOwnerAllocations } from "./owner-allocation";
import { computeRevenueTotals } from "./revenue";
import { makeProvenanceBundle, makeProvenanceEntry } from "../provenance/provenance";
import { resolveAdapter } from "../mapping/adapter-resolver";
import { DE_RENTAL_2024 } from "../policy/packs/de-rental-2024";
import { DE_RENTAL_2025 } from "../policy/packs/de-rental-2025";
import { DE_RENTAL_2026_PREVIEW } from "../policy/packs/de-rental-2026-preview";
import { validateBlockingAndReview } from "../validation/blocking";
import { daysBetweenInclusive, taxYearRange } from "./dates";

const POLICY_PACKS = {
  [DE_RENTAL_2024.id]: DE_RENTAL_2024,
  [DE_RENTAL_2025.id]: DE_RENTAL_2025,
  [DE_RENTAL_2026_PREVIEW.id]: DE_RENTAL_2026_PREVIEW,
};

function validateInput(input: ComputeRentalTaxCaseInput): { blockingErrors: BlockingError[]; reviewFlags: ReviewFlag[] } {
  const blockingErrors: BlockingError[] = [];
  const reviewFlags: ReviewFlag[] = [];
  if (input.taxSubject.owners.length > 0 && input.ownershipPeriods.length > 0) {
    const yearRange = taxYearRange(input.taxYear);
    const yearDays = daysBetweenInclusive(yearRange.startDate, yearRange.endDate);
    const totalShare = input.ownershipPeriods.reduce((sum, period) => {
      const overlapStart = period.startDate > yearRange.startDate ? period.startDate : yearRange.startDate;
      const rawEnd = period.endDate ?? yearRange.endDate;
      const overlapEnd = rawEnd < yearRange.endDate ? rawEnd : yearRange.endDate;
      if (overlapStart > overlapEnd) return sum;
      const overlapDays = daysBetweenInclusive(overlapStart, overlapEnd);
      return sum + (((100 * period.numerator) / period.denominator) * overlapDays) / yearDays;
    }, 0);
    if (Math.abs(totalShare - 100) > 0.01) {
      blockingErrors.push({ code: "OWNER_SHARES_NOT_100", message: `Gewichtete Eigentumsquoten ergeben ${totalShare.toFixed(2)} % statt 100 %.` });
    }
  }
  for (const usage of input.usageYears) {
    const sumDays = (usage.selfUseDays ?? 0) + (usage.reservedSelfUseDays ?? 0) + (usage.rentalDays ?? 0) + (usage.vacancyDays ?? 0);
    if (sumDays > 0 && sumDays !== usage.totalDays) {
      blockingErrors.push({ code: "USAGE_DAYS_INVALID", message: `Nutzungstage für ${usage.propertyId}/${usage.taxYear} sind inkonsistent.` });
    }
  }
  if (input.filingsContext.importedShareOnly && (input.properties.length > 0 || input.revenues.length > 0 || input.expenses.length > 0)) {
    blockingErrors.push({ code: "IMPORTED_SHARE_AND_DIRECT_OBJECT_INPUT_COLLISION", message: "Share-Import und direkte Objektberechnung dürfen nicht kombiniert werden." });
  }
  for (const override of input.overrides ?? []) {
    if (!override.reason) {
      blockingErrors.push({ code: "MANUAL_OVERRIDE_WITHOUT_REASON", message: `Override ${override.id} hat keine Begründung.` });
    }
  }
  return { blockingErrors, reviewFlags };
}

export function computeRentalTaxCase(input: ComputeRentalTaxCaseInput): ComputeRentalTaxCaseOutput {
  const policy = POLICY_PACKS[input.policyPackId as keyof typeof POLICY_PACKS] ?? DE_RENTAL_2025;
  const property = input.properties[0];
  const usage = input.usageYears[0];
  const ownershipModel = resolveOwnershipModel(input.taxSubject);
  const rentalMode = resolveRentalMode(input.usageYears);
  const incomeRegime = resolveIncomeRegime(input.properties);
  const filingProfile = resolveFilingProfile({
    ownershipModel,
    rentalMode,
    residencyStatus: input.taxSubject.residencyStatus,
    importedShareOnly: input.filingsContext.importedShareOnly,
  });

  const validation = validateInput(input);
  const blockingAndReview = validateBlockingAndReview({
    input,
    ownershipModel,
    rentalMode,
    filingProfile,
  });
  validation.blockingErrors.push(...blockingAndReview.blockingErrors);
  validation.reviewFlags.push(...blockingAndReview.reviewFlags);
  const reviewFlags: ReviewFlag[] = [...validation.reviewFlags, ...resolveSpecialCaseRouting(input.properties, input.usageYears)];
  const warnings: WarningFlag[] = [];

  const revenueTotals = computeRevenueTotals(input.revenues);
  const acquisitionNearDecision = property
    ? computeAcquisitionNearCosts(input.expenses, property, policy, property.isResidential ? 20_000_000 : 0)
    : { triggered: false, totalCandidateCents: 0, thresholdCents: 0, affectedExpenseIds: [] };
  if (acquisitionNearDecision.triggered) {
    validation.blockingErrors.push({
      code: "ACQUISITION_NEAR_COSTS_NOT_CLASSIFIED",
      message: "Anschaffungsnahe Kosten überschreiten die Policy-Schwelle und müssen klassifiziert werden.",
    });
  }

  const maintenancePlans = computeMaintenancePlans({
    expenses: input.expenses,
    existingPlans: input.maintenancePlans,
    taxYear: input.taxYear,
    policy,
    accelerateOnSale: Boolean(property?.disposalDate),
  });
  const distributedExpenseIds = new Set(maintenancePlans.flatMap((plan) => plan.sourceExpenseIds));
  const deductionResult = computeDeductibleExpenses({
    expenses: input.expenses,
    usage,
    acquisitionNearTriggeredExpenseIds: new Set(acquisitionNearDecision.affectedExpenseIds),
    distributedExpenseIds,
  });

  const buildingDepreciation = property
    ? computeBuildingDepreciation({ assets: input.assets, property, taxYear: input.taxYear, policy })
    : { totalCents: 0, lines: [] };
  const movableDepreciation = computeMovableAssetDepreciation({ assets: input.assets, policy });
  const depreciationResult = {
    totalCents: buildingDepreciation.totalCents + movableDepreciation.totalCents,
    lines: [...buildingDepreciation.lines, ...movableDepreciation.lines],
  };
  if (input.assets.length > 0 && depreciationResult.totalCents === 0) {
    validation.blockingErrors.push({ code: "AFA_MISSING_FOR_ACTIVE_ASSETS", message: "Aktive Assets vorhanden, aber AfA = 0." });
  }

  const holidayApartmentResult = usage ? computeHolidayApartmentResult(usage) : null;
  if (holidayApartmentResult) reviewFlags.push(...holidayApartmentResult.reviewFlags);
  const belowMarketResult = usage
    ? computeBelowMarketRent({ usage, policy })
    : null;
  if (belowMarketResult) {
    reviewFlags.push(...belowMarketResult.reviewFlags);
    warnings.push(...belowMarketResult.warnings);
    if (belowMarketResult.requiresForecast) {
      validation.blockingErrors.push({
        code: "TOTAL_SURPLUS_PROGNOSIS_REQUIRED_BUT_MISSING",
        message: "Für die verbilligte Vermietung ist eine Totalüberschussprognose erforderlich.",
      });
    }
  }

  const maintenancePlanDeductionCents = maintenancePlans
    .filter((plan) => plan.firstDeductionTaxYear <= input.taxYear && plan.status !== "completed")
    .reduce((sum, plan) => sum + plan.annualShareCents, 0);
  const totalResultCents =
    revenueTotals.totalCents -
    deductionResult.deductibleExpenseCents -
    maintenancePlanDeductionCents -
    depreciationResult.totalCents;

  const ownerAllocations = computeOwnerAllocations({
    taxSubject: input.taxSubject,
    ownershipPeriods: input.ownershipPeriods,
    taxYear: input.taxYear,
    totalRevenueCents: revenueTotals.totalCents,
    totalExpenseCents: deductionResult.deductibleExpenseCents + maintenancePlanDeductionCents,
    totalDepreciationCents: depreciationResult.totalCents,
    totalResultCents,
    ownerSpecificItems: input.ownerSpecificItems,
  });

  const adapter = resolveAdapter(filingProfile, input.formPackId);
  const previews: FilingPreview[] = adapter
    ? [adapter.map({
        resultCents: totalResultCents,
        revenueCents: revenueTotals.totalCents,
        expenseCents: deductionResult.deductibleExpenseCents + maintenancePlanDeductionCents,
        depreciationCents: depreciationResult.totalCents,
        propertyName: property?.displayName,
      })]
    : [];

  const provenance = makeProvenanceBundle({
    revenue: makeProvenanceEntry({
      sourceEventIds: input.revenues.map((event) => event.id),
      appliedRuleIds: ["cash_principle"],
      calculationPath: ["revenues", "cash-principle"],
      policyPackId: policy.id,
      formPackId: adapter?.formPackId,
    }),
    expenses: makeProvenanceEntry({
      sourceEventIds: input.expenses.map((event) => event.id),
      appliedRuleIds: ["expense_classification", "expense_deduction"],
      calculationPath: ["expenses", "classification", "deduction"],
      policyPackId: policy.id,
      formPackId: adapter?.formPackId,
    }),
    depreciation: makeProvenanceEntry({
      sourceEventIds: input.assets.map((asset) => asset.id),
      appliedRuleIds: ["depreciation_rules"],
      calculationPath: ["assets", "depreciation"],
      policyPackId: policy.id,
      formPackId: adapter?.formPackId,
    }),
  });

  const auditLog = buildAuditLog(input.overrides);
  const uniqueReviewFlags = reviewFlags.filter((flag, index, all) => all.findIndex((candidate) => candidate.code === flag.code && candidate.message === flag.message) === index);

  return {
    status:
      validation.blockingErrors.length > 0
        ? "blocking_error"
        : uniqueReviewFlags.length > 0 || incomeRegime === "review_required" || filingProfile === "manual_review"
          ? "review_required"
          : "ok",
    blockingErrors: validation.blockingErrors,
    reviewFlags: uniqueReviewFlags,
    warnings,
    classification: {
      ownershipModel,
      rentalMode,
      incomeRegime,
      filingProfile,
    },
    calculations: {
      revenueTotals,
      deductionResult,
      depreciationResult,
      holidayApartmentResult,
      belowMarketResult,
      maintenancePlans,
      totalResultCents,
    },
    ownerAllocations,
    filingRecommendation: {
      filingProfile,
      requiresAssessment: filingProfile.startsWith("est1b"),
      requiresHolidaySupplement: filingProfile.includes("fewo"),
      requiresVSonstige: filingProfile.endsWith("sonstige"),
      requiresFWSideAdapter: filingProfile === "fw_optional_side_adapter",
      requiresManualReview: uniqueReviewFlags.length > 0 || incomeRegime === "review_required",
    },
    filingsPreview: { previews },
    provenance,
    auditLog,
  };
}
