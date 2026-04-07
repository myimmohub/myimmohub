"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { type DocumentCategory, CATEGORY_LABELS, ALL_CATEGORIES } from "@/lib/ai/categories";

type PropertyRecord = {
  id: string;
  name: string;
};

type InboxDocument = {
  id: string;
  file_name: string;
  original_filename: string;
  category: DocumentCategory | null;
  amount: number | null;
  document_date: string | null;
  counterpart: string | null;
  suggested_property_id: string | null;
  ai_confidence: number | null;
  email_from: string | null;
  email_subject: string | null;
};

export default function InboxPage() {
  const [documents, setDocuments] = useState<InboxDocument[]>([]);
  const [properties, setProperties] = useState<PropertyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCategory, setEditCategory] = useState<DocumentCategory>("sonstiges");
  const [editPropertyId, setEditPropertyId] = useState<string>("");

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const [docsRes, propsRes] = await Promise.all([
        fetch("/api/inbox"),
        supabase.from("properties").select("id, name").eq("user_id", user.id),
      ]);

      if (!docsRes.ok) {
        const body = (await docsRes.json()) as { error?: string };
        setError(body.error ?? "Fehler beim Laden.");
      } else {
        setDocuments((await docsRes.json()) as InboxDocument[]);
      }

      setProperties((propsRes.data ?? []) as PropertyRecord[]);
      setIsLoading(false);
    };

    void load();
  }, []);

  const removeFromList = (id: string) =>
    setDocuments((prev) => prev.filter((d) => d.id !== id));

  const handleConfirm = async (doc: InboxDocument) => {
    setActionError(null);
    const res = await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: doc.id,
        status: "confirmed",
        category: doc.category,
        property_id: doc.suggested_property_id,
      }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setActionError(body.error ?? "Bestätigung fehlgeschlagen.");
      return;
    }
    removeFromList(doc.id);
  };

  const handleStartEdit = (doc: InboxDocument) => {
    setActionError(null);
    setEditingId(doc.id);
    setEditCategory(doc.category ?? "sonstiges");
    setEditPropertyId(doc.suggested_property_id ?? "");
  };

  const handleSaveEdit = async (doc: InboxDocument) => {
    setActionError(null);
    const categoryChanged = editCategory !== (doc.category ?? "sonstiges");
    const propertyChanged = (editPropertyId || null) !== doc.suggested_property_id;

    const res = await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: doc.id,
        status: "confirmed",
        category: editCategory,
        property_id: editPropertyId || null,
        ...(categoryChanged || propertyChanged
          ? {
              original_suggestion: { category: doc.category, property_id: doc.suggested_property_id },
              user_correction: { category: editCategory, property_id: editPropertyId || null },
            }
          : {}),
      }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setActionError(body.error ?? "Speichern fehlgeschlagen.");
      return;
    }

    setEditingId(null);
    removeFromList(doc.id);
  };

  const propertyName = (id: string | null) => {
    if (!id) return null;
    return properties.find((p) => p.id === id)?.name ?? null;
  };

  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <p className="text-sm text-slate-500 dark:text-slate-400">Lade Eingang...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          KI-Postfach – Eingang
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Dokumente die auf Bestätigung warten
        </p>

        {error ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        ) : null}

        {actionError ? (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {actionError}
          </p>
        ) : null}

        {documents.length === 0 && !error ? (
          <p className="mt-8 text-sm text-slate-500 dark:text-slate-400">
            Keine Dokumente im Eingang.
          </p>
        ) : null}

        <div className="mt-6 space-y-4">
          {documents.map((doc) => {
            const isEditing = editingId === doc.id;
            const suggestedProperty = propertyName(doc.suggested_property_id);

            return (
              <div
                key={doc.id}
                className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {doc.original_filename ?? doc.file_name}
                    </p>
                    {doc.email_from ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
                        Von: {doc.email_from}
                        {doc.email_subject ? ` · ${doc.email_subject}` : ""}
                      </p>
                    ) : null}
                  </div>
                  {doc.ai_confidence !== null ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                      {Math.round(doc.ai_confidence * 100)}% sicher
                    </span>
                  ) : null}
                </div>

                {!isEditing ? (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {doc.category ? (
                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        {CATEGORY_LABELS[doc.category]}
                      </span>
                    ) : null}
                    {doc.counterpart ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {doc.counterpart}
                      </span>
                    ) : null}
                    {doc.amount !== null ? (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                        {doc.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </span>
                    ) : null}
                    {doc.document_date ? (
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {new Date(doc.document_date).toLocaleDateString("de-DE")}
                      </span>
                    ) : null}
                    {suggestedProperty ? (
                      <span className="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                        {suggestedProperty}
                      </span>
                    ) : null}
                  </div>
                ) : null}

                {isEditing ? (
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Kategorie
                      </label>
                      <select
                        value={editCategory}
                        onChange={(e) => setEditCategory(e.target.value as DocumentCategory)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        {ALL_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {CATEGORY_LABELS[cat]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400">
                        Immobilie
                      </label>
                      <select
                        value={editPropertyId}
                        onChange={(e) => setEditPropertyId(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                      >
                        <option value="">Keine Zuordnung</option>
                        {properties.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4 flex gap-2">
                  {!isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleConfirm(doc)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                      >
                        Bestätigen
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStartEdit(doc)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Korrigieren
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => void handleSaveEdit(doc)}
                        className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-blue-700"
                      >
                        Speichern
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Abbrechen
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
