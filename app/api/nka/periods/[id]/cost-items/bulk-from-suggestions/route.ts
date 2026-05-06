/**
 * POST /api/nka/periods/[id]/cost-items/bulk-from-suggestions
 *
 * Erzeugt eine `nka_kostenpositionen`-Zeile pro `accepted`-Eintrag.
 *
 * Body:
 *   {
 *     accepted: Array<{
 *       transaction_id: string;
 *       position: BetrkvPosition;
 *       umlagefaehig_pct?: number;          // default 100
 *       verteilungsschluessel?: ...;        // default "sqm"
 *     }>
 *   }
 *
 * Lädt die Transaktionen einmalig zur Brutto-Cents-Bestimmung und persistiert
 * dann die Positionen in einem Batch-Insert.
 *
 * Auth: Cookie-Client. Ownership über properties.user_id.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import {
  nkaPositionSchema,
  nkaSchluesselSchema,
  uuidSchema,
} from "@/lib/nka/requestSchemas";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll() },
  });
}

const acceptedItemSchema = z.object({
  transaction_id: uuidSchema,
  position: nkaPositionSchema,
  umlagefaehig_pct: z.number().min(0).max(100).optional(),
  verteilungsschluessel: nkaSchluesselSchema.optional(),
});

const bodySchema = z.object({
  accepted: z.array(acceptedItemSchema).min(1, "accepted darf nicht leer sein"),
});

export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: periodId } = await ctx.params;
  if (!uuidSchema.safeParse(periodId).success) {
    return NextResponse.json(
      { error: "id muss eine UUID sein." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Ungültiges JSON im Request-Body." },
      { status: 400 },
    );
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ungültiger Request-Body.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const supabase = await getSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  // Period + Ownership
  const { data: period } = await supabase
    .from("nka_perioden")
    .select("id, property_id")
    .eq("id", periodId)
    .maybeSingle<{ id: string; property_id: string }>();
  if (!period) {
    return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });
  }
  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .eq("id", period.property_id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!property) {
    return NextResponse.json({ error: "Periode nicht gefunden." }, { status: 404 });
  }

  // Transaktionen laden, um brutto_cents zu bestimmen
  const txIds = parsed.data.accepted.map((a) => a.transaction_id);
  const { data: txs } = await supabase
    .from("transactions")
    .select("id, amount, property_id")
    .in("id", txIds)
    .returns<{ id: string; amount: number | string; property_id: string }[]>();

  const txById = new Map<string, { amount: number; property_id: string }>();
  for (const tx of txs ?? []) {
    txById.set(tx.id, {
      amount: typeof tx.amount === "number" ? tx.amount : Number(tx.amount),
      property_id: tx.property_id,
    });
  }

  const inserts = parsed.data.accepted
    .filter((a) => {
      const tx = txById.get(a.transaction_id);
      // Sicherheit: tx muss zur gleichen Property wie die Periode gehören.
      return tx && tx.property_id === period.property_id;
    })
    .map((a) => {
      const tx = txById.get(a.transaction_id)!;
      const brutto_cents = Math.round(Math.abs(tx.amount) * 100);
      return {
        period_id: periodId,
        position: a.position,
        label: null,
        brutto_cents,
        umlagefaehig_pct: a.umlagefaehig_pct ?? 100,
        verteilungsschluessel: a.verteilungsschluessel ?? "sqm",
        direct_shares: null,
        consumption: null,
        heizkosten_verbrauchsanteil_pct:
          a.position === "heizung" ? 70 : null,
        transaction_id: a.transaction_id,
      };
    });

  if (inserts.length === 0) {
    return NextResponse.json(
      { error: "Keine gültigen Transaktionen gefunden." },
      { status: 400 },
    );
  }

  const { data: created, error } = await supabase
    .from("nka_kostenpositionen")
    .insert(inserts)
    .select();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json(
    { created: created?.length ?? 0, items: created ?? [] },
    { status: 201 },
  );
}
