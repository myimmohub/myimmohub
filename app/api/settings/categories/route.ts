import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

export async function GET() {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const db = serviceRoleClient();
  const { data, error } = await db
    .from("categories")
    .select("*")
    .is("deleted_at", null)
    .order("gruppe")
    .order("label");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as {
    label: string;
    icon?: string;
    gruppe: string;
    typ: string;
    anlage_v: string;
    badge_100pct?: boolean;
    description?: string;
    property_id?: string | null;
  };

  if (!body.label || !body.gruppe || !body.typ || !body.anlage_v) {
    return NextResponse.json({ error: "Pflichtfelder fehlen." }, { status: 400 });
  }

  const db = serviceRoleClient();
  const { data, error } = await db
    .from("categories")
    .insert({
      label: body.label,
      icon: body.icon || "📌",
      gruppe: body.gruppe,
      typ: body.typ,
      anlage_v: body.anlage_v,
      badge_100pct: body.badge_100pct ?? false,
      description: body.description ?? null,
      property_id: body.property_id ?? null,
      is_system: false,
      editierbar: true,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
