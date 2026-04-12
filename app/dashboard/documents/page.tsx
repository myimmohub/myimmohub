"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ALLOWED_TYPES, sanitizeFileName } from "@/lib/constants";

type UploadStep = "idle" | "uploading" | "analysing" | "done" | "error";
type DocumentsTab = "eingang" | "alle";
type UploadTab = "file" | "mail" | "csv";

type PropertyRef = { id: string; name: string };
type CategoryOption = { id: string; label: string; typ: string };
type InboundMailbox = {
  alias: string;
  email: string | null;
  is_active: boolean;
  mode: "postmark" | "unconfigured";
  uses_custom_domain: boolean;
};

type DocumentItem = {
  id: string;
  file_name: string;
  original_filename: string | null;
  category: string | null;
  amount: number | null;
  document_date: string | null;
  counterpart: string | null;
  status: string | null;
  extracted_text: string | null;
  property_id: string | null;
  created_at: string;
  properties: PropertyRef | null;
};

type InboxItem = {
  id: string;
  file_name: string;
  original_filename: string;
  category: string | null;
  amount: number | null;
  document_date: string | null;
  counterpart: string | null;
  suggested_property_id: string | null;
  ai_confidence: number | null;
  email_from: string | null;
  email_subject: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  confirmed: "Bestätigt",
  pending_review: "Prüfen",
  pending_analysis: "Wird analysiert",
};

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300",
  pending_review: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
  pending_analysis: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

export default function DocumentsPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [inboxItems, setInboxItems] = useState<InboxItem[]>([]);
  const [properties, setProperties] = useState<PropertyRef[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<DocumentsTab>("alle");
  const [uploadTab, setUploadTab] = useState<UploadTab>("file");
  const [modalOpen, setModalOpen] = useState(false);
  const [uploadStep, setUploadStep] = useState<UploadStep>("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [isFetchingEmails, setIsFetchingEmails] = useState(false);
  const [inboundMailbox, setInboundMailbox] = useState<InboundMailbox | null>(null);
  const [deletingDocumentId, setDeletingDocumentId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [categoryOptions, setCategoryOptions] = useState<CategoryOption[]>([]);

  const [search, setSearch] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterProperty, setFilterProperty] = useState("");

  const loadDocuments = useCallback(async () => {
    setIsLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setIsLoading(false);
      return;
    }

    const [docsRes, inboxRes, mailboxRes, propsRes, categoriesRes] = await Promise.all([
      fetch("/api/documents"),
      fetch("/api/inbox"),
      fetch("/api/settings/inbound-mailbox"),
      supabase.from("properties").select("id, name").eq("user_id", user.id).order("name"),
      fetch("/api/settings/categories"),
    ]);

    if (!docsRes.ok || !inboxRes.ok) {
      const docsBody = docsRes.ok ? null : await docsRes.json().catch(() => null) as { error?: string } | null;
      const inboxBody = inboxRes.ok ? null : await inboxRes.json().catch(() => null) as { error?: string } | null;
      setError(docsBody?.error ?? inboxBody?.error ?? "Dokumente konnten nicht geladen werden.");
    } else {
      setDocuments(await docsRes.json() as DocumentItem[]);
      setInboxItems(await inboxRes.json() as InboxItem[]);
      setError(null);
    }

    if (mailboxRes.ok) {
      setInboundMailbox(await mailboxRes.json() as InboundMailbox);
    }
    if (categoriesRes.ok) {
      setCategoryOptions(await categoriesRes.json() as CategoryOption[]);
    }

    setProperties((propsRes.data ?? []) as PropertyRef[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const tab = new URLSearchParams(window.location.search).get("tab");
    if (tab === "eingang") setActiveTab("eingang");
  }, []);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    return documents.filter((doc) => {
      if (filterCategory && doc.category !== filterCategory) return false;
      if (filterProperty && doc.property_id !== filterProperty) return false;
      if (!query) return true;
      const haystack = `${doc.original_filename ?? doc.file_name} ${doc.counterpart ?? ""} ${doc.extracted_text ?? ""}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [documents, filterCategory, filterProperty, search]);

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
        const body = await res.json().catch(() => null) as { error?: string } | null;
        throw new Error(body?.error ?? "Analyse fehlgeschlagen.");
      }

      setUploadStep("done");
      setToast("Dokument hochgeladen");
      setTimeout(() => {
        setModalOpen(false);
        router.refresh();
      }, 800);
    } catch (uploadErr) {
      setUploadStep("error");
      setUploadError(uploadErr instanceof Error ? uploadErr.message : "Upload fehlgeschlagen.");
    }
  };

  const handleConfirmInboxItem = async (item: InboxItem) => {
    const res = await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: item.id,
        status: "confirmed",
        category: item.category,
        property_id: item.suggested_property_id,
      }),
    });

    if (!res.ok) return;

    setInboxItems((current) => current.filter((doc) => doc.id !== item.id));
    setToast("Dokument bestätigt");
    setTimeout(() => setToast(null), 2000);
  };

  const handleFetchEmails = async () => {
    setIsFetchingEmails(true);
    const res = await fetch("/api/email-fetch", { method: "POST" });
    setIsFetchingEmails(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setToast(body?.error ?? "E-Mails konnten nicht abgerufen werden");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    const body = await res.json() as {
      emails_processed: number;
      attachments_saved: number;
      errors: number;
    };
    if (body.attachments_saved > 0) {
      setToast(`${body.attachments_saved} Anhang/Anhänge übernommen`);
    } else if (body.emails_processed > 0) {
      setToast("E-Mails gelesen, aber keine importierbaren Anhänge gefunden");
    } else {
      setToast("Keine neuen ungelesenen E-Mails gefunden");
    }
    setTimeout(() => setToast(null), 2000);
    await loadDocuments();
  };

  const handleDeleteDocument = async (documentId: string) => {
    setDeletingDocumentId(documentId);
    const res = await fetch(`/api/documents/${documentId}`, { method: "DELETE" });
    setDeletingDocumentId(null);

    if (!res.ok) {
      const body = await res.json().catch(() => null) as { error?: string } | null;
      setToast(body?.error ?? "Dokument konnte nicht gelöscht werden");
      setTimeout(() => setToast(null), 3000);
      return;
    }

    setDocuments((current) => current.filter((doc) => doc.id !== documentId));
    setInboxItems((current) => current.filter((doc) => doc.id !== documentId));
    setDeleteConfirmId(null);
    setToast("Dokument gelöscht");
    setTimeout(() => setToast(null), 2000);
  };

  const propertyName = (propertyId: string | null) =>
    propertyId ? properties.find((property) => property.id === propertyId)?.name ?? null : null;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-6xl space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Dokumente</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Eingang, Archiv und Importe an einem Ort.</p>
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
          >
            <PlusIcon className="h-4 w-4" />
            Hochladen / Importieren
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800/50">
          <button
            type="button"
            onClick={() => setActiveTab("eingang")}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === "eingang"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            Eingang ({inboxItems.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("alle")}
            className={`whitespace-nowrap rounded-md px-3 py-2 text-sm font-medium transition ${
              activeTab === "alle"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                : "text-slate-500 dark:text-slate-400"
            }`}
          >
            Alle Dokumente
          </button>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-3">
            <div className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
            <div className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          </div>
        ) : activeTab === "eingang" ? (
          inboxItems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 py-12 text-center dark:border-slate-700">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <InboxIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
              </div>
              <div>
                <p className="font-medium text-slate-700 dark:text-slate-300">Keine Dokumente im Eingang</p>
                <p className="mt-1 text-sm text-slate-500">Neue Belege aus Upload oder E-Mail erscheinen hier zur Bestätigung.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {inboxItems.map((item) => (
                <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 transition dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {item.original_filename ?? item.file_name}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        {item.email_from ? `${item.email_from}${item.email_subject ? ` · ${item.email_subject}` : ""}` : item.counterpart ?? "Ohne Absender"}
                      </p>
                    </div>
                    <Link
                      href={`/dashboard/documents/${item.id}`}
                      className="text-sm font-medium text-blue-600 transition hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                    >
                      Dokument ansehen
                    </Link>
                  </div>

                  <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
                    <div className="space-y-3">
                      <div className="flex flex-wrap gap-2">
                        {item.category && (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {item.category}
                          </span>
                        )}
                        {item.amount != null && (
                          <span className="inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                            {item.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                          </span>
                        )}
                        {propertyName(item.suggested_property_id) && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                            {propertyName(item.suggested_property_id)}
                          </span>
                        )}
                      </div>

                      <div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>AI Confidence</span>
                          <span>{Math.round((item.ai_confidence ?? 0) * 100)}%</span>
                        </div>
                        <div className="confidence-bar mt-2">
                          <div className="confidence-fill" style={{ width: `${Math.round((item.ai_confidence ?? 0) * 100)}%` }} />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleConfirmInboxItem(item)}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                      >
                        Bestätigen
                      </button>
                      <Link
                        href={`/dashboard/documents/${item.id}`}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Bearbeiten
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )
        ) : (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Suche nach Datei, Absender oder Text..."
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 md:w-80"
              />
              <select
                value={filterCategory}
                onChange={(event) => setFilterCategory(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Alle Kategorien</option>
                {categoryOptions.map((category) => (
                  <option key={category.id} value={category.label}>{category.label}</option>
                ))}
              </select>
              <select
                value={filterProperty}
                onChange={(event) => setFilterProperty(event.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              >
                <option value="">Alle Immobilien</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>{property.name}</option>
                ))}
              </select>
            </div>

            <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:block">
              <table className="min-w-[1080px] w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                    <th className="w-[120px] px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Datum</th>
                    <th className="w-[320px] px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Datei</th>
                    <th className="w-[220px] px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Absender</th>
                    <th className="w-[170px] px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Kategorie</th>
                    <th className="w-[140px] px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Betrag</th>
                    <th className="w-[140px] px-4 py-3 text-left font-medium text-slate-500 dark:text-slate-400">Status</th>
                    <th className="w-[170px] px-4 py-3 text-right font-medium text-slate-500 dark:text-slate-400">Aktion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredDocuments.map((doc) => (
                    <tr key={doc.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{formatDate(doc.document_date ?? doc.created_at)}</td>
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/documents/${doc.id}`} className="font-medium text-slate-900 transition hover:text-blue-600 dark:text-slate-100 dark:hover:text-blue-400">
                          {doc.original_filename ?? doc.file_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{doc.counterpart ?? "—"}</td>
                      <td className="px-4 py-3">
                        {doc.category ? (
                          <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                            {doc.category}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-900 dark:text-slate-100">
                        {doc.amount == null ? "—" : doc.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </td>
                      <td className="px-4 py-3">
                        {doc.status ? (
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.status] ?? STATUS_COLORS.pending_analysis}`}>
                            {STATUS_LABELS[doc.status] ?? doc.status}
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Link
                            href={`/dashboard/documents/${doc.id}`}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Öffnen
                          </Link>
                          {deleteConfirmId === doc.id ? (
                            <>
                              <button
                                type="button"
                                onClick={() => void handleDeleteDocument(doc.id)}
                                disabled={deletingDocumentId === doc.id}
                                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                              >
                                {deletingDocumentId === doc.id ? "Löscht..." : "Ja, löschen"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setDeleteConfirmId(null)}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                              >
                                Abbrechen
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setDeleteConfirmId(doc.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                            >
                              Löschen
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 md:hidden">
              {filteredDocuments.map((doc) => (
                <Link
                  key={doc.id}
                  href={`/dashboard/documents/${doc.id}`}
                  className="block rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{doc.original_filename ?? doc.file_name}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{formatDate(doc.document_date ?? doc.created_at)}</p>
                    </div>
                    {doc.status && (
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_COLORS[doc.status] ?? STATUS_COLORS.pending_analysis}`}>
                        {STATUS_LABELS[doc.status] ?? doc.status}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {doc.category && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                        {doc.category}
                      </span>
                    )}
                    {doc.amount != null && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                        {doc.amount.toLocaleString("de-DE", { style: "currency", currency: "EUR" })}
                      </span>
                    )}
                  </div>
                  <div className="mt-4 flex gap-2">
                    {deleteConfirmId === doc.id ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDocument(doc.id)}
                          disabled={deletingDocumentId === doc.id}
                          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700 disabled:opacity-60"
                        >
                          {deletingDocumentId === doc.id ? "Löscht..." : "Ja, löschen"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteConfirmId(null)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          Abbrechen
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.preventDefault();
                          setDeleteConfirmId(doc.id);
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950/40"
                      >
                        Löschen
                      </button>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {toast && (
        <div className="toast-enter fixed bottom-4 right-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 shadow-lg dark:bg-emerald-950/40 dark:text-emerald-300">
          {toast}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-xl rounded-xl border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Importieren</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Datei, E-Mail oder CSV in denselben Dokumentenfluss aufnehmen.</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Schließen
              </button>
            </div>

            <div className="mt-5 flex gap-1 rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-800/50">
              {[
                { id: "file", label: "Datei hochladen" },
                { id: "mail", label: "Per E-Mail" },
                { id: "csv", label: "CSV Import" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setUploadTab(tab.id as UploadTab)}
                  className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition ${
                    uploadTab === tab.id
                      ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-slate-100"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {uploadTab === "file" && (
              <div className="mt-5 space-y-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center gap-3 rounded-xl border-2 border-dashed border-slate-200 py-12 text-center transition hover:border-blue-300 dark:border-slate-700"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    <UploadIcon className="h-5 w-5 text-slate-400 dark:text-slate-500" />
                  </div>
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-300">Datei auswählen</p>
                    <p className="mt-1 text-sm text-slate-500">PDF, JPG oder PNG werden direkt analysiert.</p>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ALLOWED_TYPES.join(",")}
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFileSelected(file);
                  }}
                />
                {uploadStep !== "idle" && (
                  <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
                    {uploadStep === "uploading" && "Datei wird hochgeladen..."}
                    {uploadStep === "analysing" && "Dokument wird analysiert..."}
                    {uploadStep === "done" && "Upload abgeschlossen."}
                    {uploadStep === "error" && (uploadError ?? "Upload fehlgeschlagen.")}
                  </div>
                )}
              </div>
            )}

            {uploadTab === "mail" && (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Persönliches Postfach</p>
                  <div className="mt-2 flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                      {inboundMailbox?.email ?? "Noch nicht konfiguriert"}
                    </p>
                    {inboundMailbox?.email && (
                      <button
                        type="button"
                        onClick={() => void navigator.clipboard.writeText(inboundMailbox.email ?? "")}
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                      >
                        Kopieren
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                    {inboundMailbox?.mode === "postmark"
                      ? inboundMailbox.uses_custom_domain
                        ? "Mails an diese Adresse werden automatisch in den Dokumenteneingang übernommen."
                        : "Postmark ist aktiv. Du kannst diese persönliche Adresse sofort nutzen; später kannst du optional noch eine eigene Domain darauf legen."
                      : "Richte zuerst Postmark ein, dann erscheint hier automatisch die persönliche Adresse."}
                  </p>
                </div>
                {process.env.NEXT_PUBLIC_GMAIL_USER && (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Legacy IMAP Abruf</p>
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                      Solange Postmark noch nicht vollständig live ist, kannst du den bisherigen Gmail-Abruf weiter als Fallback verwenden.
                    </p>
                    <button
                      type="button"
                      onClick={() => void handleFetchEmails()}
                      disabled={isFetchingEmails}
                      className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      {isFetchingEmails ? "Abruf läuft..." : "Gmail jetzt abrufen"}
                    </button>
                  </div>
                )}
              </div>
            )}

            {uploadTab === "csv" && (
              <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
                <p className="text-sm text-slate-500 dark:text-slate-400">CSV-Importe für Kontoauszüge laufen weiterhin über den Banking-Bereich.</p>
                <Link
                  href="/dashboard/banking/import"
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
                >
                  Zum CSV Import
                </Link>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("de-DE");
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 14a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm7-11a1 1 0 011 1v6.586l2.293-2.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 111.414-1.414L9 10.586V4a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  );
}

function InboxIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 3a2 2 0 00-2 2v8a2 2 0 002 2h4.586a1 1 0 01.707.293l1 1a1 1 0 001.414 0l1-1A1 1 0 0112.414 15H17a2 2 0 002-2V5a2 2 0 00-2-2H3zm3 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  );
}
