import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { counterpartMatchesLastName } from "@/lib/banking/nameMatch";

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
// GET ?property_id=X
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const property_id = searchParams.get("property_id");

    if (!property_id) {
      return NextResponse.json({ error: "Query-Parameter 'property_id' fehlt." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
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

    const { data, error } = await supabase
      .from("payment_matches")
      .select(`
        *,
        transactions (
          id,
          amount,
          date,
          counterpart,
          description
        ),
        tenants (
          id,
          first_name,
          last_name,
          cold_rent_cents,
          additional_costs_cents,
          payment_reference
        ),
        units (
          id,
          label,
          unit_type
        )
      `)
      .eq("property_id", property_id)
      .order("matched_at", { ascending: false });

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

type PostBody =
  | { action: "run_matching"; property_id: string }
  | { action: "assign"; transaction_id: string; unit_id: string; tenant_id: string; period_month: string; property_id: string }
  | { action: "update_status"; match_id: string; status: "confirmed" | "rejected" }
  | { action: "delete"; match_id: string };

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });

    const body = (await request.json()) as PostBody;

    // -------------------------------------------------------------------------
    // run_matching: auto-match recent income transactions for a property
    // -------------------------------------------------------------------------
    if (body.action === "run_matching") {
      const { property_id } = body;

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

      // Get active + notice_given tenants with their units
      const { data: tenants, error: tenantsError } = await supabase
        .from("tenants")
        .select(`
          id,
          first_name,
          last_name,
          payment_reference,
          cold_rent_cents,
          additional_costs_cents,
          status,
          units!tenants_unit_id_fkey (
            id,
            label,
            property_id
          )
        `)
        .in("status", ["active", "notice_given"]);

      if (tenantsError) {
        return NextResponse.json({ error: tenantsError.message }, { status: 500 });
      }

      // Filter to only tenants in this property
      type TenantRow = {
        id: string;
        first_name: string;
        last_name: string;
        payment_reference: string | null;
        cold_rent_cents: number;
        additional_costs_cents: number | null;
        status: string;
        units: { id: string; label: string; property_id: string } | null;
      };

      const activeTenants = ((tenants ?? []) as unknown as TenantRow[]).filter(
        (t) => t.units?.property_id === property_id,
      );

      // Get recent income transactions (last 90 days) not yet confirmed/auto_matched
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: transactions, error: txError } = await supabase
        .from("transactions")
        .select("id, amount, date, counterpart, description")
        .eq("property_id", property_id)
        .gt("amount", 0)
        .gte("date", ninetyDaysAgo.toISOString().split("T")[0]);

      if (txError) {
        return NextResponse.json({ error: txError.message }, { status: 500 });
      }

      // Get already confirmed/auto_matched transaction IDs
      const { data: confirmedMatches } = await supabase
        .from("payment_matches")
        .select("transaction_id")
        .eq("property_id", property_id)
        .in("status", ["confirmed", "auto_matched"]);

      const confirmedTxIds = new Set((confirmedMatches ?? []).map((m: { transaction_id: string }) => m.transaction_id));

      const unmatched = (transactions ?? []).filter(
        (tx: { id: string }) => !confirmedTxIds.has(tx.id),
      );

      // Run matching cascade for each unmatched transaction
      type TxRow = { id: string; amount: number; date: string; counterpart: string | null; description: string | null };

      const upserts: Array<{
        transaction_id: string;
        tenant_id: string;
        unit_id: string;
        property_id: string;
        match_method: string;
        match_confidence: number;
        status: string;
        direction: string;
        period_month: string;
      }> = [];

      for (const tx of unmatched as TxRow[]) {
        const description = (tx.description ?? "").toLowerCase();
        const counterpart = (tx.counterpart ?? "").toLowerCase();
        const txDate = new Date(tx.date);
        const txYear = txDate.getFullYear();
        const txMonth = txDate.getMonth() + 1; // 1-indexed
        const periodMonth = `${txYear}-${String(txMonth).padStart(2, "0")}-01`;

        let bestConfidence = 0;
        let bestTenant: TenantRow | null = null;
        let bestMethod = "none";
        let bestStatus = "suggested";

        for (const tenant of activeTenants) {
          // 1. Payment reference match → 0.97
          if (tenant.payment_reference) {
            const ref = tenant.payment_reference.toLowerCase();
            if (description.includes(ref) || counterpart.includes(ref)) {
              if (0.97 > bestConfidence) {
                bestConfidence = 0.97;
                bestTenant = tenant;
                bestMethod = "reference";
                bestStatus = "auto_matched";
              }
              continue;
            }
          }

          // 2. Amount within 5% + date in month → 0.92
          const expectedEur = (tenant.cold_rent_cents + (tenant.additional_costs_cents ?? 0)) / 100;
          const diff = Math.abs(tx.amount - expectedEur);
          const withinFivePercent = expectedEur > 0 && diff / expectedEur <= 0.05;

          if (withinFivePercent) {
            if (0.92 > bestConfidence) {
              bestConfidence = 0.92;
              bestTenant = tenant;
              bestMethod = "amount";
              bestStatus = "auto_matched";
            }
            continue;
          }

          // 3. Last name in counterpart → 0.87 (Word-Boundary, kein Substring!)
          //    Verhindert "Müller"-Mieter matched "Müllabfuhr"-Counterpart
          //    und "Müll"-Mieter matched "Hans Müller"-Counterpart.
          if (tenant.last_name && counterpartMatchesLastName(tx.counterpart, tenant.last_name)) {
            if (0.87 > bestConfidence) {
              bestConfidence = 0.87;
              bestTenant = tenant;
              bestMethod = "sender_name";
              bestStatus = "suggested";
            }
          }
        }

        if (bestTenant && bestConfidence >= 0.7 && bestTenant.units) {
          upserts.push({
            transaction_id: tx.id,
            tenant_id: bestTenant.id,
            unit_id: bestTenant.units.id,
            property_id,
            match_method: bestMethod,
            match_confidence: bestConfidence,
            status: bestStatus,
            direction: "incoming",
            period_month: periodMonth,
          });
        }
      }

      if (upserts.length > 0) {
        // Remove any stale "suggested" matches for these transactions before inserting fresh ones.
        // (No unique constraint on transaction_id yet — avoid duplicates manually.)
        const txIdsToMatch = upserts.map((u) => u.transaction_id);
        await supabase
          .from("payment_matches")
          .delete()
          .in("transaction_id", txIdsToMatch)
          .eq("status", "suggested");

        const { error: insertError } = await supabase
          .from("payment_matches")
          .insert(upserts);

        if (insertError) {
          return NextResponse.json({ error: insertError.message }, { status: 500 });
        }
      }

      return NextResponse.json({ matched: upserts.length, total_checked: unmatched.length });
    }

    // -------------------------------------------------------------------------
    // assign: manual assignment
    // -------------------------------------------------------------------------
    if (body.action === "assign") {
      const { transaction_id, unit_id, tenant_id, period_month, property_id } = body;

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

      // period_month arrives as YYYY-MM, store as YYYY-MM-01
      const periodDate = period_month.length === 7 ? `${period_month}-01` : period_month;

      const payload = {
        unit_id,
        tenant_id,
        property_id,
        period_month: periodDate,
        match_method: "manual",
        match_confidence: 1.0,
        status: "confirmed",
        direction: "incoming",
      };

      // Check if a match already exists for this transaction (no unique constraint yet)
      const { data: existing } = await supabase
        .from("payment_matches")
        .select("id")
        .eq("transaction_id", transaction_id)
        .maybeSingle();

      let data, error;
      if (existing?.id) {
        ({ data, error } = await supabase
          .from("payment_matches")
          .update(payload)
          .eq("id", existing.id)
          .select()
          .single());
      } else {
        ({ data, error } = await supabase
          .from("payment_matches")
          .insert({ transaction_id, ...payload })
          .select()
          .single());
      }

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data, { status: 201 });
    }

    // -------------------------------------------------------------------------
    // update_status
    // -------------------------------------------------------------------------
    if (body.action === "update_status") {
      const { match_id, status } = body;

      const { data, error } = await supabase
        .from("payment_matches")
        .update({ status })
        .eq("id", match_id)
        .select()
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    // -------------------------------------------------------------------------
    // delete
    // -------------------------------------------------------------------------
    if (body.action === "delete") {
      const { match_id } = body;

      const { error } = await supabase
        .from("payment_matches")
        .delete()
        .eq("id", match_id);

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ deleted: true });
    }

    return NextResponse.json({ error: "Unbekannte Aktion." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
