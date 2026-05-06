/**
 * Unit-Tests für die NKA-Editor-Validierungs-Helper
 * (lib/nka/editorValidation.ts).
 */

import { describe, it, expect } from "vitest";
import {
  computeUmlagefaehigCents,
  validateDirectShares,
} from "@/lib/nka/editorValidation";

describe("computeUmlagefaehigCents", () => {
  it("100 % von 100 Euro = 10000 Cent", () => {
    expect(computeUmlagefaehigCents(10000, 100)).toBe(10000);
  });
  it("50 % von 12345 Cent = 6173 (half-up)", () => {
    expect(computeUmlagefaehigCents(12345, 50)).toBe(6173);
  });
  it("0 % → 0", () => {
    expect(computeUmlagefaehigCents(50000, 0)).toBe(0);
  });
  it("Klemmt prozentual über 100 ab", () => {
    expect(computeUmlagefaehigCents(10000, 250)).toBe(10000);
  });
  it("Klemmt prozentual unter 0 ab", () => {
    expect(computeUmlagefaehigCents(10000, -50)).toBe(0);
  });
});

describe("validateDirectShares", () => {
  it("OK: Σ direct_shares == umlagefähig", () => {
    const r = validateDirectShares(10000, 100, { a: 5000, b: 5000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.sum_cents).toBe(10000);
      expect(r.umlagefaehig_cents).toBe(10000);
      expect(r.diff_cents).toBe(0);
    }
  });

  it("Fehler: Σ < umlagefähig (zu wenig zugewiesen)", () => {
    const r = validateDirectShares(10000, 100, { a: 4000, b: 4000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.diff_cents).toBe(2000);
      expect(r.message).toMatch(/fehlen/);
    }
  });

  it("Fehler: Σ > umlagefähig (zu viel zugewiesen)", () => {
    const r = validateDirectShares(10000, 50, { a: 6000 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      // umlagefähig = 5000, sum = 6000, diff = -1000 (Überschuss)
      expect(r.umlagefaehig_cents).toBe(5000);
      expect(r.sum_cents).toBe(6000);
      expect(r.diff_cents).toBe(-1000);
      expect(r.message).toMatch(/Überschuss/);
    }
  });

  it("Ignoriert null/undefined-Werte in shares", () => {
    const r = validateDirectShares(10000, 100, {
      a: 10000,
      b: null,
      c: undefined,
    });
    expect(r.ok).toBe(true);
  });
});
