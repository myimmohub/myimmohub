"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { type DocumentCategory, CATEGORY_LABELS, ALL_CATEGORIES } from "@/lib/ai/categories";

type PropertyRef = { id: string; name: string };

type DocumentDetail = {
  id: string;
  file_name: string;
  original_filename: string | null;
  storage_path: string;
  category: DocumentCategory | null;
  amount: number | null;
  document_date: string | null;
  status: string;
  extracted_text: string | null;
  property_id: string | null;
  email_from: string | null;
  email_subject: string | null;
  created_at: string;
  ai_confidence: number | null;
  source: string | null;
  properties: PropertyRef | null;
};

type ApiResponse = {
  doc: DocumentDetail;
  signedUrl: string | null;
  properties: PropertyRef[];
};

export default function DocumentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bearbeitungsmodus
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<DocumentCategory | "">("");
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editPropertyId, setEditPropertyId] = useState("");

  useEffect(() => {
    fetch(`/api/documents/${id}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? "Ladefehler");
        }
        return res.json() as Promise<ApiResponse>;
      })
      .then((d) => {
        setData(d);
        setEditCategory(d.doc.category ?? "");
        setEditAmount(d.doc.amount !== null ? String(d.doc.amount) : "");
        setEditDate(d.doc.document_date ?? "");
        setEditPropertyId(d.doc.property_id ?? "");
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Unbekannter Fehler."),
      )
      .finally(() => setIsLoading(false));
  }, [id]);

  const handleSave = async () => {
    if (!data) return;
    setIsSaving(true);
    setSaveError(null);

    const res = await fetch(`/api/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        category: editCategory || null,
        amount: editAmount !== "" ? parseFloat(editAmount.replace(",", ".")) : null,
        document_date: editDate || null,
        property_id: editPropertyId || null,
      }),
    });

    setIsSaving(false);

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setSaveError(body.error ?? "Speichern fehlgeschlagen.");
      return;
    }

    // Lokal aktualisieren
    setData((prev) => {
      if (!prev) return prev;
      const matchedProperty = prev.properties.find((p) => p.id === editPropertyId) ?? null;
      return {
        ...prev,
        doc: {
          ...prev.doc,
          category: (editCategory as DocumentCategory) || null,
          amount: editAmount !== "" ? parseFloat(editAmount.replace(",", ".")) : null,
          document_date: editDate || null,
          property_id: editPropertyId || null,
          properties: matchedProperty,
        },
      };
    });

    setIsEditing(false);
  };

  const isImage = (url: string) =>
    /\.(jpg|jpeg|png)(\?|$)/i.test(url);

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <p className="text-sm text-zinc-500 dark:text-zinc-400">Lade Dokument…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-zinc-100 dark:bg-zinc-950">
        <div className="text-center">
          <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Dokument nicht gefunden."}</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-4 text-sm text-zinc-500 underline dark:text-zinc-400"
          >
            Zurück
          </button>
        </div>
      </main>
    );
  }

  const { doc, signedUrl, properties } = data;
  const displayName = doc.original_filename ?? doc.file_name;

  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10 dark:bg-zinc-950">
      <section className="mx-auto w-full max-w-5xl">

        {/* Breadcrumb */}
        <nav className="mb-6 flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
          <Link href="/dashboard/documents" className="hover:text-zinc-900 dark:hover:text-zinc-100">
            Dokumente
          </Link>
          <span>/</span>
          <span className="truncate text-zinc-900 dark:text-zinc-100">{displayName}</span>
        </nav>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">

          {/* Linke Spalte: Vorschau */}
          <div className="flex flex-col gap-4">
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
              {signedUrl ? (
                isImage(signedUrl) ? (
                  <img
                    src={signedUrl}
                    alt={displayName}
                    className="h-auto w-full object-contain"
                  />
                ) : (
                  <iframe
                    src={signedUrl}
                    title={displayName}
                    className="h-[600px] w-full"
                  />
                )
              ) : (
                <div className="flex h-48 items-center justify-center text-sm text-zinc-400">
                  Keine Vorschau verfügbar
                </div>
              )}
            </div>

            {/* Download */}
            {signedUrl && (
              <a
                href={signedUrl}
                download={displayName}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 shadow-sm transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
                Original herunterladen
              </a>
            )}
          </div>

          {/* Rechte Spalte: Metadaten */}
          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">

              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 className="truncate text-lg font-semibold text-zinc-900 dark:text-zinc-100">
                    {displayName}
                  </h1>
                  {doc.email_from && (
                    <p className="mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      Von: {doc.email_from}
                      {doc.email_subject ? ` · ${doc.email_subject}` : ""}
                    </p>
                  )}
                  {doc.ai_confidence !== null && (
                    <p className="mt-0.5 text-xs text-zinc-400 dark:text-zinc-500">
                      KI-Konfidenz: {Math.round(doc.ai_confidence * 100)}%
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => { setIsEditing((v) => !v); setSaveError(null); }}
                  className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  {isEditing ? "Abbrechen" : "Bearbeiten"}
                </button>
              </div>

              <div className="mt-5 space-y-4">
                {isEditing ? (
                  <>
                    <Field label="Kategorie">
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as DocumentCategory)}
                        className={inputClass}
                      >
                        <option value="">Keine Kategorie</option>
                        {ALL_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>{CATEGORY_LABELS[cat]}</option>
                        ))}
                      </select>
                    </Field>

                    <Field label="Betrag (€)">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Datum">
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className={inputClass}
                      />
                    </Field>

                    <Field label="Immobilie">
                      <select
                        value={editPropertyId}
                        onChange={(e) => setEditPropertyId(e.target.value)}
                        className={inputClass}
                      >
                        <option value="">Keine Zuordnung</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </Field>

                    {saveError ? (
                      <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                        {saveError}
                      </p>
                    ) : null}

                    <button
                      type="button"
                      onClick={() => void handleSave()}
                      disabled={isSaving}
                      className="mt-2 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                    >
                      {isSaving ? "Speichert…" : "Änderungen speichern"}
                    </button>
                  </>
                ) : (
                  <>
                    <MetaRow label="Kategorie">
                      {doc.category ? (
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {CATEGORY_LABELS[doc.category]}
                        </span>
                      ) : <Empty />}
                    </MetaRow>
                    <MetaRow label="Betrag">
                      {doc.amount !== null ? (
                        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                          {doc.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                        </span>
                      ) : <Empty />}
                    </MetaRow>
                    <MetaRow label="Datum">
                      {doc.document_date ? (
                        <span className="text-sm text-zinc-900 dark:text-zinc-100">
                          {new Date(doc.document_date).toLocaleDateString("de-DE")}
                        </span>
                      ) : <Empty />}
                    </MetaRow>
                    <MetaRow label="Immobilie">
                      {doc.properties ? (
                        <Link
                          href={`/dashboard/properties/${doc.properties.id}`}
                          className="text-sm text-zinc-900 underline-offset-2 hover:underline dark:text-zinc-100"
                        >
                          {doc.properties.name}
                        </Link>
                      ) : <Empty />}
                    </MetaRow>
                    <MetaRow label="Hinzugefügt">
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {new Date(doc.created_at).toLocaleDateString("de-DE")}
                      </span>
                    </MetaRow>
                    <MetaRow label="Quelle">
                      <span className="text-sm text-zinc-500 dark:text-zinc-400">
                        {doc.source === "email" ? "E-Mail" : doc.source ?? "—"}
                      </span>
                    </MetaRow>
                  </>
                )}
              </div>
            </div>

            {/* Extrahierter Text */}
            {doc.extracted_text && (
              <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
                <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Extrahierter Text
                </h2>
                <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {doc.extracted_text}
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}

const inputClass =
  "w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-100 pb-3 dark:border-zinc-800">
      <span className="shrink-0 text-sm text-zinc-400 dark:text-zinc-500">{label}</span>
      <div className="text-right">{children}</div>
    </div>
  );
}

function Empty() {
  return <span className="text-sm text-zinc-300 dark:text-zinc-600">—</span>;
}
