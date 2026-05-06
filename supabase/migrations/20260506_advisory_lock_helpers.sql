-- ============================================================================
-- Advisory-Lock-Helpers für Multi-Instance-Safe-Concurrency
-- ============================================================================
--
-- Hintergrund: `lib/tax/concurrencyLock.ts` arbeitete bisher in-memory. Das
-- reicht für single-process Setups, aber bei Vercel-Multi-Instance-Deployments
-- laufen parallele Recalcs in unterschiedlichen Worker-Prozessen → ein Worker
-- sieht den Lock des anderen nicht.
--
-- Diese Migration legt zwei RPC-Funktionen an, die einen Postgres-Session-
-- Advisory-Lock per Schlüssel-Text (z.B. "<property-uuid>::<tax-year>") setzen
-- bzw. wieder freigeben.
--
-- Wichtig: wir nutzen `pg_try_advisory_lock` (Session-scope) statt
-- `pg_advisory_xact_lock`, weil der Lock von der Anwendung explizit gehalten
-- werden soll (über mehrere Statements / `await`-Punkte hinweg) und nicht an
-- eine einzelne Postgres-Transaktion gebunden ist. Die Anwendung MUSS
-- sicherstellen, dass `release_advisory_lock` in jedem Pfad (try/finally)
-- aufgerufen wird, sonst bleibt der Lock bis zum Verbindungsabbau bestehen.
-- ============================================================================

CREATE OR REPLACE FUNCTION try_advisory_lock(p_key_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE v_key BIGINT;
BEGIN
  v_key := ('x' || md5(p_key_text))::bit(64)::bigint;
  RETURN pg_try_advisory_lock(v_key);
END $$;

CREATE OR REPLACE FUNCTION release_advisory_lock(p_key_text TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
AS $$
DECLARE v_key BIGINT;
BEGIN
  v_key := ('x' || md5(p_key_text))::bit(64)::bigint;
  RETURN pg_advisory_unlock(v_key);
END $$;

GRANT EXECUTE ON FUNCTION try_advisory_lock(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION release_advisory_lock(TEXT) TO authenticated;
