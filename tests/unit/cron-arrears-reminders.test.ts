/**
 * Unit-Tests für POST /api/cron/rent-arrears-reminders + Webhook-Update für
 * rent_arrears_events.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";

const TENANT_A = "11111111-1111-4111-8111-111111111111";
const TENANT_B = "22222222-2222-4222-8222-222222222222";

const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIG_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ORIG_SECRET = process.env.CRON_SECRET;
const ORIG_RESEND_KEY = process.env.RESEND_API_KEY;
const ORIG_RESEND_DOMAIN = process.env.RESEND_FROM_DOMAIN;
const ORIG_HOOK = process.env.RESEND_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  process.env.CRON_SECRET = "secret-xyz";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_DOMAIN = "example.test";
  process.env.RESEND_WEBHOOK_SECRET = "test-secret";
  vi.resetModules();
  vi.clearAllMocks();
});
afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIG_KEY;
  process.env.CRON_SECRET = ORIG_SECRET;
  process.env.RESEND_API_KEY = ORIG_RESEND_KEY;
  process.env.RESEND_FROM_DOMAIN = ORIG_RESEND_DOMAIN;
  process.env.RESEND_WEBHOOK_SECRET = ORIG_HOOK;
  vi.doUnmock("next/headers");
  vi.doUnmock("@supabase/ssr");
  vi.doUnmock("resend");
});

type StubResponse = { data: unknown; error: unknown };

function makeSupabaseStub(opts: {
  user: { id: string } | null;
  selectQueueByTable?: Record<string, StubResponse[]>;
  insertQueueByTable?: Record<string, StubResponse[]>;
  updateQueueByTable?: Record<string, StubResponse[]>;
}) {
  const recordedInserts: Array<{ table: string; payload: unknown }> = [];
  const recordedUpdates: Array<{ table: string; payload: unknown }> = [];

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
    cookies: async () => ({ getAll: () => [], set: () => {} }),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => client,
  }));
}

function mockResend(sendImpl?: (args: unknown) => Promise<unknown>) {
  const sendMock =
    sendImpl ?? (async () => ({ data: { id: "msg_arrears_1" }, error: null }));
  vi.doMock("resend", () => ({
    Resend: class {
      emails = { send: sendMock };
    },
  }));
  return sendMock;
}

function makeReq(headers: Record<string, string> = {}) {
  return new Request("http://x/api/cron/rent-arrears-reminders", {
    method: "POST",
    headers,
  });
}

const tenantOverdue = (id: string, userId: string) => ({
  id,
  unit_id: "unit-" + id,
  first_name: "Anna",
  last_name: "Müller",
  email: "anna@example.com",
  cold_rent_cents: 80000,
  additional_costs_cents: 12000,
  lease_start: "2024-01-01",
  lease_end: null,
  status: "active",
  units: {
    id: "unit-" + id,
    label: "EG links",
    property_id: "prop-" + id,
    properties: {
      id: "prop-" + id,
      user_id: userId,
      name: "Test-Property",
      address: "Teststr. 1",
    },
  },
});

describe("POST /api/cron/rent-arrears-reminders", () => {
  it("Bearer-Secret falsch → 401", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    mockResend();
    const { POST } = await import("@/app/api/cron/rent-arrears-reminders/route");
    const res = await POST(makeReq({ authorization: "Bearer wrong" }));
    expect(res.status).toBe(401);
  });

  it("Kein Bearer + kein User → 401", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    mockResend();
    const { POST } = await import("@/app/api/cron/rent-arrears-reminders/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it("Bearer korrekt, Mieter überfällig → Resend wird aufgerufen, Event 'sent'", async () => {
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tenantOverdue(TENANT_A, "u1")], error: null }],
        payment_matches: [{ data: [], error: null }],
        rent_arrears_events: [{ data: [], error: null }],
      },
      insertQueueByTable: {
        rent_arrears_events: [
          { data: { id: "ev-1" }, error: null },
        ],
      },
      updateQueueByTable: {
        rent_arrears_events: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const sendMock = vi.fn(async () => ({ data: { id: "msg_arrears_1" }, error: null }));
    mockResend(sendMock);
    const { POST } = await import("@/app/api/cron/rent-arrears-reminders/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events_sent).toBeGreaterThan(0);
    expect(sendMock).toHaveBeenCalled();
    // Mind. ein update mit status=sent
    const sentUpdate = stub.recordedUpdates.find(
      (u) =>
        u.table === "rent_arrears_events" &&
        typeof u.payload === "object" &&
        u.payload !== null &&
        (u.payload as Record<string, unknown>).status === "sent",
    );
    expect(sentUpdate).toBeTruthy();
  });

  it("Idempotenz: existing event mit gleichem level → kein neues Event", async () => {
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tenantOverdue(TENANT_A, "u1")], error: null }],
        payment_matches: [{ data: [], error: null }],
        rent_arrears_events: [
          {
            // level 3 für 2024-01 → höher gleich allem heutigen
            data: [
              { tenant_id: TENANT_A, arrear_month: "2024-01", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-02", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-03", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-04", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-05", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-06", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-07", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-08", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-09", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-10", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-11", level: 3, status: "sent" },
              { tenant_id: TENANT_A, arrear_month: "2024-12", level: 3, status: "sent" },
              ...Array.from({ length: 24 }, (_, i) => ({
                tenant_id: TENANT_A,
                arrear_month: `${2025 + Math.floor(i / 12)}-${String(((i % 12) + 1)).padStart(2, "0")}`,
                level: 3,
                status: "sent",
              })),
            ],
            error: null,
          },
        ],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const sendMock = vi.fn();
    mockResend(sendMock);
    const { POST } = await import("@/app/api/cron/rent-arrears-reminders/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events_created).toBe(0);
    // Resend should not be called for already-emitted level
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("Resend-Fehler → Event als 'failed' markiert", async () => {
    const stub = makeSupabaseStub({
      user: null,
      selectQueueByTable: {
        tenants: [{ data: [tenantOverdue(TENANT_A, "u1")], error: null }],
        payment_matches: [{ data: [], error: null }],
        rent_arrears_events: [{ data: [], error: null }],
      },
      insertQueueByTable: {
        rent_arrears_events: Array.from({ length: 50 }, () => ({
          data: { id: "ev-" + Math.random() },
          error: null,
        })),
      },
      updateQueueByTable: {
        rent_arrears_events: Array.from({ length: 50 }, () => ({ data: null, error: null })),
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const sendMock = vi.fn(async () => ({
      data: null,
      error: { message: "Domain not verified" },
    }));
    mockResend(sendMock);
    const { POST } = await import("@/app/api/cron/rent-arrears-reminders/route");
    const res = await POST(makeReq({ authorization: "Bearer secret-xyz" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events_failed).toBeGreaterThan(0);
    const failedUpdate = stub.recordedUpdates.find(
      (u) =>
        u.table === "rent_arrears_events" &&
        typeof u.payload === "object" &&
        u.payload !== null &&
        (u.payload as Record<string, unknown>).status === "failed",
    );
    expect(failedUpdate).toBeTruthy();
  });

  it("User-Mode: nur eigene Mieter werden bearbeitet", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        tenants: [{ data: [tenantOverdue(TENANT_A, "u1"), tenantOverdue(TENANT_B, "u2")], error: null }],
        payment_matches: [{ data: [], error: null }],
        rent_arrears_events: [{ data: [], error: null }],
      },
      insertQueueByTable: {
        rent_arrears_events: Array.from({ length: 50 }, () => ({
          data: { id: "ev-x" },
          error: null,
        })),
      },
      updateQueueByTable: {
        rent_arrears_events: Array.from({ length: 50 }, () => ({ data: null, error: null })),
      },
    });
    mockNextHeadersAndSsr(stub.client);
    mockResend();
    const { POST } = await import("@/app/api/cron/rent-arrears-reminders/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(200);
    const body = await res.json();
    // Nur Mieter A sollte verarbeitet werden
    expect(body.tenants_evaluated).toBe(1);
  });
});

// ─── Webhook-Update für rent_arrears_events ────────────────────────────────
function signedHeaders(rawBody: string, secret: string): HeadersInit {
  const sig = createHmac("sha256", secret).update(rawBody).digest("hex");
  return {
    "Content-Type": "application/json",
    "Resend-Signature": sig,
  };
}

describe("POST /api/webhooks/resend → Update auf rent_arrears_events", () => {
  it("delivered → updated rent_arrears_events.status='delivered'", async () => {
    const stub = makeSupabaseStub({
      user: null,
      updateQueueByTable: {
        nka_versand: [{ data: null, error: null }],
        rent_arrears_events: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "msg_arrears_1" },
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: signedHeaders(body, "test-secret"),
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const arrearsUpdate = stub.recordedUpdates.find(
      (u) => u.table === "rent_arrears_events",
    );
    expect(arrearsUpdate).toBeTruthy();
    const payload = arrearsUpdate!.payload as Record<string, unknown>;
    expect(payload.status).toBe("delivered");
    expect(payload.delivered_at).toBeDefined();
  });
});
