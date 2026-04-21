import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(process.argv[2], "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// Fetch one row to infer columns
const { data: sample, error: sampleErr } = await admin.from("properties").select("*").limit(1);
if (sampleErr) {
  console.error("sample error:", sampleErr);
} else {
  console.log("Sample properties columns:", Object.keys(sample?.[0] ?? {}));
  console.log("Sample row:", JSON.stringify(sample?.[0], null, 2));
}

// Also introspect categories columns that matter
const { data: cats } = await admin
  .from("categories")
  .select("id, label, gruppe, typ, betr_kv_position, ist_umlagefaehig_default, umlageschluessel_default")
  .in("betr_kv_position", [2, 4, 7, 8, 11, 13, 14, 17])
  .is("deleted_at", null);
console.log("\nCategories seeded for BetrKV:");
for (const c of cats ?? []) console.log(` - pos ${c.betr_kv_position}: ${c.label} · typ=${c.typ} · umlagefähig_default=${c.ist_umlagefaehig_default} · schlüssel_default=${c.umlageschluessel_default}`);

// tenants columns
const { data: tenantSample } = await admin.from("tenants").select("*").limit(1);
console.log("\nTenants columns:", Object.keys(tenantSample?.[0] ?? {}));
