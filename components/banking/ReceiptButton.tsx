"use client";

import { useEffect, useRef, useState } from "react";

type Receipt = { id: string; filename: string };

type UnlinkedReceipt = {
  id: string;
  filename: string;
  extracted_amount: number | null;
  extracted_date: string | null;
  extracted_counterpart: string | null;
  created_at: string;
};

type Props = {
  transactionId: string;
  receipt: Receipt | null;
  onLinked: () => void;
};

function truncate(s: string, max = 20): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

export default function ReceiptButton({ transactionId, receipt, onLinked }: Props) {
  // Popover for linked receipt
  const [popoverOpen, setPopoverOpen] = useState(false);
  // Modal for no-receipt state
  const [modalOpen, setModalOpen] = useState(false);

  const [unlinked, setUnlinked] = useState<UnlinkedReceipt[]>([]);
  const [unlinkedLoading, setUnlinkedLoading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);

  const popoverRef = useRef<HTMLDivElement>(null);

  // Close popover on outside click
  useEffect(() => {
    if (!popoverOpen) return;
    function handler(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  async function openModal() {
    setModalOpen(true);
    setError(null);
    setSelectedFile(null);
    setUnlinkedLoading(true);
    try {
      const res = await fetch("/api/receipts");
      if (res.ok) {
        setUnlinked((await res.json()) as UnlinkedReceipt[]);
      }
    } finally {
      setUnlinkedLoading(false);
    }
  }

  async function openSignedUrl(receiptId: string) {
    setPopoverOpen(false);
    try {
      const res = await fetch(`/api/receipts/${receiptId}`);
      if (!res.ok) { setError("Beleg konnte nicht geöffnet werden."); return; }
      const { signedUrl } = (await res.json()) as { signedUrl: string };
      window.open(signedUrl, "_blank");
    } catch {
      setError("Beleg konnte nicht geöffnet werden.");
    }
  }

  async function removeReceipt(receiptId: string) {
    setPopoverOpen(false);
    try {
      await fetch(`/api/receipts/${receiptId}`, { method: "DELETE" });
      onLinked();
    } catch {
      setError("Beleg konnte nicht entfernt werden.");
    }
  }

  async function handleUpload() {
    if (!selectedFile) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", selectedFile);
      fd.append("transaction_id", transactionId);
      const res = await fetch("/api/receipts", { method: "POST", body: fd });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Upload fehlgeschlagen.");
        return;
      }
      setModalOpen(false);
      onLinked();
    } catch {
      setError("Upload fehlgeschlagen.");
    } finally {
      setUploading(false);
    }
  }

  async function handleLinkExisting(unlinkedReceiptId: string) {
    setLinkingId(unlinkedReceiptId);
    setError(null);
    try {
      const res = await fetch(`/api/receipts/${unlinkedReceiptId}/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transaction_id: transactionId }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        setError(body.error ?? "Verknüpfen fehlgeschlagen.");
        return;
      }
      setModalOpen(false);
      onLinked();
    } catch {
      setError("Verknüpfen fehlgeschlagen.");
    } finally {
      setLinkingId(null);
    }
  }

  // ── Linked state ──────────────────────────────────────────────────────────
  if (receipt) {
    return (
      <div className="relative" ref={popoverRef}>
        <button
          type="button"
          onClick={() => setPopoverOpen((o) => !o)}
          title={receipt.filename}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
        >
          <span>📎</span>
          <span>{truncate(receipt.filename)}</span>
        </button>

        {popoverOpen && (
          <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            <button
              type="button"
              onClick={() => void openSignedUrl(receipt.id)}
              className="block w-full px-3 py-2 text-left text-sm text-zinc-700 transition hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-700 rounded-t-xl"
            >
              Beleg anzeigen
            </button>
            <button
              type="button"
              onClick={() => void removeReceipt(receipt.id)}
              className="block w-full px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30 rounded-b-xl"
            >
              Beleg entfernen
            </button>
          </div>
        )}

        {error && (
          <p className="absolute right-0 top-full mt-1 z-50 rounded bg-red-50 px-2 py-1 text-xs text-red-600 dark:bg-red-950/40 dark:text-red-400 whitespace-nowrap">
            {error}
          </p>
        )}
      </div>
    );
  }

  // ── Unlinked state ────────────────────────────────────────────────────────
  return (
    <>
      <button
        type="button"
        onClick={() => void openModal()}
        className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
      >
        <span>📎</span>
        <span>Beleg +</span>
      </button>

      {/* Modal overlay */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-800"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
                Beleg verknüpfen
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="rounded-md p-1 text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-200"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5 px-5 py-4">
              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400">
                  {error}
                </p>
              )}

              {/* Upload new file */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Neuen Beleg hochladen
                </p>
                <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-sm text-zinc-500 transition hover:border-zinc-400 hover:bg-zinc-100 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-500">
                  <span className="text-2xl">📄</span>
                  {selectedFile
                    ? <span className="text-zinc-700 dark:text-zinc-300 text-center break-all">{selectedFile.name}</span>
                    : <span>PDF, JPG oder PNG auswählen</span>}
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(e) => {
                      setSelectedFile(e.target.files?.[0] ?? null);
                      setError(null);
                    }}
                  />
                </label>
                {selectedFile && (
                  <button
                    type="button"
                    onClick={() => void handleUpload()}
                    disabled={uploading}
                    className="mt-3 w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
                  >
                    {uploading ? "Wird hochgeladen…" : "Hochladen & verknüpfen"}
                  </button>
                )}
              </div>

              {/* Existing unlinked receipts */}
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Vorhandene Belege
                </p>
                {unlinkedLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-600 dark:border-zinc-600 dark:border-t-zinc-300" />
                  </div>
                ) : unlinked.length === 0 ? (
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">Keine unverlinkten Belege vorhanden.</p>
                ) : (
                  <ul className="max-h-48 overflow-y-auto divide-y divide-zinc-100 dark:divide-zinc-700 rounded-xl border border-zinc-200 dark:border-zinc-700">
                    {unlinked.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-800 dark:text-zinc-200">
                            {r.filename}
                          </p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {r.extracted_amount !== null
                              ? new Intl.NumberFormat("de-DE", {
                                  style: "currency",
                                  currency: "EUR",
                                }).format(r.extracted_amount)
                              : "—"}
                            {r.extracted_date ? ` · ${r.extracted_date}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleLinkExisting(r.id)}
                          disabled={linkingId === r.id}
                          className="shrink-0 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-700"
                        >
                          {linkingId === r.id ? "…" : "Verknüpfen"}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
