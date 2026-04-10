export type RentalShareInput = {
  eigennutzung_tage?: number | null;
  gesamt_tage?: number | null;
  rental_share_override_pct?: number | null;
};

export type RentalShareComputation = {
  eigennutzung_tage: number;
  gesamt_tage: number;
  auto_rental_share_pct: number;
  rental_share_pct: number;
  rental_share_source: "auto" | "override";
  warnings: string[];
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const num = (value: number | null | undefined) => Number(value ?? 0);

export function computeRentalShare(input: RentalShareInput): RentalShareComputation {
  const totalDays = Math.max(1, Math.round(num(input.gesamt_tage) || 365));
  const selfUseDays = Math.max(0, Math.round(num(input.eigennutzung_tage)));
  const boundedSelfUseDays = Math.min(selfUseDays, totalDays);
  const autoRentalSharePct = clamp01(1 - boundedSelfUseDays / totalDays);
  const hasOverride = input.rental_share_override_pct != null;
  const rentalSharePct = clamp01(num(hasOverride ? input.rental_share_override_pct : autoRentalSharePct));
  const warnings: string[] = [];

  if (selfUseDays > totalDays) {
    warnings.push(`Eigennutzungstage (${selfUseDays}) überschreiten die Gesamttage (${totalDays}) und wurden auf die Jahresdauer begrenzt.`);
  }

  if (hasOverride && Math.abs(rentalSharePct - autoRentalSharePct) >= 0.005) {
    warnings.push(
      `Der manuelle Vermietungsanteil (${(rentalSharePct * 100).toFixed(2)} %) weicht von der Tageslogik (${(autoRentalSharePct * 100).toFixed(2)} %) ab.`,
    );
  }

  return {
    eigennutzung_tage: boundedSelfUseDays,
    gesamt_tage: totalDays,
    auto_rental_share_pct: autoRentalSharePct,
    rental_share_pct: rentalSharePct,
    rental_share_source: hasOverride ? "override" : "auto",
    warnings,
  };
}
