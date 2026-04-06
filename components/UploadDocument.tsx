"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type UploadDocumentProps = {
  propertyId: string;
  onUploaded?: (path: string) => void;
};

const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

function sanitizeFileName(fileName: string) {
  return fileName.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

export default function UploadDocument({ propertyId, onUploaded }: UploadDocumentProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setErrorMessage("Nur PDF, JPG und PNG sind erlaubt.");
      return;
    }

    if (!propertyId) {
      setErrorMessage("Es fehlt eine gueltige propertyId.");
      return;
    }

    setIsUploading(true);
    setProgress(5);

    // Simulierter Fortschritt bis der Upload abgeschlossen ist.
    const progressTimer = window.setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + 10));
    }, 250);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        throw new Error("Du musst eingeloggt sein, um Dokumente hochzuladen.");
      }

      const safeName = sanitizeFileName(file.name);
      const filePath = `${user.id}/${propertyId}/${Date.now()}_${safeName}`;

      const { error: uploadError } = await supabase.storage.from("documents").upload(filePath, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

      if (uploadError) {
        throw uploadError;
      }

      const { error: insertError } = await supabase.from("documents").insert({
        property_id: propertyId,
        user_id: user.id,
        storage_path: filePath,
        file_name: safeName,
      });

      if (insertError) {
        throw new Error(`Datenbankfehler: ${insertError.message}`);
      }

      setProgress(100);
      setSuccessMessage("Upload erfolgreich.");
      onUploaded?.(filePath);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload fehlgeschlagen.";
      setErrorMessage(message);
    } finally {
      window.clearInterval(progressTimer);
      setIsUploading(false);
      window.setTimeout(() => setProgress(0), 800);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Dokument hochladen</label>

      <input
        type="file"
        accept=".pdf,image/jpeg,image/png"
        disabled={isUploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) {
            void handleUpload(file);
          }
          event.currentTarget.value = "";
        }}
        className="block w-full cursor-pointer rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-70 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:file:bg-zinc-100 dark:file:text-zinc-900 dark:hover:file:bg-zinc-300"
      />

      {isUploading || progress > 0 ? (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
            <div
              className="h-full bg-zinc-900 transition-all duration-200 dark:bg-zinc-100"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">{progress}%</p>
        </div>
      ) : null}

      {successMessage ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
          {successMessage}
        </p>
      ) : null}

      {errorMessage ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
          {errorMessage}
        </p>
      ) : null}
    </div>
  );
}
