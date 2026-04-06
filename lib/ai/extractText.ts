import { ALLOWED_TYPES } from "@/lib/constants";

/**
 * Extrahiert Text aus einer Datei (PDF oder Bild) via Claude Haiku OCR.
 * Gibt null zurück wenn kein API-Key vorhanden, der Dateityp nicht unterstützt
 * wird oder der API-Aufruf fehlschlägt.
 */
export async function extractText(
  content: Buffer,
  mimeType: string,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || !ALLOWED_TYPES.includes(mimeType)) return null;

  const base64 = content.toString("base64");
  const isPdf = mimeType === "application/pdf";

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content: [
            isPdf
              ? { type: "document", source: { type: "base64", media_type: mimeType, data: base64 } }
              : { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
            { type: "text", text: "Lies den Text aus diesem Dokument vollständig aus und gib ihn zurück." },
          ],
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const data = (await response.json()) as {
    content?: Array<{ type?: string; text?: string }>;
  };

  return (
    data.content
      ?.filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text)
      .join("\n") ?? null
  );
}
