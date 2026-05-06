/**
 * Unit-Tests für `lib/tax/concurrencyLock.ts`.
 *
 * Geprüft werden zwei Pfade:
 *   - In-Memory (synchron): tryAcquireLock / releaseLock(key)
 *   - Postgres-Advisory-Lock (asynchron): acquireLock(supabase, key) /
 *     releaseLock(supabase, key) mit gemocktem Supabase-Client.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  lockKey,
  tryAcquireLock,
  releaseLock,
  acquireLock,
  __resetLocksForTesting,
  __getActiveLocksForTesting,
} from "@/lib/tax/concurrencyLock";

beforeEach(() => {
  __resetLocksForTesting();
});

describe("concurrencyLock — In-Memory-Pfad", () => {
  it("lockKey ist deterministisch", () => {
    expect(lockKey("uuid-1", 2024)).toBe("uuid-1::2024");
    expect(lockKey("uuid-1", 2024)).toBe(lockKey("uuid-1", 2024));
  });

  it("tryAcquireLock liefert true beim ersten Aufruf, false beim zweiten", () => {
    const k = lockKey("11111111-1111-4111-8111-111111111111", 2024);
    expect(tryAcquireLock(k)).toBe(true);
    expect(tryAcquireLock(k)).toBe(false);
  });

  it("releaseLock erlaubt Wieder-Acquire (synchroner Aufruf)", () => {
    const k = lockKey("11111111-1111-4111-8111-111111111111", 2024);
    expect(tryAcquireLock(k)).toBe(true);
    releaseLock(k);
    expect(tryAcquireLock(k)).toBe(true);
  });

  it("Verschiedene (property, year)-Paare blockieren sich nicht", () => {
    const a = lockKey("11111111-1111-4111-8111-111111111111", 2024);
    const b = lockKey("22222222-2222-4222-8222-222222222222", 2024);
    const c = lockKey("11111111-1111-4111-8111-111111111111", 2023);
    expect(tryAcquireLock(a)).toBe(true);
    expect(tryAcquireLock(b)).toBe(true);
    expect(tryAcquireLock(c)).toBe(true);
    expect(__getActiveLocksForTesting()).toHaveLength(3);
  });

  it("Lock-Set wird korrekt geleert", () => {
    tryAcquireLock(lockKey("a", 2024));
    tryAcquireLock(lockKey("b", 2024));
    expect(__getActiveLocksForTesting()).toHaveLength(2);
    __resetLocksForTesting();
    expect(__getActiveLocksForTesting()).toHaveLength(0);
  });
});

describe("concurrencyLock — Postgres-Pfad mit gemocktem Supabase-Client", () => {
  function makeMockClient(rpcImpl: (fn: string, args: { p_key_text: string }) => { data: unknown; error: unknown }) {
    return {
      rpc: vi.fn(rpcImpl),
    };
  }

  it("acquireLock setzt In-Memory + Postgres-Lock, beide werden in der RPC-Reihenfolge aufgerufen", async () => {
    const mock = makeMockClient((fn) => {
      if (fn === "try_advisory_lock") return { data: true, error: null };
      return { data: null, error: null };
    });

    const k = lockKey("prop-1", 2024);
    const ok = await acquireLock(mock, k);

    expect(ok).toBe(true);
    expect(mock.rpc).toHaveBeenCalledTimes(1);
    expect(mock.rpc).toHaveBeenCalledWith("try_advisory_lock", { p_key_text: k });
    expect(__getActiveLocksForTesting()).toContain(k);
  });

  it("acquireLock gibt false zurück, wenn Postgres meldet 'belegt' — und räumt In-Memory wieder auf", async () => {
    const mock = makeMockClient(() => ({ data: false, error: null }));
    const k = lockKey("prop-1", 2024);

    const ok = await acquireLock(mock, k);

    expect(ok).toBe(false);
    // In-Memory-Lock muss freigegeben sein, damit ein späterer Retry klappt.
    expect(__getActiveLocksForTesting()).not.toContain(k);
  });

  it("acquireLock gibt false zurück, wenn der In-Memory-Lock im selben Prozess schon belegt ist (Postgres wird gar nicht erst gefragt)", async () => {
    const mock = makeMockClient(() => ({ data: true, error: null }));
    const k = lockKey("prop-1", 2024);

    expect(tryAcquireLock(k)).toBe(true);
    const ok = await acquireLock(mock, k);

    expect(ok).toBe(false);
    expect(mock.rpc).not.toHaveBeenCalled();
  });

  it("acquireLock fällt auf In-Memory zurück, wenn die Postgres-RPC fehlschlägt", async () => {
    const mock = makeMockClient(() => ({
      data: null,
      error: { message: "RPC failed: function does not exist" },
    }));
    const k = lockKey("prop-1", 2024);

    const ok = await acquireLock(mock, k);

    // Defense-in-Depth: lieber Lock geben als 409 zurückwerfen, wenn die DB
    // nur kurz wackelt.
    expect(ok).toBe(true);
    expect(__getActiveLocksForTesting()).toContain(k);
  });

  it("acquireLock fällt auf In-Memory zurück, wenn die Postgres-RPC eine Exception wirft", async () => {
    const mock = {
      rpc: vi.fn().mockRejectedValue(new Error("network error")),
    };
    const k = lockKey("prop-1", 2024);

    const ok = await acquireLock(mock, k);
    expect(ok).toBe(true);
    expect(__getActiveLocksForTesting()).toContain(k);
  });

  it("acquireLock funktioniert auch ohne Supabase-Client (Test-Fallback)", async () => {
    const k = lockKey("prop-1", 2024);
    const ok = await acquireLock(null, k);
    expect(ok).toBe(true);
    expect(__getActiveLocksForTesting()).toContain(k);
  });

  it("releaseLock(supabase, key) ruft die release-RPC auf und gibt In-Memory frei", async () => {
    const mock = makeMockClient(() => ({ data: true, error: null }));
    const k = lockKey("prop-1", 2024);

    await acquireLock(mock, k);
    expect(__getActiveLocksForTesting()).toContain(k);

    await releaseLock(mock, k);
    expect(__getActiveLocksForTesting()).not.toContain(k);
    // Erst try_advisory_lock, dann release_advisory_lock
    expect(mock.rpc).toHaveBeenCalledTimes(2);
    expect(mock.rpc).toHaveBeenLastCalledWith("release_advisory_lock", { p_key_text: k });
  });

  it("releaseLock ist idempotent (doppeltes Release ist no-op)", async () => {
    const mock = makeMockClient(() => ({ data: true, error: null }));
    const k = lockKey("prop-1", 2024);

    await acquireLock(mock, k);
    await releaseLock(mock, k);
    await releaseLock(mock, k); // sollte nicht crashen
    expect(__getActiveLocksForTesting()).not.toContain(k);
  });

  it("Try-finally-Pattern: bei Error im Critical Section wird der Lock trotzdem freigegeben", async () => {
    const mock = makeMockClient(() => ({ data: true, error: null }));
    const k = lockKey("prop-1", 2024);

    await acquireLock(mock, k);
    try {
      throw new Error("simulated error in critical section");
    } catch {
      // Wie im echten Route-Handler:
      await releaseLock(mock, k);
    }
    expect(__getActiveLocksForTesting()).not.toContain(k);
  });
});
