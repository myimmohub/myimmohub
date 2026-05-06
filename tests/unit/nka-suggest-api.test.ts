/**
 * Unit-Tests für die NKA-Suggest-API.
 *   - GET /api/nka/periods/[id]/suggest
 *   - POST /api/nka/periods/[id]/cost-items/bulk-from-suggestions
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PROP_UUID = "11111111-1111-4111-8111-111111111111";
const PERIOD_UUID = "22222222-2222-4222-8222-222222222222";
const TX_UUID = "33333333-3333-4333-8333-333333333333";
const TX2_UUID = "44444444-4444-4444-8444-444444444444";

const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIG_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIG_KEY;
  vi.doUnmock("next/headers");
  vi.doUnmock("@supabase/ssr");
});

type StubResponse = { data: unknown; error: unknown };

function makeSupabaseStub(opts: {
  user: { id: string } | null;
  selectQueueByTable?: Record<string, StubResponse[]>;
  insertQueueByTable?: Record<string, StubResponse[]>;
}) {
  const recordedInserts: Array<{ table: string; payload: unknown }> = [];
  function makeBuilder(queue: StubResponse[] | undefined) {
    const next = (): StubResponse =>
      (queue && queue.shift()) ?? { data: null, error: null };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const builder: any = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      gte: () => builder,
      lte: () => builder,
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
          select: () => ({
            // bulk-insert kein single() → resolve via then
            then: (onfulfilled: (r: StubResponse) => unknown) =>
              Promise.resolve(next()).then(onfulfilled),
          }),
        };
      },
    }),
  };
  return { client, recordedInserts };
}

function mockNextHeadersAndSsr(client: unknown) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [] }),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => client,
  }));
}

const baseCtx = { params: Promise.resolve({ id: PERIOD_UUID }) };

describe("GET /api/nka/periods/[id]/suggest", () => {
  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { GET } = await import("@/app/api/nka/periods/[id]/suggest/route");
    const res = await GET(new Request("http://x"), baseCtx);
    expect(res.status).toBe(401);
  });

  it("→ 404 wenn Periode nicht zur User-Property gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        selectQueueByTable: {
          nka_perioden: [
            {
              data: {
                id: PERIOD_UUID,
                property_id: PROP_UUID,
                period_start: "2024-01-01",
                period_end: "2024-12-31",
              },
              error: null,
            },
          ],
          properties: [{ data: null, error: null }],
        },
      }).client,
    );
    const { GET } = await import("@/app/api/nka/periods/[id]/suggest/route");
    const res = await GET(new Request("http://x"), baseCtx);
    expect(res.status).toBe(404);
  });

  it("→ 200 liefert AutoSuggestOutput aus DB-Daten", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        selectQueueByTable: {
          nka_perioden: [
            {
              data: {
                id: PERIOD_UUID,
                property_id: PROP_UUID,
                period_start: "2024-01-01",
                period_end: "2024-12-31",
              },
              error: null,
            },
          ],
          properties: [{ data: { id: PROP_UUID }, error: null }],
          transactions: [
            {
              data: [
                {
                  id: TX_UUID,
                  date: "2024-03-15",
                  amount: -85,
                  category: "Müllabfuhr",
                  counterpart: "Stadtwerke",
                  description: null,
                },
                {
                  id: TX2_UUID,
                  date: "2024-04-15",
                  amount: -200,
                  category: null,
                  counterpart: "Müller GmbH",
                  description: null,
                },
              ],
              error: null,
            },
          ],
          nka_kostenpositionen: [{ data: [], error: null }],
        },
      }).client,
    );
    const { GET } = await import("@/app/api/nka/periods/[id]/suggest/route");
    const res = await GET(new Request("http://x"), baseCtx);
    expect(res.status).toBe(200);
    const body = await res.json();
    // tx1 wird als muellabfuhr/high vorgeschlagen, tx2 (Müller) NICHT (Word-Boundary)
    expect(body.suggestions).toHaveLength(1);
    expect(body.suggestions[0].transaction_id).toBe(TX_UUID);
    expect(body.suggestions[0].position).toBe("muellabfuhr");
    expect(body.suggestions[0].confidence).toBe("high");
  });

  it("→ already_linked-Transaktion wird übersprungen", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        selectQueueByTable: {
          nka_perioden: [
            {
              data: {
                id: PERIOD_UUID,
                property_id: PROP_UUID,
                period_start: "2024-01-01",
                period_end: "2024-12-31",
              },
              error: null,
            },
          ],
          properties: [{ data: { id: PROP_UUID }, error: null }],
          transactions: [
            {
              data: [
                {
                  id: TX_UUID,
                  date: "2024-03-15",
                  amount: -85,
                  category: "Müllabfuhr",
                  counterpart: null,
                  description: null,
                },
              ],
              error: null,
            },
          ],
          nka_kostenpositionen: [
            { data: [{ transaction_id: TX_UUID }], error: null },
          ],
        },
      }).client,
    );
    const { GET } = await import("@/app/api/nka/periods/[id]/suggest/route");
    const res = await GET(new Request("http://x"), baseCtx);
    const body = await res.json();
    expect(body.suggestions).toEqual([]);
    expect(body.skipped_already_linked).toEqual([TX_UUID]);
  });
});

describe("POST /api/nka/periods/[id]/cost-items/bulk-from-suggestions", () => {
  it("→ 400 bei leerer accepted-Liste", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }).client);
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/bulk-from-suggestions/route"
    );
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ accepted: [] }),
    });
    const res = await POST(req, baseCtx);
    expect(res.status).toBe(400);
  });

  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/bulk-from-suggestions/route"
    );
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        accepted: [{ transaction_id: TX_UUID, position: "muellabfuhr" }],
      }),
    });
    const res = await POST(req, baseCtx);
    expect(res.status).toBe(401);
  });

  it("→ 404 wenn Periode nicht zum User gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        selectQueueByTable: {
          nka_perioden: [
            { data: { id: PERIOD_UUID, property_id: PROP_UUID }, error: null },
          ],
          properties: [{ data: null, error: null }],
        },
      }).client,
    );
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/bulk-from-suggestions/route"
    );
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        accepted: [{ transaction_id: TX_UUID, position: "muellabfuhr" }],
      }),
    });
    const res = await POST(req, baseCtx);
    expect(res.status).toBe(404);
  });

  it("→ 201 erzeugt Positionen mit Defaults (umlagefaehig_pct=100, verteilungsschluessel=sqm)", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [
          { data: { id: PERIOD_UUID, property_id: PROP_UUID }, error: null },
        ],
        properties: [{ data: { id: PROP_UUID }, error: null }],
        transactions: [
          {
            data: [
              { id: TX_UUID, amount: -85, property_id: PROP_UUID },
            ],
            error: null,
          },
        ],
      },
      insertQueueByTable: {
        nka_kostenpositionen: [
          {
            data: [
              {
                id: "new-1",
                period_id: PERIOD_UUID,
                position: "muellabfuhr",
                brutto_cents: 8500,
              },
            ],
            error: null,
          },
        ],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/bulk-from-suggestions/route"
    );
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        accepted: [{ transaction_id: TX_UUID, position: "muellabfuhr" }],
      }),
    });
    const res = await POST(req, baseCtx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.created).toBe(1);
    // Defaults im Insert prüfen
    const insert = stub.recordedInserts.find(
      (r) => r.table === "nka_kostenpositionen",
    );
    expect(insert).toBeTruthy();
    const payload = insert!.payload as Array<Record<string, unknown>>;
    expect(payload[0].umlagefaehig_pct).toBe(100);
    expect(payload[0].verteilungsschluessel).toBe("sqm");
    expect(payload[0].brutto_cents).toBe(8500);
    expect(payload[0].transaction_id).toBe(TX_UUID);
  });

  it("→ Heizung erhält automatisch heizkosten_verbrauchsanteil_pct=70", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [
          { data: { id: PERIOD_UUID, property_id: PROP_UUID }, error: null },
        ],
        properties: [{ data: { id: PROP_UUID }, error: null }],
        transactions: [
          { data: [{ id: TX_UUID, amount: -1200, property_id: PROP_UUID }], error: null },
        ],
      },
      insertQueueByTable: {
        nka_kostenpositionen: [{ data: [{ id: "x" }], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/bulk-from-suggestions/route"
    );
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        accepted: [{ transaction_id: TX_UUID, position: "heizung" }],
      }),
    });
    const res = await POST(req, baseCtx);
    expect(res.status).toBe(201);
    const insert = stub.recordedInserts.find(
      (r) => r.table === "nka_kostenpositionen",
    );
    const payload = insert!.payload as Array<Record<string, unknown>>;
    expect(payload[0].heizkosten_verbrauchsanteil_pct).toBe(70);
  });

  it("→ User-Override für umlagefaehig_pct/verteilungsschluessel wird übernommen", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [
          { data: { id: PERIOD_UUID, property_id: PROP_UUID }, error: null },
        ],
        properties: [{ data: { id: PROP_UUID }, error: null }],
        transactions: [
          { data: [{ id: TX_UUID, amount: -85, property_id: PROP_UUID }], error: null },
        ],
      },
      insertQueueByTable: {
        nka_kostenpositionen: [{ data: [{ id: "x" }], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/bulk-from-suggestions/route"
    );
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        accepted: [
          {
            transaction_id: TX_UUID,
            position: "muellabfuhr",
            umlagefaehig_pct: 50,
            verteilungsschluessel: "units",
          },
        ],
      }),
    });
    const res = await POST(req, baseCtx);
    expect(res.status).toBe(201);
    const insert = stub.recordedInserts.find(
      (r) => r.table === "nka_kostenpositionen",
    );
    const payload = insert!.payload as Array<Record<string, unknown>>;
    expect(payload[0].umlagefaehig_pct).toBe(50);
    expect(payload[0].verteilungsschluessel).toBe("units");
  });

  it("→ 400 bei tx, die zu fremder Property gehört", async () => {
    const FOREIGN_PROP = "55555555-5555-4555-8555-555555555555";
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        selectQueueByTable: {
          nka_perioden: [
            { data: { id: PERIOD_UUID, property_id: PROP_UUID }, error: null },
          ],
          properties: [{ data: { id: PROP_UUID }, error: null }],
          transactions: [
            {
              data: [
                { id: TX_UUID, amount: -85, property_id: FOREIGN_PROP },
              ],
              error: null,
            },
          ],
        },
      }).client,
    );
    const { POST } = await import(
      "@/app/api/nka/periods/[id]/cost-items/bulk-from-suggestions/route"
    );
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({
        accepted: [{ transaction_id: TX_UUID, position: "muellabfuhr" }],
      }),
    });
    const res = await POST(req, baseCtx);
    expect(res.status).toBe(400);
  });
});
