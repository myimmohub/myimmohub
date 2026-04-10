import { NextResponse, type NextRequest } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as {
    anlage_v?: string;
    label?: string;
    icon?: string;
    description?: string;
  };
  const update: {
    anlage_v?: string;
    label?: string;
    icon?: string;
    description?: string;
  } = {
    ...body,
  };

  if (typeof body.label === "string") {
    const label = body.label.trim();
    if (!label) {
      return NextResponse.json({ error: "Die Bezeichnung darf nicht leer sein." }, { status: 400 });
    }
    update.label = label;
  }

  const db = serviceRoleClient();
  const { error } = await db
    .from("categories")
    .update(update)
    .eq("id", id)
    .eq("editierbar", true);

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: `Die Kategorie "${update.label ?? body.label}" existiert bereits.` }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const db = serviceRoleClient();

  const { error } = await db
    .from("categories")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .eq("is_system", false);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
