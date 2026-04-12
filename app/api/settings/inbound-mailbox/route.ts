import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { serviceRoleClient } from "@/lib/supabase/queries";

type MailboxRecord = {
  user_id: string;
  alias: string;
  is_active: boolean;
};

function buildInboundAddress(alias: string) {
  const customDomain = process.env.INBOUND_EMAIL_DOMAIN;
  if (customDomain) {
    return `${alias}@${customDomain}`;
  }

  const inboundHash = process.env.POSTMARK_INBOUND_HASH;
  if (inboundHash) {
    return `${inboundHash}+${alias}@inbound.postmarkapp.com`;
  }

  return null;
}

async function generateUniqueAlias() {
  const db = serviceRoleClient();

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const alias = randomBytes(5).toString("hex");
    const { data } = await db
      .from("user_inbound_mailboxes")
      .select("alias")
      .eq("alias", alias)
      .maybeSingle();

    if (!data) return alias;
  }

  throw new Error("Konnte keinen eindeutigen Postfach-Alias erzeugen.");
}

export async function GET() {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const db = serviceRoleClient();
  const { data: existing, error } = await db
    .from("user_inbound_mailboxes")
    .select("user_id, alias, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let mailbox = existing as MailboxRecord | null;
  if (!mailbox) {
    const alias = await generateUniqueAlias();
    const { data: created, error: createError } = await db
      .from("user_inbound_mailboxes")
      .insert({
        user_id: user.id,
        alias,
        is_active: true,
      })
      .select("user_id, alias, is_active")
      .single();

    if (createError) return NextResponse.json({ error: createError.message }, { status: 500 });
    mailbox = created as MailboxRecord;
  }

  const email = buildInboundAddress(mailbox.alias);

  return NextResponse.json({
    alias: mailbox.alias,
    email,
    is_active: mailbox.is_active,
    mode: email ? "postmark" : "unconfigured",
    uses_custom_domain: Boolean(process.env.INBOUND_EMAIL_DOMAIN),
  });
}
