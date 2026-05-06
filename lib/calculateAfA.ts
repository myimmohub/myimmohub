/**
 * Public-API für die AfA-Berechnung.
 *
 * Diese Datei ist jetzt ein dünner Wrapper über `lib/tax/afa.ts`. Vor dem
 * Auftrag-C-Refactor lebten Baujahr-Switch und Satz-Konstanten direkt hier;
 * jetzt ist die Logik in `resolveBuildingAfaRate` zentralisiert (siehe dort
 * für Quellen). Bestehende Aufrufer und Tests bleiben unverändert.
 */

import { resolveBuildingAfaRate } from "@/lib/tax/afa";

export type AfAResult = {
  satz: number; // z.B. 0.02 für 2%
  jahresbetrag: number; // in Euro
};

export function calculateAfA(baujahr: number, kaufpreis: number): AfAResult {
  const satz = resolveBuildingAfaRate({ baujahr });
  return { satz, jahresbetrag: kaufpreis * satz };
}
