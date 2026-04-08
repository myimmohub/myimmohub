import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as {
    gbr_settings_id: string;
    name: string;
    anteil: number;
    email?: string;
  };

  if (!body.gbr_settings_id || !body.name || body.anteil == null) {
    return NextResponse.json({ error: "Pflichtfelder fehlen." }, { status: 400 });
  }

  const db = serviceRoleClient();
  const { data, error } = await db
    .from("gbr_partner")
    .insert({
      gbr_settings_id: body.gbr_settings_id,
      name: body.name,
      anteil: body.anteil,
      email: body.email ?? null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as { id: string };
  if (!body.id) return NextResponse.json({ error: "id fehlt." }, { status: 400 });

  const db = serviceRoleClient();
  const { error } = await db
    .from("gbr_partner")
    .delete()
    .eq("id", body.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
