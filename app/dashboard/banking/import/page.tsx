"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { parseCSV, type ColumnMapping } from "@/lib/banking/parseCSV";

// ── Datenbankfelder die gemappt werden können ────────────────────────────────
const DB_FIELDS = [
  { key: "date",        label: "Datum",                   required: true  },
  { key: "amount",      label: "Betrag",                  required: true  },
  { key: "description", label: "Verwendungszweck",        required: false },
  { key: "counterpart", label: "Auftraggeber / Empfänger", required: false },
] as const;

type DbFieldKey = (typeof DB_FIELDS)[number]["key"];
type Mapping = Partial<ColumnMapping>;

// ── Häufige Spaltennamen deutscher Banken für Auto-Mapping ────────────────────
const AUTO_MAP: Record<DbFieldKey, string[]> = {
  date:        ["buchungsdatum", "datum", "date", "valutadatum", "wertstellung", "buchungstag"],
  amount:      ["betrag", "amount", "umsatz", "betrag eur", "betrag (eur)", "umsatz eur"],
  description: ["verwendungszweck", "beschreibung", "description", "buchungstext", "betreff"],
  counterpart: ["auftraggeber / begünstigter", "auftraggeber/begünstigter", "empfänger",
                "auftraggeber", "begünstigter", "name", "kontoinhaber", "beguenstigter",
                "name zahlungsbeteiligter", "zahlungsbeteiligter"],
};

type ParsedCsv = {
  headers: string[];
  previewRows: Record<string, string>[];
  totalRows: number;
};

type ImportResult = {
  inserted: number;
  skipped: number;
  errors: { row: number; error: string }[];
};

type Step = "upload" | "mapping" | "importing" | "done";

// ── Hilfsfunktion: Auto-Mapping ───────────────────────────────────────────────
function autoDetectMapping(headers: string[]): Mapping {
  const lower = headers.map((h) => h.toLowerCase().trim());
  const result: Mapping = {};
  for (const field of DB_FIELDS) {
    const candidates = AUTO_MAP[field.key];
    // Iterate candidates in priority order (e.g. "verwendungszweck" before "buchungstext")
    for (const candidate of candidates) {
      const idx = lower.indexOf(candidate);
      if (idx !== -1) {
        result[field.key] = headers[idx];
        break;
      }
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function BankingImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [propertyId, setPropertyId] = useState("");
  const [properties, setProperties] = useState<{ id: string; name: string }[]>([]);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [aiCategorizing, setAiCategorizing] = useState(false);
  const [aiCategorized, setAiCategorized] = useState<number | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // Properties laden für optionale Zuordnung
  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("properties")
        .select("id, name")
        .eq("user_id", user.id)
        .order("name");
      setProperties(data ?? []);
    };
    void load();
  }, []);

  // ── Schritt 1: Datei einlesen — nur für Header + Vorschau (noch kein Mapping) ─
  const handleFile = (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setParseError("Bitte eine CSV-Datei hochladen.");
      return;
    }
    setParseError(null);
    setFileName(file.name);
    setCsvFile(file);

    // Nur papaparse für Vorschau — echtes Parsen passiert erst beim Import via parseCSV()
    import("papaparse").then(({ default: Papa }) => {
      Papa.parse<Record<string, string>>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (result) => {
          if (!result.meta.fields?.length) {
            setParseError("Die Datei enthält keine Spaltenüberschriften.");
            return;
          }
          const headers = result.meta.fields;
          setParsed({ headers, previewRows: result.data.slice(0, 5), totalRows: result.data.length });
          setMapping(autoDetectMapping(headers));
          setStep("mapping");
        },
        error: (err: { message: string }) => {
          setParseError(`CSV konnte nicht gelesen werden: ${err.message}`);
        },
      });
    }).catch(() => setParseError("Interner Fehler beim Laden des CSV-Parsers."));
  };

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Schritt 3: Parsen + Import ──────────────────────────────────────────────
  const handleImport = async () => {
    if (!csvFile || !mapping.date || !mapping.amount) return;
    setImportError(null);
    setStep("importing");

    // parseCSV() läuft im Browser: wandelt Datum + Betrag um, filtert Fehlerzeilen
    let parseResult;
    try {
      parseResult = await parseCSV(csvFile, mapping as ColumnMapping);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "CSV konnte nicht verarbeitet werden.");
      setStep("mapping");
      return;
    }

    if (parseResult.transactions.length === 0) {
      setImportError("Keine gültigen Transaktionen gefunden. Bitte Spalten-Zuordnung prüfen.");
      setStep("mapping");
      return;
    }

    // API bekommt bereits aufbereitete Transaktionen — kein Parsen mehr server-seitig
    const res = await fetch("/api/banking/import-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transactions: parseResult.transactions,
        propertyId: propertyId || null,
        parseErrors: parseResult.errors,
      }),
    });

    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setImportError(body.error ?? "Import fehlgeschlagen.");
      setStep("mapping");
      return;
    }

    const result = (await res.json()) as ImportResult;
    setImportResult(result);
    setStep("done");
  };

  const reset = () => {
    setStep("upload");
    setCsvFile(null);
    setParsed(null);
    setMapping({});
    setPropertyId("");
    setFileName("");
    setImportResult(null);
    setParseError(null);
    setImportError(null);
  };

  const canImport =
    DB_FIELDS.filter((f) => f.required).every((f) => !!mapping[f.key]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="mx-auto w-full max-w-3xl">

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Kontoauszug importieren
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            CSV-Export deiner Bank hochladen und Spalten zuordnen
          </p>
        </div>

        {/* Fortschrittsanzeige */}
        <div className="mb-8 flex items-center gap-2">
          {(["upload", "mapping", "done"] as const).map((s, i) => {
            const labels = ["Datei", "Zuordnung", "Fertig"];
            const active = step === s || (step === "importing" && s === "mapping") || (step === "done" && s === "done");
            const done = (i === 0 && step !== "upload") || (i === 1 && step === "done");
            return (
              <div key={s} className="flex items-center gap-2">
                {i > 0 && <div className="h-px w-8 bg-slate-300 dark:bg-slate-700" />}
                <div className="flex items-center gap-1.5">
                  <div className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold transition ${
                    done
                      ? "bg-emerald-500 text-white"
                      : active
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                  }`}>
                    {done ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : i + 1}
                  </div>
                  <span className={`text-sm ${active ? "font-medium text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
                    {labels[i]}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Schritt 1: Upload ── */}
        {step === "upload" && (
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div
              className={`flex cursor-pointer flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed py-14 transition ${
                isDragging
                  ? "border-slate-500 bg-slate-50 dark:border-slate-400 dark:bg-slate-800/50"
                  : "border-slate-200 bg-slate-50 hover:border-slate-400 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/30 dark:hover:border-slate-500"
              }`}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-200 dark:bg-slate-700">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  CSV-Datei hochladen
                </p>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Klicken oder Datei hierher ziehen · nur .csv
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={onFileInput}
              />
            </div>

            {parseError && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {parseError}
              </p>
            )}

            <div className="mt-4 rounded-lg bg-slate-50 px-4 py-3 dark:bg-slate-800/40">
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Unterstützte Formate</p>
              <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                CSV-Exporte aller deutschen Banken (Komma- oder Semikolon-getrennt),
                Datum als DD.MM.YYYY oder YYYY-MM-DD, Beträge im deutschen oder englischen Format.
              </p>
            </div>
          </div>
        )}

        {/* ── Schritt 2: Mapping ── */}
        {(step === "mapping" || step === "importing") && parsed && (
          <div className="space-y-6">

            {/* Dateiinfo */}
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">{fileName}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {parsed.totalRows} Zeilen · {parsed.headers.length} Spalten
                </p>
              </div>
              <button
                type="button"
                onClick={reset}
                className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Andere Datei
              </button>
            </div>

            {/* Vorschau */}
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <div className="border-b border-slate-100 px-5 py-3 dark:border-slate-800">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Vorschau — erste {parsed.previewRows.length} Zeilen
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/60">
                      {parsed.headers.map((h) => (
                        <th key={h} className="whitespace-nowrap px-4 py-2 text-left font-medium text-slate-500 dark:text-slate-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {parsed.previewRows.map((row, i) => (
                      <tr key={i}>
                        {parsed.headers.map((h) => (
                          <td key={h} className="max-w-[180px] truncate whitespace-nowrap px-4 py-2 text-slate-600 dark:text-slate-400">
                            {row[h] ?? ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Spalten-Mapping */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Spalten zuordnen
              </h2>
              <div className="space-y-3">
                {DB_FIELDS.map((field) => (
                  <div key={field.key} className="grid grid-cols-2 items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        {field.label}
                        {field.required && (
                          <span className="ml-1 text-red-500">*</span>
                        )}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {field.key === "date" && "z. B. 31.12.2024 oder 2024-12-31"}
                        {field.key === "amount" && "Negativ = Ausgabe, Positiv = Einnahme"}
                        {field.key === "description" && "Buchungstext / Zahlungsreferenz"}
                        {field.key === "counterpart" && "Name des Senders oder Empfängers"}
                      </p>
                    </div>
                    <select
                      value={mapping[field.key] ?? ""}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field.key]: e.target.value || undefined,
                        }))
                      }
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">— nicht importieren —</option>
                      {parsed.headers.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>

              {/* Immobilien-Zuordnung */}
              {properties.length > 0 && (
                <div className="mt-5 border-t border-slate-100 pt-5 dark:border-slate-800">
                  <div className="grid grid-cols-2 items-center gap-4">
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Immobilie</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">Alle Transaktionen dieser Datei zuordnen (optional)</p>
                    </div>
                    <select
                      value={propertyId}
                      onChange={(e) => setPropertyId(e.target.value)}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                    >
                      <option value="">Keine Zuordnung</option>
                      {properties.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            {importError && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {importError}
              </p>
            )}

            {/* Import-Button */}
            <button
              type="button"
              onClick={() => void handleImport()}
              disabled={!canImport || step === "importing"}
              className="w-full rounded-lg bg-blue-600 py-3 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {step === "importing" ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  Importiere {parsed.totalRows} Zeilen…
                </span>
              ) : (
                `${parsed.totalRows} Transaktionen importieren`
              )}
            </button>

            {!canImport && (
              <p className="text-center text-xs text-slate-400 dark:text-slate-500">
                Bitte mindestens <strong>Datum</strong> und <strong>Betrag</strong> zuordnen.
              </p>
            )}
          </div>
        )}

        {/* ── Schritt 3: Ergebnis ── */}
        {step === "done" && importResult && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              </div>

              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Import abgeschlossen</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  {importResult.inserted > 0
                    ? `${importResult.inserted} neue Transaktion${importResult.inserted !== 1 ? "en" : ""} gespeichert`
                    : "Keine neuen Transaktionen — alle bereits vorhanden"}
                  {importResult.skipped > 0 &&
                    ` · ${importResult.skipped} übersprungen (bereits importiert)`}
                </p>
              </div>

              <div className="mt-2 flex w-full justify-center gap-4 sm:max-w-xs">
                <div className="flex-1 rounded-xl bg-emerald-50 py-4 text-center dark:bg-emerald-950/30">
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importResult.inserted}</p>
                  <p className="mt-0.5 text-xs text-emerald-600/70 dark:text-emerald-400/70">Importiert</p>
                </div>
                <div className="flex-1 rounded-xl bg-slate-100 py-4 text-center dark:bg-slate-800">
                  <p className="text-2xl font-bold text-slate-600 dark:text-slate-300">{importResult.skipped}</p>
                  <p className="mt-0.5 text-xs text-slate-400">Übersprungen</p>
                </div>
              </div>

              {importResult.errors.length > 0 && (
                <div className="w-full rounded-lg bg-yellow-50 px-4 py-3 text-left dark:bg-yellow-950/30">
                  <p className="mb-2 text-xs font-semibold text-yellow-700 dark:text-yellow-400">
                    {importResult.errors.length} Zeile{importResult.errors.length !== 1 ? "n" : ""} konnten nicht importiert werden:
                  </p>
                  <ul className="space-y-1">
                    {importResult.errors.slice(0, 5).map((e) => (
                      <li key={e.row} className="text-xs text-yellow-700 dark:text-yellow-400">
                        Zeile {e.row}: {e.error}
                      </li>
                    ))}
                    {importResult.errors.length > 5 && (
                      <li className="text-xs text-yellow-600 dark:text-yellow-500">
                        … und {importResult.errors.length - 5} weitere
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>

            {/* KI-Kategorisierung direkt nach Import */}
            {importResult.inserted > 0 && (
              <div className="mt-6 w-full rounded-xl border border-purple-200 bg-purple-50 p-4 dark:border-purple-800/50 dark:bg-purple-950/30">
                <p className="text-sm font-medium text-purple-800 dark:text-purple-300">
                  Transaktionen automatisch kategorisieren?
                </p>
                <p className="mt-0.5 text-xs text-purple-600 dark:text-purple-400">
                  Die KI ordnet jeder Transaktion automatisch eine Kategorie zu. Du kannst die Vorschläge danach prüfen und korrigieren.
                </p>
                {aiCategorized !== null && (
                  <p className="mt-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    ✓ {aiCategorized} Transaktion{aiCategorized !== 1 ? "en" : ""} kategorisiert
                  </p>
                )}
                {aiError && (
                  <div className="mt-2 rounded bg-red-50 px-3 py-2 dark:bg-red-950/40">
                    <p className="font-mono text-xs text-red-700 dark:text-red-300 break-all">{aiError}</p>
                  </div>
                )}
                {aiCategorized === null && (
                  <button
                    type="button"
                    disabled={aiCategorizing}
                    onClick={async () => {
                      setAiCategorizing(true);
                      setAiError(null);
                      const res = await fetch("/api/banking/categorize", { method: "POST" });
                      setAiCategorizing(false);
                      const body = (await res.json()) as { categorized: number; errors: number; firstError: string | null };
                      setAiCategorized(body.categorized);
                      if (body.errors > 0 && body.firstError) {
                        setAiError(`${body.errors} Fehler · ${body.firstError}`);
                      }
                    }}
                    className="mt-3 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-purple-700 disabled:opacity-60"
                  >
                    {aiCategorizing ? (
                      <>
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                        Kategorisiere…
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                        </svg>
                        Jetzt KI-kategorisieren
                      </>
                    )}
                  </button>
                )}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={reset}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Neuen Import starten
              </button>
              <button
                type="button"
                onClick={() => router.push(aiCategorized !== null ? "/dashboard/banking/review" : "/dashboard/banking")}
                className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
              >
                {aiCategorized !== null ? "Kategorien prüfen" : "Transaktionen anzeigen"}
              </button>
            </div>
          </div>
        )}

      </section>
    </main>
  );
}
