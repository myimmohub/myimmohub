import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";
import { splitTransaction, type SplitResult } from "@/lib/banking/splitTransaction";

type RequestBody = {
  /** ID der aufzuteilenden Original-Transaktion */
  transactionId: string;
  /** Zinsanteil in Euro (positiver Wert) */
  interestAmount: number;
  /** Tilgungsanteil in Euro (positiver Wert) */
  principalAmount: number;
};

export async function POST(request: Request) {
  // ── Authentifizierung ──────────────────────────────────────────────────────
  const { data: { user } } = await getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // ── Request-Body lesen ─────────────────────────────────────────────────────
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Ungültiger Request-Body." }, { status: 400 });
  }

  const { transactionId, interestAmount, principalAmount } = body;

  if (!transactionId || typeof transactionId !== "string") {
    return NextResponse.json(
      { error: "Feld 'transactionId' fehlt oder ist ungültig." },
      { status: 400 },
    );
  }

  if (typeof interestAmount !== "number" || typeof principalAmount !== "number") {
    return NextResponse.json(
      { error: "Felder 'interestAmount' und 'principalAmount' müssen Zahlen sein." },
      { status: 400 },
    );
  }

  // ── Aufteilung durchführen ─────────────────────────────────────────────────
  let result: SplitResult;
  try {
    result = await splitTransaction(serviceRoleClient(), {
      transactionId,
      interestAmount,
      principalAmount,
      userId: user.id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Datenbankfehler." },
      { status: 500 },
    );
  }

  return NextResponse.json(result satisfies SplitResult);
}
