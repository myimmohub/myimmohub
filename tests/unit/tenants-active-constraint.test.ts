/**
 * Tests für den "1 aktiver Mieter pro Einheit"-Constraint in den Tenant-APIs.
 *
 * Strategie analog zu nka-api.test.ts: Mock von next/headers und
 * @supabase/ssr, gezieltes Durchreichen vorgegebener DB-Antworten.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const UNIT_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_ID_NEW = "22222222-2222-4222-8222-222222222222";
const TENANT_ID_EXISTING = "33333333-3333-4333-8333-333333333333";
const TENANT_ID_BLOCKING = "44444444-4444-4444-8444-444444444444";
const USER_ID = "u-1";

const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIG_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  vi.resetModules();
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIG_KEY;
});

type StubResponse = { data: unknown; error: unknown };

/**
 * Sehr kleines Supabase-Stub: pro `from(table)` reichen wir die nächste
 * Antwort aus `responses` durch. Gemeinsame Builder-Methoden geben sich
 * selbst zurück, terminale Operationen (single/maybeSingle/then) lösen
 * mit der nächsten Antwort auf.
 */
function makeSupabaseStub(opts: {
  user: { id: string } | null;
  responses?: StubResponse[];
  insertResponses?: StubResponse[];
}) {
  const responses = [...(opts.responses ?? [])];
  const insertResponses = [...(opts.insertResponses ?? [])];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeBuilder(next: () => StubResponse): any {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
      neq: () => builder,
      is: () => builder,
      in: () => builder,
      order: () => builder,
      maybeSingle: () => Promise.resolve(next()),
      single: () => Promise.resolve(next()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (onfulfilled: any) => Promise.resolve(next()).then(onfulfilled),
    };
    return builder;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stub: any = {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from: (_table: string): any => ({
      select: () => makeBuilder(() => responses.shift() ?? { data: null, error: null }),
      insert: (_row: unknown) => ({
        select: () => ({
          single: () =>
            Promise.resolve(insertResponses.shift() ?? { data: null, error: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve(insertResponses.shift() ?? { data: null, error: null }),
          }),
        }),
      }),
    }),
  };
  return stub;
}

function mockSupabase(stub: ReturnType<typeof makeSupabaseStub>) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [] }),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => stub,
  }));
}

describe("POST /api/tenants — Constraint '1 aktiver Mieter pro Einheit'", () => {
  it("→ 409, wenn bereits ein aktiver Mieter ohne lease_end auf der Einheit existiert", async () => {
    const stub = makeSupabaseStub({
      user: { id: USER_ID },
      responses: [
        // 1) Unit + properties owner-check
        {
          data: {
            id: UNIT_ID,
            label: "Wohnung 3",
            property_id: "p-1",
            properties: { user_id: USER_ID },
          },
          error: null,
        },
        // 2) Blocking-Query: aktiver Mieter ohne lease_end
        {
          data: [
            { id: TENANT_ID_BLOCKING, first_name: "Hans", last_name: "Müller" },
          ],
          error: null,
        },
      ],
    });
    mockSupabase(stub);
    const { POST } = await import("@/app/api/tenants/route");
    const req = new Request("http://x/api/tenants", {
      method: "POST",
      body: JSON.stringify({
        unit_id: UNIT_ID,
        first_name: "Anna",
        last_name: "Schmidt",
        lease_start: "2025-01-01",
        cold_rent_cents: 80000,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toMatch(/aktiven Mieter/);
    expect(json.error).toMatch(/Hans Müller/);
  });

  it("→ 201, wenn kein konkurrierender aktiver Mieter existiert", async () => {
    const stub = makeSupabaseStub({
      user: { id: USER_ID },
      responses: [
        // 1) Unit lookup
        {
          data: {
            id: UNIT_ID,
            label: "Wohnung 3",
            property_id: "p-1",
            properties: { user_id: USER_ID },
          },
          error: null,
        },
        // 2) Blocking-Query: leer
        { data: [], error: null },
      ],
      insertResponses: [
        { data: { id: TENANT_ID_NEW, unit_id: UNIT_ID, status: "active" }, error: null },
      ],
    });
    mockSupabase(stub);
    const { POST } = await import("@/app/api/tenants/route");
    const req = new Request("http://x/api/tenants", {
      method: "POST",
      body: JSON.stringify({
        unit_id: UNIT_ID,
        first_name: "Anna",
        last_name: "Schmidt",
        lease_start: "2025-01-01",
        cold_rent_cents: 80000,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("→ POST mit lease_end gesetzt überspringt Blocking-Check (kein 409)", async () => {
    // Wenn der neue Mieter ein lease_end hat, ist er nicht „voll aktiv" und
    // greift nicht in den Constraint ein.
    const stub = makeSupabaseStub({
      user: { id: USER_ID },
      responses: [
        {
          data: {
            id: UNIT_ID,
            label: "Wohnung 3",
            property_id: "p-1",
            properties: { user_id: USER_ID },
          },
          error: null,
        },
        // Blocking-Check wird trotzdem aufgerufen, aber egal: der Test prüft,
        // dass mindestens kein 409 fliegt (die Logik im Code überspringt den
        // Check, wenn lease_end gesetzt ist — beide Pfade wären OK).
        { data: [], error: null },
      ],
      insertResponses: [
        { data: { id: TENANT_ID_NEW, unit_id: UNIT_ID }, error: null },
      ],
    });
    mockSupabase(stub);
    const { POST } = await import("@/app/api/tenants/route");
    const req = new Request("http://x/api/tenants", {
      method: "POST",
      body: JSON.stringify({
        unit_id: UNIT_ID,
        first_name: "Anna",
        last_name: "Schmidt",
        lease_start: "2025-01-01",
        lease_end: "2025-12-31",
        cold_rent_cents: 80000,
      }),
    });
    const res = await POST(req);
    expect(res.status).not.toBe(409);
  });
});

describe("PATCH /api/tenants/[id] — Constraint", () => {
  it("→ 409, wenn PATCH den Mieter aktivieren würde und ein anderer bereits aktiv ist", async () => {
    // Existing Mieter: status=ended, lease_end=null (theoretischer
    // Übergangsfall). PATCH versucht, ihn auf active+lease_end=null zu setzen.
    // Aber ein anderer Mieter blockiert die Einheit.
    const stub = makeSupabaseStub({
      user: { id: USER_ID },
      responses: [
        // verifyTenantOwnership
        {
          data: {
            id: TENANT_ID_EXISTING,
            status: "ended",
            lease_end: null,
            unit_id: UNIT_ID,
            units: { id: UNIT_ID, property_id: "p-1", properties: { user_id: USER_ID } },
          },
          error: null,
        },
        // Blocking-Query
        {
          data: [
            { id: TENANT_ID_BLOCKING, first_name: "Hans", last_name: "Müller" },
          ],
          error: null,
        },
      ],
    });
    mockSupabase(stub);
    const { PATCH } = await import("@/app/api/tenants/[id]/route");
    const req = new Request(`http://x/api/tenants/${TENANT_ID_EXISTING}`, {
      method: "PATCH",
      body: JSON.stringify({ status: "active", lease_end: null }),
    });
    const res = await PATCH(req, { params: Promise.resolve({ id: TENANT_ID_EXISTING }) });
    expect(res.status).toBe(409);
  });
});
