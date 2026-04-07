"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type DocumentCategory, CATEGORY_LABELS } from "@/lib/ai/categories";
import { ALLOWED_TYPES, sanitizeFileName } from "@/lib/constants";

type UploadStep = "idle" | "uploading" | "analysing" | "done" | "error";

const STEP_LABELS: Record<UploadStep, string> = {
  idle: "",
  uploading: "Wird hochgeladen…",
  analysing: "KI analysiert…",
  done: "Fertig – weiterleitung zum Eingang…",
  error: "",
};

const CATEGORY_COLORS: Record<DocumentCategory, string> = {
  miete: "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  rechnung_handwerk: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  rechnung_verwaltung: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  versicherung: "bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300",
  nebenkostenabrechnung: "bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300",
  zinsen: "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
  sonstiges: "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300",
};

type PropertyRef = { id: string; name: string };

type Document = {
  id: string;
  file_name: string;
  original_filename: string | null;
  category: DocumentCategory | null;
  amount: number | null;
  document_date: string | null;
  status: string | null;
  extracted_text: string | null;
  property_id: string | null;
  created_at: string;
  properties: PropertyRef | null;
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Bestätigt",
  pending_review: "Prüfen",
  pending_analysis: "Wird analysiert",
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  pending_review: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950/40 dark:text-yellow-300",
  pending_analysis: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
};

export default function DocumentsPage() {
  const router = useRouter();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState<DocumentCategory | "">("");
  const [filterProperty, setFilterProperty] = useState<string>("");

  // Upload-Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/documents")
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "Ladefehler");
        }
        return res.json() as Promise<Document[]>;
      })
      .then((data) => setDocuments(data))
      .catch((err: Error) => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const handleFileSelected = async (file: File) => {
    if (!ALLOWED_TYPES.includes(file.type)) {
      setUploadError("Nur PDF, JPG und PNG sind erlaubt.");
      setUploadStep("error");
      return;
    }

    setUploadError(null);
    setUploadStep("uploading");

    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Nicht eingeloggt.");

      const safeName = sanitizeFileName(file.name);
      const storagePath = `${user.id}/uploads/${Date.now()}_${safeName}`;

      const { error: storageError } = await supabase.storage
        .from("documents")
        .upload(storagePath, file, { contentType: file.type, upsert: false });

      if (storageError) throw new Error(storageError.message);

      setUploadStep("analysing");

      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storagePath,
          fileName: safeName,
          originalFilename: file.name,
        }),
      });

      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Analyse fehlgeschlagen.");
      }

      setUploadStep("done");
      setTimeout(() => {
        setModalOpen(false);
        setUploadStep("idle");
        router.push("/dashboard/inbox");
      }, 1200);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Unbekannter Fehler.");
      setUploadStep("error");
    }
  };

  const openModal = () => {
    setUploadStep("idle");
    setUploadError(null);
    setModalOpen(true);
  };

  const closeModal = () => {
    if (uploadStep === "uploading" || uploadStep === "analysing") return; // kein Abbruch während Verarbeitung
    setModalOpen(false);
    setUploadStep("idle");
    setUploadError(null);
  };

  // Alle einzigartigen Properties aus geladenen Dokumenten
  const allProperties = useMemo(() => {
    const map = new Map<string, string>();
    for (const doc of documents) {
      if (doc.properties) map.set(doc.properties.id, doc.properties.name);
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }));
  }, [documents]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return documents.filter((doc) => {
      if (filterCategory && doc.category !== filterCategory) return false;
      if (filterProperty && doc.property_id !== filterProperty) return false;
      if (q) {
        const inName = (doc.original_filename ?? doc.file_name).toLowerCase().includes(q);
        const inText = doc.extracted_text?.toLowerCase().includes(q) ?? false;
        if (!inName && !inText) return false;
      }
      return true;
    });
  }, [documents, search, filterCategory, filterProperty]);

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString("de-DE");
  };

  const formatAmount = (amount: number | null) => {
    if (amount === null) return "—";
    return amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" });
  };

  const busy = uploadStep === "uploading" || uploadStep === "analysing";

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Lade Dokumente...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
      <section className="mx-auto w-full max-w-6xl">

        {/* Header */}
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              Dokumente
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Alle Dokumente
            </p>
          </div>
          <button
            type="button"
            onClick={openModal}
            className="inline-flex items-center gap-2 rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Beleg hochladen
          </button>
        </div>

        {/* Filter + Suche */}
        <div className="mt-6 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Suche in Dateiname oder Text…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 shadow-sm outline-none focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder-zinc-500 sm:w-72"
          />
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as DocumentCategory | "")}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Alle Kategorien</option>
            {(Object.keys(CATEGORY_LABELS) as DocumentCategory[]).map((cat) => (
              <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
            ))}
          </select>
          <select
            value={filterProperty}
            onChange={(e) => setFilterProperty(e.target.value)}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-700 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300"
          >
            <option value="">Alle Immobilien</option>
            {allProperties.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          {(search || filterCategory || filterProperty) && (
            <button
              type="button"
              onClick={() => { setSearch(""); setFilterCategory(""); setFilterProperty(""); }}
              className="rounded-lg border border-zinc-200 px-3 py-2 text-sm text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {/* Tabelle */}
        <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {filtered.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              {documents.length === 0 ? "Noch keine Dokumente vorhanden." : "Keine Dokumente gefunden."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-800/60">
                    <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Datum</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Dateiname</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Kategorie</th>
                    <th className="px-4 py-3 text-right font-medium text-zinc-500 dark:text-zinc-400">Betrag</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Immobilie</th>
                    <th className="px-4 py-3 text-left font-medium text-zinc-500 dark:text-zinc-400">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {filtered.map((doc) => (
                    <tr
                      key={doc.id}
                      onClick={() => router.push(`/dashboard/documents/${doc.id}`)}
                      className="cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    >
                      <td className="whitespace-nowrap px-4 py-3 text-zinc-500 dark:text-zinc-400">
                        {formatDate(doc.document_date ?? doc.created_at)}
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <p className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                          {doc.original_filename ?? doc.file_name}
                        </p>
                        {doc.extracted_text && search && doc.extracted_text.toLowerCase().includes(search.toLowerCase()) ? (
                          <p className="mt-0.5 truncate text-xs text-zinc-400 dark:text-zinc-500">
                            …{getSnippet(doc.extracted_text, search)}…
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        {doc.category ? (
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${CATEGORY_COLORS[doc.category]}`}>
                            {CATEGORY_LABELS[doc.category]}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right font-medium text-zinc-900 dark:text-zinc-100">
                        {formatAmount(doc.amount)}
                      </td>
                      <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                        {doc.properties?.name ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {doc.status ? (
                          <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.status] ?? "bg-zinc-100 text-zinc-500"}`}>
                            {STATUS_LABELS[doc.status] ?? doc.status}
                          </span>
                        ) : (
                          <span className="text-zinc-400">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {filtered.length > 0 && (
          <p className="mt-3 text-xs text-zinc-400 dark:text-zinc-500">
            {filtered.length} Dokument{filtered.length !== 1 ? "e" : ""}
            {filtered.length !== documents.length ? ` von ${documents.length}` : ""}
          </p>
        )}
      </section>

      {/* Upload-Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl dark:border-zinc-800 dark:bg-zinc-900">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Beleg hochladen
              </h2>
              {!busy && (
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>

            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              PDF, JPG oder PNG — die KI klassifiziert den Beleg automatisch.
            </p>

            {/* Dropzone */}
            {uploadStep === "idle" || uploadStep === "error" ? (
              <div
                className="mt-5 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-zinc-200 bg-zinc-50 py-10 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800/50 dark:hover:border-zinc-500"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  const file = e.dataTransfer.files[0];
                  if (file) void handleFileSelected(file);
                }}
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                  Klicken oder Datei hierher ziehen
                </p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">PDF, JPG, PNG</p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,image/jpeg,image/png"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleFileSelected(file);
                    e.target.value = "";
                  }}
                />
              </div>
            ) : null}

            {/* Fortschritt */}
            {(uploadStep === "uploading" || uploadStep === "analysing" || uploadStep === "done") && (
              <div className="mt-5 space-y-3">
                <div className="flex items-center gap-3">
                  {uploadStep !== "done" ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-700 dark:border-zinc-600 dark:border-t-zinc-200" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  <p className="text-sm text-zinc-700 dark:text-zinc-300">{STEP_LABELS[uploadStep]}</p>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-zinc-900 transition-all duration-500 dark:bg-zinc-100"
                    style={{ width: uploadStep === "uploading" ? "40%" : uploadStep === "analysing" ? "75%" : "100%" }}
                  />
                </div>
              </div>
            )}

            {/* Fehler */}
            {uploadStep === "error" && uploadError && (
              <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {uploadError}
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function getSnippet(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return "";
  const start = Math.max(0, idx - 30);
  const end = Math.min(text.length, idx + query.length + 30);
  return text.slice(start, end);
}
