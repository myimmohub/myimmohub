/**
 * Unit-Tests für POST /api/cron/materialize-staffel.
 *
 * Strategie: Supabase via @supabase/ssr-Stub gemockt.
 *   - Cron-Mode: Bearer ${CRON_SECRET}
 *   - User-Mode: cookie-getUser() liefert User
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";
const TENANT_C = "33333333-3333-4333-8333-333333333333";

const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIG_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ORIG_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  process.env.CRON_SECRET = "secret-xyz";
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIG_KEY;
  process.env.CRON_SECRET = ORIG_SECRET;
  vi.doUnmock("next/headers");
  vi.doUnmock("@supabase/ssr");
});

type StubResponse = { data: unknown; error: unknown };

type SupabaseStubOpts = {
  user: { id: string } | null;
  selectQueueByTable?: Record<string, StubResponse[]>;
  insertQueueByTable?: Record<string, StubResponse[]>;
  updateQueueByTable?: Record<string, StubResponse[]>;
};

type StubResult = {
  client: unknown;
  recordedInserts: Array<{ table: string; payload: unknown }>;
  recordedUpdates: Array<{ table: string; payload: unknown }>;
};

function makeSupabaseStub(opts: SupabaseStubOpts): StubResult {
  const recordedInserts: StubResult["recordedInserts"] = [];
  const recordedUpdates: StubResult["recordedUpdates"] = [];

  function makeBuilder(queue: StubResponse[] | undefined) {
    const next = (): StubResponse =>
      (queue && queue.shift()) ?? { data: null, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      returns: () => builder,
      maybeSingle: () => Promise.resolve(next()),
      single: () => Promise.resolve(next()),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (onfulfilled: any) => Promise.resolve(next()).then(onfulfilled),
    };
    return builder;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
    },
    from: (table: string) => ({
      select: () => makeBuilder(opts.selectQueueByTable?.[table]),
      insert: (payload: unknown) => {
        recordedInserts.push({ table, payload });
        const queue = opts.insertQueueByTable?.[table];
        const next = (): StubResponse =>
          (queue && queue.shift()) ?? { data: null, error: null };
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          then: (onfulfilled: any) => Promise.resolve(next()).then(onfulfilled),
          select: () => ({
            single: () => Promise.resolve(next()),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (onfulfilled: any) => Promise.resolve(next()).then(onfulfilled),
          }),
        };
      },
      update: (payload: unknown) => {
        recordedUpdates.push({ table, payload });
        const queue = opts.updateQueueByTable?.[table];
        return {
          eq: () => ({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            then: (onfulfilled: any) =>
              Promise.resolve(
                (queue && queue.shift()) ?? { data: null, error: null },
              ).then(onfulfilled),
          }),
        };
      },
    }),
  };
  return { client, recordedInserts, recordedUpdates };
}

function mockNextHeadersAndSsr(client: unknown) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({
      getAll: () => [],
      set: () => {},
    }),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => client,
  }));
}

function makeReq(headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/materialize-staffel", {
    method: "POST",
    headers,
  });
}

const PAST = "1990-01-01"; // garantiert vor heute

const tenantStepped = (id: string, userId: string) => ({
  id,
  unit_id: "unit-" + id,
  rent_type: "stepped",
  staffel_entries: [{ effective_date: PAST, cold_rent_cents: 80000 }],
  units: { id: "unit-" + id, property_id: "prop-" + id, properties: { user_id: userId } },
});

describe("POST /api/cron/materialize-staffel", () => {
  it("Bearer-Secret korrekt → läuft durch (cron-mode)", async () => {
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tenantStepped(TENANT_A, "u1")], error: null }],
        rent_adjustments: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants_processed).toBe(1);
    expect(body.adjustments_created).toBe(1);
    expect(stub.recordedInserts.find((i) => i.table === "rent_adjustments")).toBeTruthy();
  });

  it("Bearer-Secret falsch → 401", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("Kein Bearer + kein User → 401", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it("User-Mode: nur eigene Mieter werden verarbeitet", async () => {
    const tA = tenantStepped(TENANT_A, "u1");
    const tB = tenantStepped(TENANT_B, "u2"); // anderer User
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        tenants: [{ data: [tA, tB], error: null }],
        rent_adjustments: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants_processed).toBe(1);
    expect(body.adjustments_created).toBe(1);
  });

  it("Cron-Mode: alle Mieter über alle User", async () => {
    const tA = tenantStepped(TENANT_A, "u1");
    const tB = tenantStepped(TENANT_B, "u2");
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tA, tB], error: null }],
        rent_adjustments: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants_processed).toBe(2);
    expect(body.adjustments_created).toBe(2);
  });

  it("Mieter ohne staffel_entries → übersprungen (kein Insert)", async () => {
    const tEmpty = {
      id: TENANT_A,
      unit_id: "unit-x",
      rent_type: "stepped",
      staffel_entries: [],
      units: { id: "unit-x", property_id: "p-x", properties: { user_id: "u1" } },
    };
    const tNull = {
      ...tEmpty,
      id: TENANT_B,
      staffel_entries: null,
    };
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tEmpty, tNull], error: null }],
        rent_adjustments: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants_processed).toBe(0);
    expect(body.adjustments_created).toBe(0);
  });

  it("Idempotenz: zweiter Aufruf erzeugt nichts Neues", async () => {
    const t = tenantStepped(TENANT_A, "u1");
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [t], error: null }],
        // Schon vorhandenes Adjustment für PAST → skip "already_active"
        rent_adjustments: [
          {
            data: [
              {
                tenant_id: TENANT_A,
                effective_date: PAST,
                cold_rent_cents: 80000,
                additional_costs_cents: null,
                adjustment_type: "stepped",
              },
            ],
            error: null,
          },
        ],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adjustments_created).toBe(0);
    expect(body.adjustments_skipped).toBe(1);
    expect(stub.recordedInserts.find((i) => i.table === "rent_adjustments")).toBeFalsy();
  });

  it("Tenant-Update: cold_rent_cents/additional_costs_cents bei Stufe ≤ heute", async () => {
    const t = {
      id: TENANT_A,
      unit_id: "unit-a",
      rent_type: "stepped",
      staffel_entries: [
        { effective_date: PAST, cold_rent_cents: 80000, additional_costs_cents: 12000 },
      ],
      units: { id: "unit-a", property_id: "p-a", properties: { user_id: "u1" } },
    };
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [t], error: null }],
        rent_adjustments: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const tenantUpdate = stub.recordedUpdates.find((u) => u.table === "tenants");
    expect(tenantUpdate).toBeTruthy();
    const payload = tenantUpdate!.payload as Record<string, number>;
    expect(payload.cold_rent_cents).toBe(80000);
    expect(payload.additional_costs_cents).toBe(12000);
  });

  it("Future-Stufe → kein Tenant-Update auf zukünftigen Wert", async () => {
    const FUTURE = "9999-01-01";
    const t = {
      id: TENANT_A,
      unit_id: "unit-a",
      rent_type: "stepped",
      staffel_entries: [
        { effective_date: FUTURE, cold_rent_cents: 99999 },
      ],
      units: { id: "unit-a", property_id: "p-a", properties: { user_id: "u1" } },
    };
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [t], error: null }],
        rent_adjustments: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.adjustments_created).toBe(0);
    expect(stub.recordedUpdates.find((u) => u.table === "tenants")).toBeFalsy();
  });

  it("Error in einem Mieter blockiert nicht die anderen", async () => {
    const tA = tenantStepped(TENANT_A, "u1");
    const tB = tenantStepped(TENANT_B, "u1");
    const tC = tenantStepped(TENANT_C, "u1");
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tA, tB, tC], error: null }],
        rent_adjustments: [{ data: [], error: null }],
      },
      insertQueueByTable: {
        // 1. Insert ok, 2. Insert error, 3. Insert ok
        rent_adjustments: [
          { data: null, error: null },
          { data: null, error: { message: "insert failed for B" } },
          { data: null, error: null },
        ],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/materialize-staffel/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants_processed).toBe(3);
    expect(body.adjustments_created).toBe(2);
    expect(body.errors).toHaveLength(1);
    expect(body.errors[0].tenant_id).toBe(TENANT_B);
  });
});
