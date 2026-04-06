import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Alle Dokumente eines Nutzers (inkl. Immobilien-Name per JOIN) in einem einzigen DB-Aufruf.
 *
 * Supabase löst `properties(id, name)` automatisch über den Foreign Key
 * documents.property_id → properties.id auf — kein separater Lookup nötig.
 *
 * @param db     - Supabase-Client (Service-Role empfohlen um RLS zu umgehen)
 * @param userId - ID des eingeloggten Nutzers
 * @param status - Filtert nach document.status (z. B. "confirmed", "pending_review")
 */
export async function fetchDocumentsWithProperties(
  db: SupabaseClient,
  userId: string,
  status: string,
  /** Unzugeordnete Dokumente (user_id IS NULL) einschließen — nur für den Eingang sinnvoll */
  includeUnassigned = false,
) {
  const query = db
    .from("documents")
    .select(
      `id,
       file_name,
       original_filename,
       storage_path,
       category,
       amount,
       document_date,
       status,
       extracted_text,
       property_id,
       email_from,
       email_subject,
       ai_confidence,
       source,
       created_at,
       properties!documents_property_id_fkey (
         id,
         name
       )`,
    )
    .eq("status", status)
    .order("document_date", { ascending: false, nullsFirst: false });

  return includeUnassigned
    ? query.or(`user_id.eq.${userId},user_id.is.null`)
    : query.eq("user_id", userId);
}

/**
 * Alle Dokumente eines Nutzers ohne Statusfilter — für die Dokumente-Übersicht.
 */
export async function fetchAllDocumentsWithProperties(
  db: SupabaseClient,
  userId: string,
) {
  return db
    .from("documents")
    .select(
      `id,
       file_name,
       original_filename,
       storage_path,
       category,
       amount,
       document_date,
       status,
       extracted_text,
       property_id,
       email_from,
       email_subject,
       ai_confidence,
       source,
       created_at,
       properties!documents_property_id_fkey (
         id,
         name
       )`,
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
}

/**
 * Ein einzelnes Dokument per ID (inkl. Immobilien-Name per JOIN).
 */
export async function fetchDocumentById(
  db: SupabaseClient,
  userId: string,
  documentId: string,
) {
  return db
    .from("documents")
    .select(
      `id,
       file_name,
       original_filename,
       storage_path,
       category,
       amount,
       document_date,
       status,
       extracted_text,
       property_id,
       email_from,
       email_subject,
       ai_confidence,
       source,
       created_at,
       properties!documents_property_id_fkey (
         id,
         name
       )`,
    )
    .eq("id", documentId)
    .single();
}

/**
 * Erstellt einen Service-Role-Client (umgeht RLS).
 * Nur server-seitig verwenden.
 */
export function serviceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase service role env vars.");
  return createClient(url, key);
}
