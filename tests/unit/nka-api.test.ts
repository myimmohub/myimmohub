/**
 * Unit-Tests für die NKA-API.
 *
 * Strategie analog zu sonder-wk-api.test.ts:
 *   - Schema-Validation direkt gegen Zod-Schemas testen.
 *   - Auth/Ownership/Statuscodes über next/headers + @supabase/ssr-Mocks.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  nkaCostItemCreateSchema,
  nkaPeriodCreateSchema,
  nkaPeriodUpdateSchema,
} from "@/lib/nka/requestSchemas";

const PROP_UUID = "11111111-1111-4111-8111-111111111111";
const PERIOD_UUID = "22222222-2222-4222-8222-222222222222";
const ITEM_UUID = "33333333-3333-4333-8333-333333333333";
const TENANT_UUID = "44444444-4444-4444-8444-444444444444";

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

// ─── Schema-Tests · Periode anlegen ──────────────────────────────────────────
describe("nkaPeriodCreateSchema", () => {
  const validBody = {
    property_id: PROP_UUID,
    tax_year: 2024,
    period_start: "2024-01-01",
    period_end: "2024-12-31",
    note: null,
  };

  it("Akzeptiert gültigen Body", () => {
    expect(nkaPeriodCreateSchema.safeParse(validBody).success).toBe(true);
  });

  it("Lehnt ungültige property_id ab", () => {
    expect(
      nkaPeriodCreateSchema.safeParse({ ...validBody, property_id: "abc" }).success,
    ).toBe(false);
  });

  it("Lehnt period_end vor period_start ab", () => {
    expect(
      nkaPeriodCreateSchema.safeParse({
        ...validBody,
        period_start: "2024-12-31",
        period_end: "2024-01-01",
      }).success,
    ).toBe(false);
  });

  it("Lehnt ungültiges Datumsformat ab", () => {
    expect(
      nkaPeriodCreateSchema.safeParse({
        ...validBody,
        period_start: "01.01.2024",
      }).success,
    ).toBe(false);
  });

  it("Lehnt tax_year < 2000 ab", () => {
    expect(
      nkaPeriodCreateSchema.safeParse({ ...validBody, tax_year: 1900 }).success,
    ).toBe(false);
  });
});

describe("nkaPeriodUpdateSchema", () => {
  it("Akzeptiert leeren Body", () => {
    expect(nkaPeriodUpdateSchema.safeParse({}).success).toBe(true);
  });
  it("Lehnt unbekannten Status ab", () => {
    expect(
      nkaPeriodUpdateSchema.safeParse({ status: "foo" }).success,
    ).toBe(false);
  });
  it("Akzeptiert gültige Status-Werte", () => {
    for (const s of ["draft", "distributed", "sent", "closed"] as const) {
      expect(nkaPeriodUpdateSchema.safeParse({ status: s }).success).toBe(true);
    }
  });
});

// ─── Schema-Tests · Cost-Item ────────────────────────────────────────────────
describe("nkaCostItemCreateSchema", () => {
  const validBody = {
    position: "grundsteuer" as const,
    label: "Grundsteuer 2024",
    brutto_cents: 50000,
    umlagefaehig_pct: 100,
    verteilungsschluessel: "sqm" as const,
  };
  it("Akzeptiert gültigen Body", () => {
    expect(nkaCostItemCreateSchema.safeParse(validBody).success).toBe(true);
  });
  it("Lehnt unbekannte position ab", () => {
    expect(
      nkaCostItemCreateSchema.safeParse({ ...validBody, position: "luxus" })
        .success,
    ).toBe(false);
  });
  it("Lehnt umlagefaehig_pct > 100 ab", () => {
    expect(
      nkaCostItemCreateSchema.safeParse({ ...validBody, umlagefaehig_pct: 110 })
        .success,
    ).toBe(false);
  });
  it("Lehnt umlagefaehig_pct < 0 ab", () => {
    expect(
      nkaCostItemCreateSchema.safeParse({ ...validBody, umlagefaehig_pct: -1 })
        .success,
    ).toBe(false);
  });
  it("Akzeptiert direct_shares-Map mit UUID-Keys", () => {
    expect(
      nkaCostItemCreateSchema.safeParse({
        ...validBody,
        verteilungsschluessel: "direct",
        direct_shares: { [TENANT_UUID]: 1000 },
      }).success,
    ).toBe(true);
  });
  it("Lehnt direct_shares mit nicht-UUID-Key ab", () => {
    expect(
      nkaCostItemCreateSchema.safeParse({
        ...validBody,
        verteilungsschluessel: "direct",
        direct_shares: { "not-a-uuid": 1000 },
      }).success,
    ).toBe(false);
  });
});

// ─── Supabase-Stub (analog sonder-wk) ───────────────────────────────────────
type StubResponse = { data: unknown; error: unknown };

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
      in: () => builder,
      gte: () => builder,
      lte: () => builder,
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
      select: () =>
        makeBuilder(() => responses.shift() ?? { data: null, error: null }),
      insert: () => ({
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
      delete: () => ({
        eq: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
  };
  return stub;
}

function mockNextHeadersAndSsr(
  supabaseStub: ReturnType<typeof makeSupabaseStub>,
) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [] }),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => supabaseStub,
  }));
}

// ─── Handler-Tests · POST /api/nka/periods ──────────────────────────────────
describe("POST /api/nka/periods", () => {
  it("→ 400 bei ungültigem JSON", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { POST } = await import("@/app/api/nka/periods/route");
    const req = new Request("http://x/api/nka/periods", {
      method: "POST",
      body: "garbage",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("→ 400 bei Schema-Fehler", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { POST } = await import("@/app/api/nka/periods/route");
    const req = new Request("http://x/api/nka/periods", {
      method: "POST",
      body: JSON.stringify({ property_id: "abc", tax_year: 1900 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }));
    const { POST } = await import("@/app/api/nka/periods/route");
    const req = new Request("http://x/api/nka/periods", {
      method: "POST",
      body: JSON.stringify({
        property_id: PROP_UUID,
        tax_year: 2024,
        period_start: "2024-01-01",
        period_end: "2024-12-31",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("→ 404 wenn Property nicht gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [{ data: null, error: null }],
      }),
    );
    const { POST } = await import("@/app/api/nka/periods/route");
    const req = new Request("http://x/api/nka/periods", {
      method: "POST",
      body: JSON.stringify({
        property_id: PROP_UUID,
        tax_year: 2024,
        period_start: "2024-01-01",
        period_end: "2024-12-31",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("→ 201 bei erfolgreichem Insert", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [{ data: { id: PROP_UUID }, error: null }],
        insertResponses: [
          {
            data: {
              id: PERIOD_UUID,
              property_id: PROP_UUID,
              tax_year: 2024,
              status: "draft",
            },
            error: null,
          },
        ],
      }),
    );
    const { POST } = await import("@/app/api/nka/periods/route");
    const req = new Request("http://x/api/nka/periods", {
      method: "POST",
      body: JSON.stringify({
        property_id: PROP_UUID,
        tax_year: 2024,
        period_start: "2024-01-01",
        period_end: "2024-12-31",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("→ 409 bei Unique-Verletzung", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [{ data: { id: PROP_UUID }, error: null }],
        insertResponses: [
          { data: null, error: { code: "23505", message: "duplicate" } },
        ],
      }),
    );
    const { POST } = await import("@/app/api/nka/periods/route");
    const req = new Request("http://x/api/nka/periods", {
      method: "POST",
      body: JSON.stringify({
        property_id: PROP_UUID,
        tax_year: 2024,
        period_start: "2024-01-01",
        period_end: "2024-12-31",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
  });
});

// ─── Handler-Tests · GET /api/nka/periods ──────────────────────────────────
describe("GET /api/nka/periods", () => {
  it("→ 400 ohne property_id-Query", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { GET } = await import("@/app/api/nka/periods/route");
    const req = new Request("http://x/api/nka/periods");
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }));
    const { GET } = await import("@/app/api/nka/periods/route");
    const req = new Request(`http://x/api/nka/periods?property_id=${PROP_UUID}`);
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("→ 404 wenn Property nicht gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [{ data: null, error: null }],
      }),
    );
    const { GET } = await import("@/app/api/nka/periods/route");
    const req = new Request(`http://x/api/nka/periods?property_id=${PROP_UUID}`);
    const res = await GET(req);
    expect(res.status).toBe(404);
  });
});

// ─── Handler-Tests · cost-items ────────────────────────────────────────────
describe("POST /api/nka/periods/[id]/cost-items", () => {
  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }));
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/route"
    );
    const req = new Request(`http://x/api/nka/periods/${PERIOD_UUID}/cost-items`, {
      method: "POST",
      body: JSON.stringify({
        position: "grundsteuer",
        brutto_cents: 1000,
        umlagefaehig_pct: 100,
        verteilungsschluessel: "sqm",
      }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: PERIOD_UUID }) });
    expect(res.status).toBe(401);
  });

  it("→ 400 bei Schema-Fehler (unbekannter Schlüssel)", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/route"
    );
    const req = new Request(
      `http://x/api/nka/periods/${PERIOD_UUID}/cost-items`,
      {
        method: "POST",
        body: JSON.stringify({
          position: "grundsteuer",
          brutto_cents: 1000,
          umlagefaehig_pct: 100,
          verteilungsschluessel: "magic",
        }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: PERIOD_UUID }) });
    expect(res.status).toBe(400);
  });

  it("→ 404 wenn Periode nicht gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [{ data: null, error: null }], // period nicht gefunden
      }),
    );
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/route"
    );
    const req = new Request(
      `http://x/api/nka/periods/${PERIOD_UUID}/cost-items`,
      {
        method: "POST",
        body: JSON.stringify({
          position: "grundsteuer",
          brutto_cents: 1000,
          umlagefaehig_pct: 100,
          verteilungsschluessel: "sqm",
        }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: PERIOD_UUID }) });
    expect(res.status).toBe(404);
  });
});

describe("PATCH /api/nka/periods/[id]/cost-items/[itemId]", () => {
  it("→ 400 bei leerem Body", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { PATCH } = await import(
      "@/app/api/nka/periods/[id]/cost-items/[itemId]/route"
    );
    const req = new Request(
      `http://x/api/nka/periods/${PERIOD_UUID}/cost-items/${ITEM_UUID}`,
      { method: "PATCH", body: JSON.stringify({}) },
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: PERIOD_UUID, itemId: ITEM_UUID }),
    });
    expect(res.status).toBe(400);
  });

  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }));
    const { PATCH } = await import(
      "@/app/api/nka/periods/[id]/cost-items/[itemId]/route"
    );
    const req = new Request(
      `http://x/api/nka/periods/${PERIOD_UUID}/cost-items/${ITEM_UUID}`,
      { method: "PATCH", body: JSON.stringify({ label: "neu" }) },
    );
    const res = await PATCH(req, {
      params: Promise.resolve({ id: PERIOD_UUID, itemId: ITEM_UUID }),
    });
    expect(res.status).toBe(401);
  });
});

// ─── Distribute-Route ────────────────────────────────────────────────────────
describe("POST /api/nka/periods/[id]/distribute", () => {
  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }));
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/distribute/route"
    );
    const req = new Request(
      `http://x/api/nka/periods/${PERIOD_UUID}/distribute`,
      { method: "POST" },
    );
    const res = await POST(req, { params: Promise.resolve({ id: PERIOD_UUID }) });
    expect(res.status).toBe(401);
  });

  it("→ 400 bei ungültiger Period-ID", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/distribute/route"
    );
    const req = new Request("http://x/api/nka/periods/abc/distribute", {
      method: "POST",
    });
    const res = await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("→ 404 wenn Periode nicht existiert", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [{ data: null, error: null }],
      }),
    );
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/distribute/route"
    );
    const req = new Request(
      `http://x/api/nka/periods/${PERIOD_UUID}/distribute`,
      { method: "POST" },
    );
    const res = await POST(req, { params: Promise.resolve({ id: PERIOD_UUID }) });
    expect(res.status).toBe(404);
  });
});
