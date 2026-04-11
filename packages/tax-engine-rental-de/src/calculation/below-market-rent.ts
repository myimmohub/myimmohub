import type { BelowMarketResult, ReviewFlag, UsageYear, WarningFlag } from "../domain/types";
import type { TaxPolicyPack } from "../policy/policy-types";

export function computeBelowMarketRent(args: {
  usage: UsageYear;
  actualResidentialChargeCents?: number;
  marketResidentialChargeCents?: number;
  policy: TaxPolicyPack;
}): BelowMarketResult {
  const reviewFlags: ReviewFlag[] = [];
  const warnings: WarningFlag[] = [];
  if (!args.usage.belowMarketRental) {
    return {
      rentRelationPercent: null,
      requiresForecast: false,
      deductibleExpensePercent: 100,
      reviewFlags,
      warnings,
    };
  }

  if (!args.marketResidentialChargeCents || args.marketResidentialChargeCents <= 0) {
    reviewFlags.push({
      code: "LIMITED_TAX_CONTEXT_NEEDS_CONFIRMATION",
      message: "Unterlagen zur Marktmiete fehlen für die verbilligte Vermietung.",
    });
    return {
      rentRelationPercent: null,
      requiresForecast: true,
      deductibleExpensePercent: 0,
      reviewFlags,
      warnings,
    };
  }

  const rentRelationPercent = (100 * (args.actualResidentialChargeCents ?? 0)) / args.marketResidentialChargeCents;
  const requiresForecast = rentRelationPercent < args.policy.thresholds.belowMarketSplitPercent;
  if (!requiresForecast) warnings.push({ code: "ESTIMATED_MARKET_RENT_USED", message: "Marktmiete wurde pauschal für die Vergleichsrechnung verwendet." });

  return {
    rentRelationPercent,
    requiresForecast,
    deductibleExpensePercent: requiresForecast ? rentRelationPercent : 100,
    reviewFlags,
    warnings,
  };
}
