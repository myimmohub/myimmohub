/**
 * Pure Validierungs-Helper für den NKA-Editor.
 *
 * Wird sowohl in der Client-Component `NkaEditor.tsx` als auch in den
 * Tests verwendet. Bewusst frei von React/DOM/Browser, damit Vitest direkt
 * dagegen laufen kann.
 *
 * Hauptregel: Bei Schlüssel="direct" muss Σ direct_shares == brutto × umlagefähig%
 * sein, sonst landet die Differenz in `nka_unallocated`. Wir warnen daher
 * früh, damit der Nutzer keine Verteilung mit Mismatch produziert.
 */

/**
 * Berechnet den umlagefähigen Cent-Betrag aus brutto und Prozentsatz.
 * `brutto_cents`: Ganzzahl. `umlagefaehig_pct`: 0..100 (Float-tolerant).
 *
 * Half-Up Rundung gegen Float-Drift.
 */
export function computeUmlagefaehigCents(
  brutto_cents: number,
  umlagefaehig_pct: number,
): number {
  const pct = Math.max(0, Math.min(100, Number(umlagefaehig_pct) || 0));
  const raw = (Number(brutto_cents) * pct) / 100;
  return raw >= 0 ? Math.floor(raw + 0.5) : -Math.floor(-raw + 0.5);
}

export type DirectSharesValidation =
  | { ok: true; umlagefaehig_cents: number; sum_cents: number; diff_cents: 0 }
  | {
      ok: false;
      umlagefaehig_cents: number;
      sum_cents: number;
      /** umlagefaehig_cents - sum_cents (positiv = zu wenig zugewiesen). */
      diff_cents: number;
      message: string;
    };

/**
 * Validiert direct_shares-Map gegen den umlagefähigen Sollbetrag.
 *
 * @param brutto_cents - Brutto-Summe der Position in Cent.
 * @param umlagefaehig_pct - 0..100.
 * @param shares - Map tenant_id → cents (kann auch leere Werte enthalten).
 */
export function validateDirectShares(
  brutto_cents: number,
  umlagefaehig_pct: number,
  shares: Record<string, number | null | undefined>,
): DirectSharesValidation {
  const umlagefaehig_cents = computeUmlagefaehigCents(
    brutto_cents,
    umlagefaehig_pct,
  );
  let sum = 0;
  for (const v of Object.values(shares)) {
    if (v == null) continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    sum += Math.round(n);
  }
  const diff = umlagefaehig_cents - sum;
  if (diff === 0) {
    return { ok: true, umlagefaehig_cents, sum_cents: sum, diff_cents: 0 };
  }
  return {
    ok: false,
    umlagefaehig_cents,
    sum_cents: sum,
    diff_cents: diff,
    message:
      diff > 0
        ? `Es fehlen ${(diff / 100).toFixed(2)} € — Summe der Mieteranteile zu klein.`
        : `Überschuss ${((-diff) / 100).toFixed(2)} € — Summe der Mieteranteile zu groß.`,
  };
}
