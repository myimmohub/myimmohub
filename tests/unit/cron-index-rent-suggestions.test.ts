/**
 * Unit-Tests für POST /api/cron/index-rent-suggestions.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

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

function makeSupabaseStub(opts: {
  user: { id: string } | null;
  selectQueueByTable?: Record<string, StubResponse[]>;
  insertQueueByTable?: Record<string, StubResponse[]>;
  maybeSingleQueueByTable?: Record<string, StubResponse[]>;
}) {
  const recordedInserts: Array<{ table: string; payload: unknown }> = [];

  function makeBuilder(
    selectQueue: StubResponse[] | undefined,
    maybeQueue: StubResponse[] | undefined,
  ) {
    const next = (q: StubResponse[] | undefined): StubResponse =>
      (q && q.shift()) ?? { data: null, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      returns: () => builder,
      maybeSingle: () => Promise.resolve(next(maybeQueue ?? selectQueue)),
      single: () => Promise.resolve(next(selectQueue)),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (onfulfilled: any) => Promise.resolve(next(selectQueue)).then(onfulfilled),
    };
    return builder;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client: any = {
    auth: {
      getUser: async () => ({ data: { user: opts.user }, error: null }),
    },
    from: (table: string) => ({
      select: () =>
        makeBuilder(
          opts.selectQueueByTable?.[table],
          opts.maybeSingleQueueByTable?.[table],
        ),
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
    }),
  };
  return { client, recordedInserts };
}

function mockNextHeadersAndSsr(client: unknown) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [], set: () => {} }),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => client,
  }));
}

function makeReq(headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/index-rent-suggestions", {
    method: "POST",
    headers,
  });
}

const tenantIndex = (id: string, userId: string, baseDate = "2020-01-01") => ({
  id,
  unit_id: "unit-" + id,
  rent_type: "index",
  cold_rent_cents: 80000,
  index_base_value: 800.0,
  index_base_date: baseDate,
  index_interval_months: 12,
  units: { id: "unit-" + id, property_id: "prop-" + id, properties: { user_id: userId } },
});

describe("POST /api/cron/index-rent-suggestions", () => {
  it("Bearer-Secret korrekt → läuft durch (cron-mode)", async () => {
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tenantIndex(TENANT_A, "u1")], error: null }],
        cpi_index_values: [
          {
            data: [
              { index_date: "2025-01-01", index_value: 122.7 },
              { index_date: "2020-01-01", index_value: 100.0 },
            ],
            error: null,
          },
        ],
        rent_adjustments: [{ data: [], error: null }],
      },
      maybeSingleQueueByTable: {
        rent_adjustment_suggestions: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants_evaluated).toBe(1);
    expect(body.suggestions_created).toBe(1);
    expect(stub.recordedInserts.find((i) => i.table === "rent_adjustment_suggestions")).toBeTruthy();
  });

  it("Bearer-Secret falsch → 401", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("Kein Bearer + kein User → 401", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it("User-Mode: nur eigene Mieter werden bewertet", async () => {
    const tA = tenantIndex(TENANT_A, "u1");
    const tB = tenantIndex(TENANT_B, "u2");
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        tenants: [{ data: [tA, tB], error: null }],
        cpi_index_values: [
          {
            data: [
              { index_date: "2025-01-01", index_value: 122.7 },
              { index_date: "2020-01-01", index_value: 100.0 },
            ],
            error: null,
          },
        ],
        rent_adjustments: [{ data: [], error: null }],
      },
      maybeSingleQueueByTable: {
        rent_adjustment_suggestions: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants_evaluated).toBe(1);
  });

  it("Kein CPI vorhanden → kein Crash, alles übersprungen", async () => {
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tenantIndex(TENANT_A, "u1")], error: null }],
        cpi_index_values: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions_created).toBe(0);
    expect(body.suggestions_skipped).toBe(1);
  });

  it("Eligible-Mieter (Index +20%, 12 Monate seit Basis) → Suggestion", async () => {
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tenantIndex(TENANT_A, "u1", "2020-01-01")], error: null }],
        cpi_index_values: [
          {
            data: [
              { index_date: "2025-01-01", index_value: 120.0 },
              { index_date: "2020-01-01", index_value: 100.0 },
            ],
            error: null,
          },
        ],
        rent_adjustments: [{ data: [], error: null }],
      },
      maybeSingleQueueByTable: {
        rent_adjustment_suggestions: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions_created).toBe(1);
    const ins = stub.recordedInserts.find((i) => i.table === "rent_adjustment_suggestions");
    expect(ins).toBeTruthy();
    const payload = ins!.payload as Record<string, number>;
    // 800 EUR * 20% = 160 EUR Delta = 16000 cents
    expect(payload.delta_cents).toBe(16000);
    expect(payload.proposed_cold_rent_cents).toBe(96000);
  });

  it("Not-eligible (Mindestabstand nicht erreicht) → keine Suggestion", async () => {
    const tooRecent = tenantIndex(TENANT_A, "u1", "2025-06-01"); // base_date kürzlich
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tooRecent], error: null }],
        cpi_index_values: [
          {
            data: [
              { index_date: "2025-08-01", index_value: 122.0 },
              { index_date: "2025-06-01", index_value: 120.0 },
            ],
            error: null,
          },
        ],
        rent_adjustments: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions_created).toBe(0);
    expect(body.suggestions_skipped).toBe(1);
  });

  it("Idempotenz: Suggestion mit gleichem (tenant, base_index, current_index) existiert → skip", async () => {
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tenantIndex(TENANT_A, "u1")], error: null }],
        cpi_index_values: [
          {
            data: [
              { index_date: "2025-01-01", index_value: 120.0 },
              { index_date: "2020-01-01", index_value: 100.0 },
            ],
            error: null,
          },
        ],
        rent_adjustments: [{ data: [], error: null }],
      },
      maybeSingleQueueByTable: {
        // Bereits vorhanden:
        rent_adjustment_suggestions: [{ data: { id: "existing-id" }, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions_created).toBe(0);
    expect(body.suggestions_skipped).toBe(1);
  });

  it("Error-Resilience: Insert-Fehler bei einem Mieter blockiert nicht die anderen", async () => {
    const tA = tenantIndex(TENANT_A, "u1");
    const tB = tenantIndex(TENANT_B, "u1");
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tA, tB], error: null }],
        cpi_index_values: [
          {
            data: [
              { index_date: "2025-01-01", index_value: 120.0 },
              { index_date: "2020-01-01", index_value: 100.0 },
            ],
            error: null,
          },
        ],
        rent_adjustments: [
          { data: [], error: null },
          { data: [], error: null },
        ],
      },
      maybeSingleQueueByTable: {
        rent_adjustment_suggestions: [
          { data: null, error: null },
          { data: null, error: null },
        ],
      },
      insertQueueByTable: {
        rent_adjustment_suggestions: [
          { data: null, error: { message: "tenant A failed" } },
          { data: null, error: null },
        ],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.suggestions_created).toBe(1);
    expect(body.errors).toHaveLength(1);
  });

  it("Mieter ohne index_base_value/index_base_date → wird nicht ausgewertet", async () => {
    const incomplete = {
      ...tenantIndex(TENANT_A, "u1"),
      index_base_value: null,
    };
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [incomplete], error: null }],
        cpi_index_values: [
          {
            data: [
              { index_date: "2025-01-01", index_value: 120.0 },
              { index_date: "2020-01-01", index_value: 100.0 },
            ],
            error: null,
          },
        ],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/cron/index-rent-suggestions/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tenants_evaluated).toBe(0);
  });
});
