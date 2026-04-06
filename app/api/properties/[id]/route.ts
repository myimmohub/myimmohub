import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const db = serviceRoleClient();

  // Sicherstellen dass die Immobilie dem Nutzer gehört
  const { data: existing } = await db
    .from("properties")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (!existing) {
    return NextResponse.json({ error: "Immobilie nicht gefunden." }, { status: 404 });
  }

  const body = await request.json() as Record<string, unknown>;

  const { data, error } = await db
    .from("properties")
    .update(body)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
