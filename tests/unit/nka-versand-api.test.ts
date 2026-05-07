/**
 * Unit-Tests für die NKA-Versand-API + Resend-Webhook.
 *
 * Strategie:
 *   - Resend-SDK via vi.mock('resend') gemockt → kein echter Network-Call.
 *   - Supabase via @supabase/ssr-Stub gemockt (analog nka-api.test.ts).
 *   - Webhook-Signatur-Validation mit echtem HMAC-SHA256 getestet.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "svix";

const PROP_UUID = "11111111-1111-4111-8111-111111111111";
const PERIOD_UUID = "22222222-2222-4222-8222-222222222222";
const TENANT_UUID = "44444444-4444-4444-8444-444444444444";
const TENANT2_UUID = "55555555-5555-4555-8555-555555555555";
const UNIT_UUID = "66666666-6666-4666-8666-666666666666";
const VERSAND_UUID = "77777777-7777-4777-8777-777777777777";

const ORIG_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ORIG_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ORIG_RESEND_KEY = process.env.RESEND_API_KEY;
const ORIG_RESEND_DOMAIN = process.env.RESEND_FROM_DOMAIN;
const ORIG_RESEND_HOOK_SECRET = process.env.RESEND_WEBHOOK_SECRET;

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "test-anon";
  process.env.RESEND_API_KEY = "test-resend-key";
  process.env.RESEND_FROM_DOMAIN = "example.test";
  // svix-Format: whsec_<base64>. Hier base64("test-secret") = dGVzdC1zZWNyZXQ=
  process.env.RESEND_WEBHOOK_SECRET = "whsec_dGVzdC1zZWNyZXQ=";
  vi.resetModules();
  vi.clearAllMocks();
});

afterEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = ORIG_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ORIG_KEY;
  process.env.RESEND_API_KEY = ORIG_RESEND_KEY;
  process.env.RESEND_FROM_DOMAIN = ORIG_RESEND_DOMAIN;
  process.env.RESEND_WEBHOOK_SECRET = ORIG_RESEND_HOOK_SECRET;
  vi.unstubAllEnvs();
  vi.doUnmock("next/headers");
  vi.doUnmock("@supabase/ssr");
  vi.doUnmock("resend");
});

// ─── Supabase-Stub ──────────────────────────────────────────────────────────

type StubResponse = { data: unknown; error: unknown };

type SupabaseStubOpts = {
  user: { id: string } | null;
  // Sequenz-Antworten für maybeSingle()/single()/await-then() pro from(...).select()
  selectQueueByTable?: Record<string, StubResponse[]>;
  insertQueueByTable?: Record<string, StubResponse[]>;
  updateQueueByTable?: Record<string, StubResponse[]>;
  upsertQueueByTable?: Record<string, StubResponse[]>;
};

type SupabaseStubResult = {
  client: unknown;
  // Aufgenommene Inserts/Updates/Upserts mit Payload (für Assertions).
  recordedUpdates: Array<{ table: string; payload: unknown }>;
  recordedUpserts: Array<{ table: string; payload: unknown }>;
  recordedInserts: Array<{ table: string; payload: unknown }>;
};

function makeSupabaseStub(opts: SupabaseStubOpts): SupabaseStubResult {
  const recordedUpdates: SupabaseStubResult["recordedUpdates"] = [];
  const recordedUpserts: SupabaseStubResult["recordedUpserts"] = [];
  const recordedInserts: SupabaseStubResult["recordedInserts"] = [];

  function makeBuilder(
    queue: StubResponse[] | undefined,
    onAwait?: (resp: StubResponse) => void,
  ) {
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
      single: () => {
        const r = next();
        if (onAwait) onAwait(r);
        return Promise.resolve(r);
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (onfulfilled: any) => {
        const r = next();
        if (onAwait) onAwait(r);
        return Promise.resolve(r).then(onfulfilled);
      },
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
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                (queue && queue.shift()) ?? { data: null, error: null },
              ),
          }),
        };
      },
      upsert: (payload: unknown) => {
        recordedUpserts.push({ table, payload });
        const queue = opts.upsertQueueByTable?.[table];
        return {
          select: () => ({
            single: () =>
              Promise.resolve(
                (queue && queue.shift()) ?? { data: null, error: null },
              ),
          }),
        };
      },
      update: (payload: unknown) => {
        recordedUpdates.push({ table, payload });
        const queue = opts.updateQueueByTable?.[table];
        return {
          eq: () => ({
            // Update-Queries werden hier ohne select() aufgerufen → resolve direkt.
            then: (onfulfilled: (r: StubResponse) => unknown) =>
              Promise.resolve(
                (queue && queue.shift()) ?? { data: null, error: null },
              ).then(onfulfilled),
            select: () => ({
              single: () =>
                Promise.resolve(
                  (queue && queue.shift()) ?? { data: null, error: null },
                ),
            }),
          }),
        };
      },
    }),
  };
  return { client, recordedUpdates, recordedUpserts, recordedInserts };
}

function mockNextHeadersAndSsr(client: unknown) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [] }),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => client,
  }));
}

function mockResend(sendImpl?: (args: unknown) => Promise<unknown>) {
  const sendMock =
    sendImpl ??
    (async () => ({
      data: { id: "msg_abc123" },
      error: null,
    }));
  vi.doMock("resend", () => ({
    Resend: class {
      emails = { send: sendMock };
    },
  }));
  return sendMock;
}

function makePeriodCtx() {
  return { params: Promise.resolve({ id: PERIOD_UUID }) };
}

// ─── POST /api/nka/periods/[id]/versand ─────────────────────────────────────

describe("POST /api/nka/periods/[id]/versand", () => {
  const baseTenant = {
    id: TENANT_UUID,
    unit_id: UNIT_UUID,
    first_name: "Anna",
    last_name: "Müller",
    email: "anna@example.com",
  };
  const baseUnit = { id: UNIT_UUID, label: "EG links" };
  const baseAnteil = {
    tenant_id: TENANT_UUID,
    total_share_cents: 120000,
    total_paid_advance_cents: 100000,
    balance_cents: -20000,
    active_days: 366,
    breakdown: [],
  };
  const baseProperty = {
    id: PROP_UUID,
    name: "Hinterzartenstraße 8 GbR",
    address: "Hinterzartenstraße 8, 79856 Hinterzarten",
  };
  const basePeriod = {
    id: PERIOD_UUID,
    property_id: PROP_UUID,
    period_start: "2024-01-01",
    period_end: "2024-12-31",
  };

  it("→ 400 bei ungültiger Period-UUID", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }).client);
    mockResend();
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x/api/nka/periods/abc/versand", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID] }),
    });
    const res = await POST(req, { params: Promise.resolve({ id: "abc" }) });
    expect(res.status).toBe(400);
  });

  it("→ 400 bei ungültigem JSON", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }).client);
    mockResend();
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x/api/nka/periods/x/versand", {
      method: "POST",
      body: "garbage",
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(400);
  });

  it("→ 400 wenn tenant_ids fehlt", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }).client);
    mockResend();
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x/api/nka/periods/x/versand", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(400);
  });

  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    mockResend();
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID] }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(401);
  });

  it("→ 404 wenn Periode nicht existiert", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        selectQueueByTable: {
          nka_perioden: [{ data: null, error: null }],
        },
      }).client,
    );
    mockResend();
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID] }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(404);
  });

  it("→ 404 wenn Property nicht zum User gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        selectQueueByTable: {
          nka_perioden: [{ data: basePeriod, error: null }],
          properties: [{ data: null, error: null }],
        },
      }).client,
    );
    mockResend();
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID] }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(404);
  });

  it("→ dry_run liefert Vorschau ohne Resend-Call und ohne DB-Insert", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [{ data: basePeriod, error: null }],
        properties: [{ data: baseProperty, error: null }],
        tenants: [{ data: [baseTenant], error: null }],
        units: [{ data: [baseUnit], error: null }],
        nka_mieteranteile: [{ data: [baseAnteil], error: null }],
        nka_versand: [{ data: [], error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const sendMock = vi.fn();
    mockResend(sendMock);
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID], dry_run: true }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].status).toBe("preview");
    expect(body.results[0].preview.recipient_email).toBe("anna@example.com");
    expect(body.results[0].preview.subject).toContain("Nebenkostenabrechnung");
    expect(sendMock).not.toHaveBeenCalled();
    expect(stub.recordedUpserts).toHaveLength(0);
  });

  it("→ erfolgreicher Versand: status 'sent' und Resend wird aufgerufen", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [{ data: basePeriod, error: null }],
        properties: [{ data: baseProperty, error: null }],
        tenants: [{ data: [baseTenant], error: null }],
        units: [{ data: [baseUnit], error: null }],
        nka_mieteranteile: [{ data: [baseAnteil], error: null }],
        nka_versand: [{ data: [], error: null }],
      },
      upsertQueueByTable: {
        nka_versand: [{ data: { id: VERSAND_UUID }, error: null }],
      },
      updateQueueByTable: {
        nka_versand: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const sendMock = vi.fn(async () => ({
      data: { id: "msg_abc123" },
      error: null,
    }));
    mockResend(sendMock);
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID] }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe("sent");
    expect(body.results[0].message_id).toBe("msg_abc123");
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(stub.recordedUpserts.length).toBe(1);
    // Status-Update: queued → sent
    const sentUpdate = stub.recordedUpdates.find(
      (u) =>
        typeof u.payload === "object" &&
        u.payload !== null &&
        (u.payload as Record<string, unknown>).status === "sent",
    );
    expect(sentUpdate).toBeTruthy();
  });

  it("→ Idempotenz: bereits gesendet → 409 ohne X-Force-Resend", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [{ data: basePeriod, error: null }],
        properties: [{ data: baseProperty, error: null }],
        tenants: [{ data: [baseTenant], error: null }],
        units: [{ data: [baseUnit], error: null }],
        nka_mieteranteile: [{ data: [baseAnteil], error: null }],
        nka_versand: [
          {
            data: [
              {
                id: VERSAND_UUID,
                tenant_id: TENANT_UUID,
                status: "sent",
                resend_message_id: "msg_old",
              },
            ],
            error: null,
          },
        ],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const sendMock = vi.fn();
    mockResend(sendMock);
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID] }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(409);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("→ Idempotenz-Bypass: X-Force-Resend ruft Resend trotzdem auf", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [{ data: basePeriod, error: null }],
        properties: [{ data: baseProperty, error: null }],
        tenants: [{ data: [baseTenant], error: null }],
        units: [{ data: [baseUnit], error: null }],
        nka_mieteranteile: [{ data: [baseAnteil], error: null }],
        nka_versand: [
          {
            data: [
              {
                id: VERSAND_UUID,
                tenant_id: TENANT_UUID,
                status: "sent",
                resend_message_id: "msg_old",
              },
            ],
            error: null,
          },
        ],
      },
      upsertQueueByTable: {
        nka_versand: [{ data: { id: VERSAND_UUID }, error: null }],
      },
      updateQueueByTable: {
        nka_versand: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const sendMock = vi.fn(async () => ({
      data: { id: "msg_new" },
      error: null,
    }));
    mockResend(sendMock);
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      headers: { "x-force-resend": "true" },
      body: JSON.stringify({ tenant_ids: [TENANT_UUID] }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it("→ Resend-Fehler markiert Versand als 'failed'", async () => {
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [{ data: basePeriod, error: null }],
        properties: [{ data: baseProperty, error: null }],
        tenants: [{ data: [baseTenant], error: null }],
        units: [{ data: [baseUnit], error: null }],
        nka_mieteranteile: [{ data: [baseAnteil], error: null }],
        nka_versand: [{ data: [], error: null }],
      },
      upsertQueueByTable: {
        nka_versand: [{ data: { id: VERSAND_UUID }, error: null }],
      },
      updateQueueByTable: {
        nka_versand: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const sendMock = vi.fn(async () => ({
      data: null,
      error: { message: "Domain not verified" },
    }));
    mockResend(sendMock);
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID] }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0].status).toBe("failed");
    expect(body.results[0].error).toContain("Domain not verified");
    const failedUpdate = stub.recordedUpdates.find(
      (u) =>
        typeof u.payload === "object" &&
        u.payload !== null &&
        (u.payload as Record<string, unknown>).status === "failed",
    );
    expect(failedUpdate).toBeTruthy();
  });

  it("→ Fehler 'Mieter ohne Email' wird korrekt gemeldet, anderer Mieter wird trotzdem versendet", async () => {
    const tenantNoEmail = { ...baseTenant, id: TENANT2_UUID, email: null };
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      selectQueueByTable: {
        nka_perioden: [{ data: basePeriod, error: null }],
        properties: [{ data: baseProperty, error: null }],
        tenants: [{ data: [baseTenant, tenantNoEmail], error: null }],
        units: [{ data: [baseUnit], error: null }],
        nka_mieteranteile: [{ data: [baseAnteil], error: null }],
        nka_versand: [{ data: [], error: null }],
      },
      upsertQueueByTable: {
        nka_versand: [{ data: { id: VERSAND_UUID }, error: null }],
      },
      updateQueueByTable: {
        nka_versand: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    mockResend();
    const { POST } = await import("@/app/api/nka/periods/[id]/versand/route");
    const req = new Request("http://x", {
      method: "POST",
      body: JSON.stringify({ tenant_ids: [TENANT_UUID, TENANT2_UUID] }),
    });
    const res = await POST(req, makePeriodCtx());
    expect(res.status).toBe(200);
    const body = await res.json();
    const r1 = body.results.find((r: { tenant_id: string }) => r.tenant_id === TENANT_UUID);
    const r2 = body.results.find((r: { tenant_id: string }) => r.tenant_id === TENANT2_UUID);
    expect(r1.status).toBe("sent");
    expect(r2.status).toBe("failed");
    expect(r2.error).toMatch(/E-Mail/);
  });
});

// ─── GET /api/nka/periods/[id]/versand ──────────────────────────────────────

describe("GET /api/nka/periods/[id]/versand", () => {
  it("→ 401 ohne User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    mockResend();
    const { GET } = await import("@/app/api/nka/periods/[id]/versand/route");
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: PERIOD_UUID }),
    });
    expect(res.status).toBe(401);
  });

  it("→ 200 liefert Versand-Records der Periode", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        selectQueueByTable: {
          nka_perioden: [
            { data: { id: PERIOD_UUID, property_id: PROP_UUID }, error: null },
          ],
          properties: [{ data: { id: PROP_UUID }, error: null }],
          nka_versand: [
            {
              data: [
                {
                  id: VERSAND_UUID,
                  status: "sent",
                  tenant_id: TENANT_UUID,
                  recipient_email: "a@x",
                },
              ],
              error: null,
            },
          ],
        },
      }).client,
    );
    mockResend();
    const { GET } = await import("@/app/api/nka/periods/[id]/versand/route");
    const res = await GET(new Request("http://x"), {
      params: Promise.resolve({ id: PERIOD_UUID }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.versand).toHaveLength(1);
    expect(body.versand[0].id).toBe(VERSAND_UUID);
  });
});

// ─── POST /api/webhooks/resend ──────────────────────────────────────────────

function signedHeaders(rawBody: string, secret: string): HeadersInit {
  // Svix-Format: drei Header svix-id / svix-timestamp / svix-signature.
  // Webhook.sign() erzeugt einen gültigen Signatur-Header für gegebene id+timestamp+payload.
  const id = "msg_test_" + Math.random().toString(36).slice(2);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const wh = new Webhook(secret);
  const signature = wh.sign(id, new Date(Number(timestamp) * 1000), rawBody);
  return {
    "Content-Type": "application/json",
    "svix-id": id,
    "svix-timestamp": timestamp,
    "svix-signature": signature,
  };
}

describe("POST /api/webhooks/resend", () => {
  it("→ 401 bei ungültiger Signatur", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "msg_abc" },
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: {
        "svix-id": "msg_bad",
        "svix-timestamp": Math.floor(Date.now() / 1000).toString(),
        "svix-signature": "v1,deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("→ 200 bei valider Signatur und delivered-Event aktualisiert nka_versand", async () => {
    const stub = makeSupabaseStub({
      user: null,
      updateQueueByTable: {
        nka_versand: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "msg_abc" },
    });
    const headers = signedHeaders(body, "whsec_dGVzdC1zZWNyZXQ=");
    const req = new Request("http://x", {
      method: "POST",
      headers,
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const update = stub.recordedUpdates.find((u) => u.table === "nka_versand");
    expect(update).toBeTruthy();
    const payload = update!.payload as Record<string, unknown>;
    expect(payload.status).toBe("delivered");
    expect(payload.delivered_at).toBeDefined();
  });

  it("→ 200 bei bounced-Event mit gültiger Signatur", async () => {
    const stub = makeSupabaseStub({
      user: null,
      updateQueueByTable: {
        nka_versand: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const body = JSON.stringify({
      type: "email.bounced",
      data: { email_id: "msg_abc" },
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: signedHeaders(body, "whsec_dGVzdC1zZWNyZXQ="),
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const update = stub.recordedUpdates.find((u) => u.table === "nka_versand");
    const payload = update!.payload as Record<string, unknown>;
    expect(payload.status).toBe("bounced");
    expect(payload.bounced_at).toBeDefined();
    expect(payload.status_detail).toBe("email.bounced");
  });

  it("→ 401 wenn RESEND_WEBHOOK_SECRET nicht gesetzt ist (fail closed)", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "msg_abc" },
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: {
        "svix-id": "msg_no_secret",
        "svix-timestamp": Math.floor(Date.now() / 1000).toString(),
        "svix-signature": "v1,anything",
      },
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("→ 400 bei ungültigem Event-Typ", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }).client);
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const body = JSON.stringify({
      type: "email.something_else",
      data: { email_id: "msg_abc" },
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: signedHeaders(body, "whsec_dGVzdC1zZWNyZXQ="),
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("→ 200 idempotent auch wenn keine Versand-Zeile gefunden wird", async () => {
    const stub = makeSupabaseStub({
      user: null,
      updateQueueByTable: {
        nka_versand: [{ data: null, error: null }],
      },
    });
    mockNextHeadersAndSsr(stub.client);
    const { POST } = await import("@/app/api/webhooks/resend/route");
    const body = JSON.stringify({
      type: "email.delivered",
      data: { email_id: "msg_unknown" },
    });
    const req = new Request("http://x", {
      method: "POST",
      headers: signedHeaders(body, "whsec_dGVzdC1zZWNyZXQ="),
      body,
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
  });
});
