/**
 * Unit-Tests für die Sonder-WK-API-Handler.
 *
 * Strategie:
 * - Schema-Validation direkt gegen Zod-Schemas testen.
 * - Vorzeichen-Normalisierungs-Logik isoliert testen (kein DB-Stub nötig).
 * - Auth/Ownership-Pfade über next/headers + @supabase/ssr-Mocks.
 *
 * Hinweis: Wir mocken "next/headers" und "@supabase/ssr", damit der Handler
 * im Node-Test ohne echte Cookies/Supabase läuft. Die Tests lesen ausschließlich
 * Status-Codes & JSON-Body — keine echte Datenbank.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  sonderWkCreateRequestSchema,
  sonderWkUpdateRequestSchema,
} from "@/lib/tax/requestSchemas";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const PARTNER_UUID = "22222222-2222-4222-8222-222222222222";

// ─── Helpers, um die globalen ENV-Vars zu setzen ─────────────────────────────
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

// ─── Schema-Tests ────────────────────────────────────────────────────────────
describe("sonderWkCreateRequestSchema", () => {
  const validBody = {
    property_id: VALID_UUID,
    gbr_partner_id: PARTNER_UUID,
    tax_year: 2024,
    label: "Eigenfinanzierte Schuldzinsen",
    amount: 1500,
    classification: "special_expense_interest" as const,
    note: null,
  };

  it("Akzeptiert vollständigen, gültigen Body", () => {
    expect(sonderWkCreateRequestSchema.safeParse(validBody).success).toBe(true);
  });

  it("Lehnt ungültige property_id ab", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, property_id: "abc" }).success,
    ).toBe(false);
  });

  it("Lehnt ungültige gbr_partner_id ab", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, gbr_partner_id: "abc" }).success,
    ).toBe(false);
  });

  it("Lehnt tax_year < 2010 ab", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, tax_year: 1999 }).success,
    ).toBe(false);
  });

  it("Lehnt tax_year > 2030 ab", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, tax_year: 2099 }).success,
    ).toBe(false);
  });

  it("Lehnt leeres Label ab", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, label: "" }).success,
    ).toBe(false);
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, label: "   " }).success,
    ).toBe(false);
  });

  it("Lehnt Label > 200 Zeichen ab", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, label: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("Lehnt unbekannte classification ab", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, classification: "foo" }).success,
    ).toBe(false);
  });

  it("Akzeptiert alle drei classification-Werte", () => {
    for (const c of ["special_income", "special_expense_interest", "special_expense_other"] as const) {
      expect(
        sonderWkCreateRequestSchema.safeParse({ ...validBody, classification: c }).success,
      ).toBe(true);
    }
  });

  it("Lehnt nicht-numerischen amount ab", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, amount: "100" }).success,
    ).toBe(false);
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, amount: NaN }).success,
    ).toBe(false);
  });

  it("Akzeptiert negativen amount (für Sonder-WK)", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, amount: -500.5 }).success,
    ).toBe(true);
  });

  it("note darf null oder undefined sein", () => {
    expect(
      sonderWkCreateRequestSchema.safeParse({ ...validBody, note: null }).success,
    ).toBe(true);
    const { note: _omit, ...withoutNote } = validBody;
    void _omit;
    expect(sonderWkCreateRequestSchema.safeParse(withoutNote).success).toBe(true);
  });
});

describe("sonderWkUpdateRequestSchema", () => {
  it("Akzeptiert leeren Body (keine Felder gesetzt)", () => {
    // Schema lässt leeren Body zu — der Handler muss separat prüfen, dass
    // mindestens ein Feld gesetzt ist.
    expect(sonderWkUpdateRequestSchema.safeParse({}).success).toBe(true);
  });

  it("Akzeptiert partial-Updates", () => {
    expect(sonderWkUpdateRequestSchema.safeParse({ label: "Neu" }).success).toBe(true);
    expect(sonderWkUpdateRequestSchema.safeParse({ amount: 99 }).success).toBe(true);
    expect(
      sonderWkUpdateRequestSchema.safeParse({ classification: "special_income" }).success,
    ).toBe(true);
  });

  it("Lehnt unbekannte classification ab", () => {
    expect(
      sonderWkUpdateRequestSchema.safeParse({ classification: "foo" }).success,
    ).toBe(false);
  });

  it("Lehnt leeres Label ab", () => {
    expect(sonderWkUpdateRequestSchema.safeParse({ label: "" }).success).toBe(false);
  });
});

// ─── Handler-Mocks ───────────────────────────────────────────────────────────
//
// Wir bauen einen sehr leichten Supabase-Stub, der die Methoden des Handlers
// in einer Chain-API nachbildet. Jeder Test definiert die "Antworten" pro
// Tabelle/Operation als Array. So müssen wir kein echtes Supabase mocken.

type StubResponse = { data: unknown; error: unknown };

function makeSupabaseStub(opts: {
  user: { id: string } | null;
  responses?: StubResponse[];
  insertResponses?: StubResponse[];
  updateResponses?: StubResponse[];
  deleteResponses?: StubResponse[];
}) {
  const responses = [...(opts.responses ?? [])];
  const insertResponses = [...(opts.insertResponses ?? [])];
  const updateResponses = [...(opts.updateResponses ?? [])];
  const deleteResponses = [...(opts.deleteResponses ?? [])];

  // Builder-Stub: jede Filter-Methode gibt sich selbst zurück; .single()
  // / .maybeSingle() / .order() / Awaiting (then) liefern die nächste
  // Response.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeBuilder(next: () => StubResponse): any {
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: () => builder,
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      insert: (_payload?: unknown) => ({
        select: () => ({
          single: () =>
            Promise.resolve(insertResponses.shift() ?? { data: null, error: null }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve(updateResponses.shift() ?? { data: null, error: null }),
          }),
        }),
      }),
      delete: () => ({
        eq: () => Promise.resolve(deleteResponses.shift() ?? { data: null, error: null }),
      }),
    }),
  };

  return stub;
}

function mockNextHeadersAndSsr(supabaseStub: ReturnType<typeof makeSupabaseStub>) {
  vi.doMock("next/headers", () => ({
    cookies: async () => ({ getAll: () => [] }),
  }));
  vi.doMock("@supabase/ssr", () => ({
    createServerClient: () => supabaseStub,
  }));
}

describe("POST /api/tax/sonder-wk (Handler-Logik)", () => {
  it("→ 400 bei ungültigem JSON", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { POST } = await import("@/app/api/tax/sonder-wk/route");
    const req = new Request("http://x/api/tax/sonder-wk", {
      method: "POST",
      body: "not-json",
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("→ 400 bei Schema-Fehler", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { POST } = await import("@/app/api/tax/sonder-wk/route");
    const req = new Request("http://x/api/tax/sonder-wk", {
      method: "POST",
      body: JSON.stringify({ property_id: "no-uuid" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("→ 401 ohne eingeloggten User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }));
    const { POST } = await import("@/app/api/tax/sonder-wk/route");
    const req = new Request("http://x/api/tax/sonder-wk", {
      method: "POST",
      body: JSON.stringify({
        property_id: VALID_UUID,
        gbr_partner_id: PARTNER_UUID,
        tax_year: 2024,
        label: "Test",
        amount: 100,
        classification: "special_expense_other",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("→ 404 wenn Property nicht zum User gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        // Erste Property-Lookup-Antwort: nichts gefunden.
        responses: [{ data: null, error: null }],
      }),
    );
    const { POST } = await import("@/app/api/tax/sonder-wk/route");
    const req = new Request("http://x/api/tax/sonder-wk", {
      method: "POST",
      body: JSON.stringify({
        property_id: VALID_UUID,
        gbr_partner_id: PARTNER_UUID,
        tax_year: 2024,
        label: "Test",
        amount: 100,
        classification: "special_expense_other",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(404);
  });

  it("→ 400 wenn Partner zu anderer Property gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [
          { data: { id: VALID_UUID }, error: null }, // properties: ok
          {
            // gbr_partner: gehört zu anderer property
            data: {
              id: PARTNER_UUID,
              gbr_settings_id: "g1",
              gbr_settings: { property_id: "different-property" },
            },
            error: null,
          },
        ],
      }),
    );
    const { POST } = await import("@/app/api/tax/sonder-wk/route");
    const req = new Request("http://x/api/tax/sonder-wk", {
      method: "POST",
      body: JSON.stringify({
        property_id: VALID_UUID,
        gbr_partner_id: PARTNER_UUID,
        tax_year: 2024,
        label: "Test",
        amount: 100,
        classification: "special_expense_other",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("→ 201 bei erfolgreicher Erstellung; Vorzeichen wird normalisiert (special_expense → negativ)", async () => {
    const inserted: { amount?: number } = {};
    const stub = makeSupabaseStub({
      user: { id: "u1" },
      responses: [
        { data: { id: VALID_UUID }, error: null }, // property ownership
        {
          data: {
            id: PARTNER_UUID,
            gbr_settings_id: "g1",
            gbr_settings: { property_id: VALID_UUID },
          },
          error: null,
        },
      ],
      insertResponses: [
        {
          data: {
            id: "abc",
            property_id: VALID_UUID,
            gbr_partner_id: PARTNER_UUID,
            tax_year: 2024,
            label: "Test",
            amount: -1500,
            classification: "special_expense_interest",
            note: null,
          },
          error: null,
        },
      ],
    });
    // Spy: capture insert payload by overwriting the from(...).insert chain.
    const origFrom = stub.from;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    stub.from = (table: string): any => {
      const built = origFrom(table);
      const origInsert = built.insert;
      built.insert = (payload: { amount?: number }) => {
        inserted.amount = payload?.amount;
        return origInsert();
      };
      return built;
    };

    mockNextHeadersAndSsr(stub);
    const { POST } = await import("@/app/api/tax/sonder-wk/route");
    const req = new Request("http://x/api/tax/sonder-wk", {
      method: "POST",
      body: JSON.stringify({
        property_id: VALID_UUID,
        gbr_partner_id: PARTNER_UUID,
        tax_year: 2024,
        label: "Test",
        // User schickt positiv — Server soll auf -1500 normalisieren.
        amount: 1500,
        classification: "special_expense_interest",
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(inserted.amount).toBe(-1500);
  });
});

describe("GET /api/tax/sonder-wk (Handler-Logik)", () => {
  it("→ 400 bei fehlender property_id", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { GET } = await import("@/app/api/tax/sonder-wk/route");
    const res = await GET(new Request("http://x/api/tax/sonder-wk?tax_year=2024"));
    expect(res.status).toBe(400);
  });

  it("→ 400 bei ungültigem tax_year", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { GET } = await import("@/app/api/tax/sonder-wk/route");
    const res = await GET(
      new Request(`http://x/api/tax/sonder-wk?property_id=${VALID_UUID}&tax_year=1999`),
    );
    expect(res.status).toBe(400);
  });

  it("→ 401 ohne eingeloggten User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }));
    const { GET } = await import("@/app/api/tax/sonder-wk/route");
    const res = await GET(
      new Request(`http://x/api/tax/sonder-wk?property_id=${VALID_UUID}&tax_year=2024`),
    );
    expect(res.status).toBe(401);
  });

  it("→ 404 wenn Property nicht dem User gehört", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [{ data: null, error: null }],
      }),
    );
    const { GET } = await import("@/app/api/tax/sonder-wk/route");
    const res = await GET(
      new Request(`http://x/api/tax/sonder-wk?property_id=${VALID_UUID}&tax_year=2024`),
    );
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/tax/sonder-wk/[id] (Handler-Logik)", () => {
  it("→ 400 bei nicht-UUID id", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: { id: "u1" } }));
    const { DELETE } = await import("@/app/api/tax/sonder-wk/[id]/route");
    const res = await DELETE(new Request("http://x/api/tax/sonder-wk/abc"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });

  it("→ 401 ohne eingeloggten User", async () => {
    mockNextHeadersAndSsr(makeSupabaseStub({ user: null }));
    const { DELETE } = await import("@/app/api/tax/sonder-wk/[id]/route");
    const res = await DELETE(new Request("http://x/api/tax/sonder-wk/" + VALID_UUID), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(401);
  });

  it("→ 404 wenn Eintrag nicht existiert", async () => {
    mockNextHeadersAndSsr(
      makeSupabaseStub({
        user: { id: "u1" },
        responses: [{ data: null, error: null }],
      }),
    );
    const { DELETE } = await import("@/app/api/tax/sonder-wk/[id]/route");
    const res = await DELETE(new Request("http://x/api/tax/sonder-wk/" + VALID_UUID), {
      params: Promise.resolve({ id: VALID_UUID }),
    });
    expect(res.status).toBe(404);
  });
});
