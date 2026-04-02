import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

type AnalyzeDocumentRequest = {
  path?: string;
  bucket?: string;
};

function normalizeStoragePath(inputPath: string, bucket: string) {
  if (!inputPath.startsWith("http://") && !inputPath.startsWith("https://")) {
    return inputPath;
  }

  try {
    const parsedUrl = new URL(inputPath);
    const signedPrefix = `/storage/v1/object/sign/${bucket}/`;
    const publicPrefix = `/storage/v1/object/public/${bucket}/`;

    if (parsedUrl.pathname.startsWith(signedPrefix)) {
      return decodeURIComponent(parsedUrl.pathname.slice(signedPrefix.length));
    }

    if (parsedUrl.pathname.startsWith(publicPrefix)) {
      return decodeURIComponent(parsedUrl.pathname.slice(publicPrefix.length));
    }

    const rawPrefix = `/storage/v1/object/${bucket}/`;
    if (parsedUrl.pathname.startsWith(rawPrefix)) {
      return decodeURIComponent(parsedUrl.pathname.slice(rawPrefix.length));
    }
  } catch {
    return inputPath;
  }

  return inputPath;
}

export async function POST(request: Request) {
  try {
    const missingSupabaseEnv: string[] = [];
    if (!SUPABASE_URL) missingSupabaseEnv.push("NEXT_PUBLIC_SUPABASE_URL");
    if (!SUPABASE_ANON_KEY) missingSupabaseEnv.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");

    if (missingSupabaseEnv.length > 0) {
      return NextResponse.json(
        { error: `Missing Supabase env vars: ${missingSupabaseEnv.join(", ")}.` },
        { status: 500 },
      );
    }

    const supabaseUrl = SUPABASE_URL as string;
    const supabaseAnonKey = SUPABASE_ANON_KEY as string;

    if (!ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "Missing env var: ANTHROPIC_API_KEY." }, { status: 500 });
    }

    const body = (await request.json()) as AnalyzeDocumentRequest;
    const filePath = body.path;
    const bucket = body.bucket ?? "documents";

    if (!filePath) {
      return NextResponse.json({ error: "Missing required field: path." }, { status: 400 });
    }

    const normalizedPath = normalizeStoragePath(filePath, bucket);

    const cookieStore = await cookies();
    const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        },
      },
    });

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized. Bitte zuerst einloggen." }, { status: 401 });
    }

    // Restrict document analysis to files inside the caller's own storage folder.
    if (!normalizedPath.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "Forbidden. Zugriff nur auf eigene Dateien erlaubt." }, { status: 403 });
    }

    const { data: fileData, error: downloadError } = await supabase.storage.from(bucket).download(normalizedPath);

    if (downloadError || !fileData) {
      return NextResponse.json(
        { error: downloadError?.message ?? "Failed to download file from Supabase Storage.", path: normalizedPath },
        { status: 400 },
      );
    }

    const mimeType = fileData.type || "application/octet-stream";
    const isPdf = mimeType === "application/pdf";
    const isImage = mimeType === "image/jpeg" || mimeType === "image/png";

    if (!isPdf && !isImage) {
      return NextResponse.json({ error: "Only PDF, JPG, and PNG files are supported." }, { status: 400 });
    }

    const arrayBuffer = await fileData.arrayBuffer();
    const base64File = Buffer.from(arrayBuffer).toString("base64");

    const documentBlock = isPdf
      ? {
          type: "document",
          source: {
            type: "base64",
            media_type: "application/pdf",
            data: base64File,
          },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: mimeType,
            data: base64File,
          },
        };

    const anthropicResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [
              documentBlock,
              {
                type: "text",
                text: "Lies den Text aus diesem Dokument vollständig aus und gib ihn zurück",
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      const details = await anthropicResponse.text();
      return NextResponse.json(
        { error: "Claude API request failed.", details: details || anthropicResponse.statusText },
        { status: 502 },
      );
    }

    const data = (await anthropicResponse.json()) as {
      content?: Array<{ type?: string; text?: string }>;
    };

    const extractedText =
      data.content
        ?.filter((block) => block.type === "text" && typeof block.text === "string")
        .map((block) => block.text)
        .join("\n") ?? "";

    const { error: updateError } = await supabase
      .from("documents")
      .update({ extracted_text: extractedText })
      .eq("storage_path", normalizedPath)
      .eq("user_id", user.id);

    if (updateError) {
      return NextResponse.json(
        { error: `Fehler beim Speichern des Textes: ${updateError.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({ text: extractedText });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
