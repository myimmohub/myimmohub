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

// Check view columns
const { data, error } = await admin.from("v_nka_status_monitor").select("*").limit(1);
console.log("Error:", error);
console.log("View columns:", Object.keys(data?.[0] ?? {}));
console.log("Sample row:", JSON.stringify(data?.[0], null, 2));
