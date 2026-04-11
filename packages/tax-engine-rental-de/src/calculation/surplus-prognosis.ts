import type { BelowMarketResult } from "../domain/types";

export interface SurplusPrognosisInput {
  horizonYears: number;
  expectedAnnualRevenueCents: number;
  expectedAnnualExpenseCents: number;
  expectedAnnualDepreciationCents: number;
}

export interface SurplusPrognosisResult {
  projectedTotalCents: number;
  isPositive: boolean;
  required: boolean;
}

export function computeSurplusPrognosis(input: SurplusPrognosisInput): SurplusPrognosisResult {
  const annualResult =
    input.expectedAnnualRevenueCents - input.expectedAnnualExpenseCents - input.expectedAnnualDepreciationCents;
  const projectedTotalCents = annualResult * input.horizonYears;
  return {
    projectedTotalCents,
    isPositive: projectedTotalCents >= 0,
    required: true,
  };
}

export function applySurplusPrognosisToBelowMarket(
  belowMarketResult: BelowMarketResult,
  prognosis: SurplusPrognosisResult | null,
): BelowMarketResult {
  if (!belowMarketResult.requiresForecast || !prognosis) return belowMarketResult;
  if (prognosis.isPositive) {
    return { ...belowMarketResult, requiresForecast: false };
  }
  return belowMarketResult;
}
