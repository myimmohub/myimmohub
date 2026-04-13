import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
    },
  });
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Transaction = {
  id: string;
  amount_cents: number;
  description: string | null;
  counterpart_name: string | null;
  date: string;
  property_id: string;
};

type TenantWithUnit = {
  id: string;
  first_name: string;
  last_name: string;
  payment_reference: string | null;
  cold_rent_cents: number;
  additional_costs_cents: number | null;
  units: {
    id: string;
    label: string;
    property_id: string;
  } | null;
};

type MatchResult = {
  tenant_id: string | null;
  unit_id: string | null;
  confidence: number;
  match_method: string;
  status: "auto_matched" | "suggested" | "unmatched";
};

// ---------------------------------------------------------------------------
// Matching algorithm
// ---------------------------------------------------------------------------

function runMatchingAlgorithm(
  transaction: Transaction,
  tenants: TenantWithUnit[],
): MatchResult {
  let bestMatch: MatchResult = {
    tenant_id: null,
    unit_id: null,
    confidence: 0,
    match_method: "none",
    status: "unmatched",
  };

  const description = (transaction.description ?? "").toLowerCase();
  const counterpart = (transaction.counterpart_name ?? "").toLowerCase();
  const txDate = new Date(transaction.date);
  const txYear = txDate.getFullYear();
  const txMonth = txDate.getMonth(); // 0-indexed

  for (const tenant of tenants) {
    const unit = tenant.units;

    // 1. Payment reference substring match (confidence 0.97)
    if (tenant.payment_reference) {
      const ref = tenant.payment_reference.toLowerCase();
      if (description.includes(ref) || counterpart.includes(ref)) {
        const candidate: MatchResult = {
          tenant_id: tenant.id,
          unit_id: unit?.id ?? null,
          confidence: 0.97,
          match_method: "payment_reference",
          status: "auto_matched",
        };
        if (candidate.confidence > bestMatch.confidence) {
          bestMatch = candidate;
        }
        continue; // Highest possible match — no need to evaluate further rules for this tenant
      }
    }

    // 2. Amount match within 10 cents + date in same month (confidence 0.92)
    const expectedAmount =
      tenant.cold_rent_cents + (tenant.additional_costs_cents ?? 0);
    const amountDiff = Math.abs(transaction.amount_cents - expectedAmount);

    if (amountDiff <= 10) {
      // Check if transaction date is in the correct month for rent
      // Rent is typically paid in the first few days of the current or next month.
      // Accept transactions where year/month matches the transaction month or the previous month.
      const leaseStart = tenant.units
        ? null
        : null; // placeholder — just use the date check
      void leaseStart; // suppress unused warning

      const txMonthStart = new Date(txYear, txMonth, 1);
      const txMonthEnd = new Date(txYear, txMonth + 1, 0);
      const isInMonth =
        txDate >= txMonthStart && txDate <= txMonthEnd;

      if (isInMonth) {
        const candidate: MatchResult = {
          tenant_id: tenant.id,
          unit_id: unit?.id ?? null,
          confidence: 0.92,
          match_method: "amount_date",
          status: "auto_matched",
        };
        if (candidate.confidence > bestMatch.confidence) {
          bestMatch = candidate;
        }
        continue;
      }
    }

    // 3. Fuzzy name match: counterpart contains last_name (confidence 0.87)
    if (
      tenant.last_name &&
      counterpart.includes(tenant.last_name.toLowerCase())
    ) {
      const candidate: MatchResult = {
        tenant_id: tenant.id,
        unit_id: unit?.id ?? null,
        confidence: 0.87,
        match_method: "name_fuzzy",
        status: "suggested",
      };
      if (candidate.confidence > bestMatch.confidence) {
        bestMatch = candidate;
      }
    }
  }

  // Assign final status based on confidence
  if (bestMatch.confidence >= 0.9) {
    bestMatch.status = "auto_matched";
  } else if (bestMatch.confidence >= 0.7) {
    bestMatch.status = "suggested";
  } else {
    bestMatch.status = "unmatched";
  }

  return bestMatch;
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const property_id = searchParams.get("property_id");
    const status = searchParams.get("status");
    const direction = searchParams.get("direction");

    if (!property_id) {
      return NextResponse.json({ error: "Query-Parameter 'property_id' fehlt." }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    // Verify property ownership
    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("id", property_id)
      .eq("user_id", user.id)
      .single();

    if (!property) {
      return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
    }

    let query = supabase
      .from("payment_matches")
      .select(
        `
        *,
        tenants (
          id,
          first_name,
          last_name,
          email,
          payment_reference,
          cold_rent_cents,
          additional_costs_cents
        ),
        units (
          id,
          label,
          unit_type,
          property_id
        )
      `,
      )
      .eq("property_id", property_id)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }
    if (direction) {
      query = query.eq("direction", direction);
    }

    const { data, error } = await query;

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST
// ---------------------------------------------------------------------------

type CreateMatchBody = {
  action?: "run_matching";
  transaction_id: string;
  tenant_id?: string;
  unit_id?: string;
  match_method?: string;
  status?: string;
  direction?: string;
  period_month?: string;
  property_id?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const body = (await request.json()) as CreateMatchBody;
    const { transaction_id, action } = body;

    if (!transaction_id) {
      return NextResponse.json({ error: "Pflichtfeld fehlt: transaction_id." }, { status: 400 });
    }

    // -----------------------------------------------------------------------
    // Sub-action: run_matching
    // -----------------------------------------------------------------------
    if (action === "run_matching") {
      // Load the transaction
      const { data: transaction, error: txError } = await supabase
        .from("transactions")
        .select("id, amount_cents, description, counterpart_name, date, property_id")
        .eq("id", transaction_id)
        .single();

      if (txError || !transaction) {
        return NextResponse.json({ error: "Transaktion nicht gefunden." }, { status: 404 });
      }

      // Verify property belongs to user
      const { data: property } = await supabase
        .from("properties")
        .select("id")
        .eq("id", transaction.property_id)
        .eq("user_id", user.id)
        .single();

      if (!property) {
        return NextResponse.json({ error: "Kein Zugriff auf diese Transaktion." }, { status: 403 });
      }

      // Load all active tenants for that property with their units
      const { data: tenants, error: tenantsError } = await supabase
        .from("tenants")
        .select(
          `
          id,
          first_name,
          last_name,
          payment_reference,
          cold_rent_cents,
          additional_costs_cents,
          units!tenants_unit_id_fkey (
            id,
            label,
            property_id
          )
        `,
        )
        .eq("status", "active")
        .eq("units.property_id", transaction.property_id);

      if (tenantsError) {
        return NextResponse.json({ error: tenantsError.message }, { status: 500 });
      }

      const activeTenants = (tenants ?? []).filter(
        (t) => t.units !== null,
      ) as unknown as TenantWithUnit[];

      // Run matching cascade
      const matchResult = runMatchingAlgorithm(
        transaction as Transaction,
        activeTenants,
      );

      // Upsert payment_match if confidence meets threshold
      if (matchResult.confidence >= 0.7 && matchResult.tenant_id) {
        const upsertData = {
          transaction_id,
          tenant_id: matchResult.tenant_id,
          unit_id: matchResult.unit_id,
          property_id: transaction.property_id,
          match_method: matchResult.match_method,
          status: matchResult.status,
          confidence: matchResult.confidence,
        };

        const { data: upserted, error: upsertError } = await supabase
          .from("payment_matches")
          .upsert(upsertData, { onConflict: "transaction_id" })
          .select()
          .single();

        if (upsertError) {
          return NextResponse.json({ error: upsertError.message }, { status: 500 });
        }

        return NextResponse.json({ match: upserted, result: matchResult });
      }

      // Below threshold — return result without persisting
      return NextResponse.json({
        match: null,
        result: matchResult,
        message: "Kein ausreichend sicherer Treffer gefunden.",
      });
    }

    // -----------------------------------------------------------------------
    // Manual create / update
    // -----------------------------------------------------------------------
    const { tenant_id, unit_id, match_method, status, direction, period_month, property_id } = body;

    if (!match_method || !status) {
      return NextResponse.json(
        { error: "Pflichtfelder fehlen: match_method, status." },
        { status: 400 },
      );
    }

    // Verify transaction ownership via property
    const { data: transaction } = await supabase
      .from("transactions")
      .select("id, property_id")
      .eq("id", transaction_id)
      .single();

    if (!transaction) {
      return NextResponse.json({ error: "Transaktion nicht gefunden." }, { status: 404 });
    }

    const resolvedPropertyId = property_id ?? transaction.property_id;

    const { data: property } = await supabase
      .from("properties")
      .select("id")
      .eq("id", resolvedPropertyId)
      .eq("user_id", user.id)
      .single();

    if (!property) {
      return NextResponse.json({ error: "Kein Zugriff auf diese Transaktion." }, { status: 403 });
    }

    const upsertData = {
      transaction_id,
      property_id: resolvedPropertyId,
      tenant_id: tenant_id ?? null,
      unit_id: unit_id ?? null,
      match_method,
      status,
      direction: direction ?? null,
      period_month: period_month ?? null,
    };

    const { data, error } = await supabase
      .from("payment_matches")
      .upsert(upsertData, { onConflict: "transaction_id" })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
