import type { RevenueCategory, RevenueEvent, RevenueTotals } from "../domain/types";

const REVENUE_CATEGORIES: RevenueCategory[] = [
  "cold_rent",
  "allocated_ancillary_prepayment",
  "ancillary_refund_negative",
  "lease_side_income",
  "parking_rent",
  "furniture_supplement",
  "tourist_fee_pass_through",
  "insurance_reimbursement",
  "other_income",
];

export function computeRevenueTotals(events: RevenueEvent[]): RevenueTotals {
  const byCategory = Object.fromEntries(REVENUE_CATEGORIES.map((category) => [category, 0])) as Record<RevenueCategory, number>;
  for (const event of events) byCategory[event.category] += event.grossCents;
  const totalCents = Object.values(byCategory).reduce((sum, value) => sum + value, 0);
  return { byCategory, totalCents };
}
