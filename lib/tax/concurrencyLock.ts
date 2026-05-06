/**
 * Concurrency-Lock für /api/tax/calculate.
 *
 * Verhindert parallele Recalculate-Calls für dieselbe (property_id, tax_year)-
 * Kombination. Gleichzeitige Aufrufe würden sonst race conditions verursachen
 * (beide lesen denselben Stand, beide schreiben unabhängig).
 *
 * Zwei Pfade:
 *   1. Postgres-Advisory-Lock (Multi-Instance-safe, Production):
 *      `acquireLock(supabase, key)` ruft die RPC `try_advisory_lock(p_key_text)`
 *      auf. Diese setzt einen Session-Advisory-Lock auf `hashtext(key)`. Der
 *      Lock bleibt aktiv, bis `releaseLock(supabase, key)` (RPC
 *      `release_advisory_lock`) aufgerufen wird oder die DB-Connection
 *      schließt. Funktioniert auch über Vercel-Worker-Instanzen hinweg, weil
 *      der State in Postgres lebt, nicht im Node-Prozess.
 *
 *   2. In-Memory-Fallback (Tests, lokale Dev ohne DB):
 *      `tryAcquireLock(key)` / `releaseLock(key)` arbeiten gegen ein Set in
 *      diesem Modul. Wird auch verwendet, wenn `acquireLock` ohne
 *      Supabase-Client aufgerufen wird (z.B. in Tests, die ohne DB laufen).
 *
 * Aufruf-Pattern (Production):
 *   const acquired = await acquireLock(supabase, key);
 *   if (!acquired) return 409;
 *   try { ... } finally { await releaseLock(supabase, key); }
 */

const activeLocks = new Set<string>();

export function lockKey(propertyId: string, taxYear: number): string {
  return `${propertyId}::${taxYear}`;
}

// ── In-Memory-Pfad ────────────────────────────────────────────────────────────
//
// Behalten wir bewusst als Fallback für (a) Tests, die ohne Supabase laufen,
// und (b) als Defense-in-Depth gegen versehentliche Re-Entry innerhalb
// desselben Worker-Prozesses (z.B. paralleler Aufruf aus zwei React-Effekten).

/**
 * Synchrone In-Memory-Variante. Liefert `true`, wenn der Aufrufer den Lock
 * exklusiv hält. `false` heißt: gleichzeitiger Calc läuft → 409 zurückgeben.
 */
export function tryAcquireLock(key: string): boolean {
  if (activeLocks.has(key)) return false;
  activeLocks.add(key);
  return true;
}

/**
 * Postgres-Advisory-Lock acquiren.
 *
 * Verhalten:
 *   - Wird ein Supabase-Client übergeben, wird zuerst der In-Memory-Lock
 *     gesetzt (gegen Re-Entry im selben Prozess) und anschließend
 *     `try_advisory_lock(key)` als RPC aufgerufen.
 *   - Schlägt der Postgres-RPC fehl (Netzwerk, RLS), fällt der Helper auf
 *     den In-Memory-Lock zurück, behält aber den `acquired`-Status. Damit
 *     gehen wir nie in 409, wenn die DB nur kurz gewackelt hat.
 *   - Wird `null`/`undefined` als Client übergeben, läuft der Code rein
 *     in-memory (Test-Fallback).
 *
 * Returns: `true` = Lock gehört dem Aufrufer, `false` = Lock ist belegt.
 */
export async function acquireLock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any | null | undefined,
  key: string,
): Promise<boolean> {
  // Schritt 1: In-Memory-Reservierung. Wenn schon belegt, sofort raus.
  if (!tryAcquireLock(key)) return false;

  // Schritt 2: Postgres-Lock, falls Client vorhanden.
  if (!supabase || typeof supabase.rpc !== "function") {
    return true;
  }

  try {
    const { data, error } = await supabase.rpc("try_advisory_lock", {
      p_key_text: key,
    });
    if (error) {
      // RPC kaputt? Wir behalten den In-Memory-Lock, das ist besser als 409.
      console.warn("[concurrencyLock] try_advisory_lock RPC failed:", error.message);
      return true;
    }
    if (data === false) {
      // Postgres sagt: belegt → unseren In-Memory-Lock wieder freigeben und 409.
      activeLocks.delete(key);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[concurrencyLock] try_advisory_lock threw:", (err as Error)?.message ?? err);
    return true;
  }
}

/**
 * Lock freigeben (sowohl In-Memory als auch Postgres-Advisory).
 *
 * Idempotent: doppeltes Release ist no-op.
 *
 * Drei Aufrufvarianten zur Rückwärtskompatibilität:
 *   - releaseLock(key)                  → nur In-Memory (legacy/synchron)
 *   - releaseLock(supabase, key)        → In-Memory + Postgres-RPC (Production)
 *   - releaseLock(null, key)            → nur In-Memory (Test ohne DB)
 */
export function releaseLock(key: string): void;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function releaseLock(supabase: any | null | undefined, key: string): Promise<void>;
export function releaseLock(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  arg1: string | any | null | undefined,
  arg2?: string,
): void | Promise<void> {
  if (typeof arg1 === "string" && arg2 === undefined) {
    // Legacy synchroner Aufruf — nur In-Memory.
    activeLocks.delete(arg1);
    return;
  }

  const supabase = arg1;
  const key = arg2 as string;
  activeLocks.delete(key);

  if (!supabase || typeof supabase.rpc !== "function") {
    return Promise.resolve();
  }

  return (async () => {
    try {
      const { error } = await supabase.rpc("release_advisory_lock", {
        p_key_text: key,
      });
      if (error) {
        console.warn("[concurrencyLock] release_advisory_lock RPC failed:", error.message);
      }
    } catch (err) {
      console.warn("[concurrencyLock] release_advisory_lock threw:", (err as Error)?.message ?? err);
    }
  })();
}

/**
 * Test-Helper: Lock-Set leeren (nur für Vitest).
 */
export function __resetLocksForTesting(): void {
  activeLocks.clear();
}

/**
 * Test-Helper: Snapshot der aktiven Locks lesen.
 */
export function __getActiveLocksForTesting(): string[] {
  return Array.from(activeLocks);
}
