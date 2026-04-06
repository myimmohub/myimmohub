import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Gibt den aktuell eingeloggten Nutzer zurück.
 * Nur server-seitig verwenden (API-Routes, Server Components).
 */
export async function getUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const cookieStore = await cookies();
  const authClient = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cs) =>
        cs.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        ),
    },
  });
  return authClient.auth.getUser();
}
