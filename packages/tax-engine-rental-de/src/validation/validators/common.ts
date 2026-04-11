import type { BlockingError, ReviewFlag } from "../../domain/types";

export interface ValidationResult {
  blockingErrors: BlockingError[];
  reviewFlags: ReviewFlag[];
}

export function emptyValidationResult(): ValidationResult {
  return { blockingErrors: [], reviewFlags: [] };
}

export function mergeValidationResults(...results: ValidationResult[]): ValidationResult {
  return results.reduce<ValidationResult>(
    (merged, result) => ({
      blockingErrors: [...merged.blockingErrors, ...result.blockingErrors],
      reviewFlags: [...merged.reviewFlags, ...result.reviewFlags],
    }),
    emptyValidationResult(),
  );
}

export function normalizePartyName(input: {
  title?: string;
  firstName?: string;
  lastName?: string;
  companyName?: string;
}): string {
  const raw = input.companyName || [input.firstName, input.lastName].filter(Boolean).join(" ");
  return raw
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\b(dr|prof|dipl ing|dipl ing\.)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
