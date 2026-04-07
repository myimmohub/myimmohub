import { NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/getUser";
import { fetchAllDocumentsWithProperties, serviceRoleClient } from "@/lib/supabase/queries";
import { extractText } from "@/lib/ai/extractText";
import { classifyDocument, type Property } from "@/lib/ai/classifyDocument";
import { sanitizeFileName } from "@/lib/constants";

// GET — alle Dokumente des Nutzers (ohne Statusfilter)
export async function GET() {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { data, error } = await fetchAllDocumentsWithProperties(
    serviceRoleClient(),
    user.id,
  );

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST — Upload-Pfad entgegennehmen, OCR + Klassifikation starten, DB-Eintrag anlegen
export async function POST(request: Request) {
  const { data: { user } } = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = (await request.json()) as {
    storagePath: string;
    fileName: string;
    originalFilename: string;
    propertyId?: string | null;
  };

  if (!body.storagePath || !body.fileName) {
    return NextResponse.json({ error: "storagePath und fileName sind erforderlich." }, { status: 400 });
  }

  const db = serviceRoleClient();

  // 1. Dokument-Eintrag mit status=pending_analysis anlegen
  const { data: doc, error: insertError } = await db
    .from("documents")
    .insert({
      user_id: user.id,
      property_id: body.propertyId ?? null,
      storage_path: body.storagePath,
      file_name: sanitizeFileName(body.fileName),
      original_filename: body.originalFilename,
      source: "manual",
      status: "pending_analysis",
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // 2. Datei aus Storage laden für OCR
  let extractedText: string | null = null;
  const { data: fileData, error: downloadError } = await db.storage
    .from("documents")
    .download(body.storagePath);

  if (!downloadError && fileData) {
    const buffer = Buffer.from(await fileData.arrayBuffer());
    extractedText = await extractText(buffer, fileData.type);
  }

  // 3. Properties für Klassifikation laden
  const { data: propertiesData } = await db
    .from("properties")
    .select("id, name, address, type")
    .eq("user_id", user.id);
  const properties: Property[] = propertiesData ?? [];

  // 4. Klassifikation
  let category = null, amount = null, documentDate = null, counterpart = null, suggestedPropertyId = null, aiConfidence = null;

  if (extractedText) {
    try {
      const cls = await classifyDocument(extractedText, properties);
      category = cls.category;
      amount = cls.amount;
      documentDate = cls.date;
      counterpart = cls.counterpart;
      suggestedPropertyId = body.propertyId ?? cls.property_id;
      aiConfidence = cls.confidence;
    } catch {
      // Klassifikation fehlgeschlagen — Dokument bleibt ohne Kategorie im Eingang
    }
  }

  // 5. Dokument aktualisieren
  const { error: updateError } = await db
    .from("documents")
    .update({
      extracted_text: extractedText,
      category,
      amount,
      document_date: documentDate,
      counterpart,
      suggested_property_id: suggestedPropertyId,
      ai_confidence: aiConfidence,
      status: extractedText ? "pending_review" : "pending_analysis",
    })
    .eq("id", doc.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ id: doc.id, status: extractedText ? "pending_review" : "pending_analysis" });
}
