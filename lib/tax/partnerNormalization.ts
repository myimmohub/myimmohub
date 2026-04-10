import type { GbrPartnerTaxValue } from "@/lib/tax/gbrTaxReport";

type BasicPartner = {
  id: string;
  name: string;
  anteil: number;
  email: string | null;
};

type MergedPartner<T extends BasicPartner> = T & {
  merged_partner_ids: string[];
};

const TITLE_PATTERN = /\b(?:prof(?:essor)?|dr|dipl(?:om)?(?:-|\s)?(?:kfm|ing|jur)|mag)\.?\b/giu;

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizePartnerName(value: string) {
  return compactWhitespace(
    value
      .replace(/,/g, " ")
      .replace(TITLE_PATTERN, " ")
      .replace(/\./g, " ")
      .toLocaleLowerCase("de-DE"),
  );
}

export function formatDateForDisplay(value: string | null | undefined) {
  if (!value) return "—";
  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[3]}.${isoMatch[2]}.${isoMatch[1]}`;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("de-DE");
}

export function mergeDuplicatePartners<T extends BasicPartner>(partners: T[]) {
  const merged = new Map<string, MergedPartner<T>>();
  const duplicateWarnings: string[] = [];

  for (const partner of partners) {
    const normalizedName = normalizePartnerName(partner.name);
    const existing = merged.get(normalizedName);

    if (!existing) {
      merged.set(normalizedName, {
        ...partner,
        merged_partner_ids: [partner.id],
      });
      continue;
    }

    duplicateWarnings.push(`Doppelter Partner erkannt und zusammengeführt: ${existing.name} / ${partner.name}.`);
    existing.merged_partner_ids.push(partner.id);
    existing.anteil = Math.max(Number(existing.anteil ?? 0), Number(partner.anteil ?? 0));
    if (!existing.email && partner.email) existing.email = partner.email;
    if (partner.name.length > existing.name.length) existing.name = partner.name;
  }

  return {
    partners: Array.from(merged.values()),
    duplicateWarnings,
  };
}

export function mergePartnerTaxValuesByNormalizedName(
  partnerTaxValues: GbrPartnerTaxValue[],
  partners: BasicPartner[],
) {
  const nameById = new Map(partners.map((partner) => [partner.id, normalizePartnerName(partner.name)]));
  const merged = new Map<string, number>();

  for (const item of partnerTaxValues) {
    const normalizedName = nameById.get(item.gbr_partner_id);
    if (!normalizedName) continue;
    const nextValue = Number(item.special_expenses ?? 0);
    const currentValue = merged.get(normalizedName);
    if (currentValue == null || Math.abs(nextValue) > Math.abs(currentValue)) {
      merged.set(normalizedName, nextValue);
    }
  }

  return merged;
}
