import type { ProvenanceBundle, ProvenanceEntry } from "../domain/types";

export function makeProvenanceEntry(args: {
  sourceEventIds: string[];
  appliedRuleIds: string[];
  calculationPath: string[];
  policyPackId: string;
  formPackId?: string;
}): ProvenanceEntry {
  return { ...args };
}

export function makeProvenanceBundle(entries: Record<string, ProvenanceEntry>): ProvenanceBundle {
  return { calculations: entries };
}
