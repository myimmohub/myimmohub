/**
 * Pure-Function-Helpers für den Tax-PDF-Import.
 *
 * Vorher: Alles inline in `app/api/tax/import/route.ts` (~1300 Zeilen).
 * Hier extrahiert sind ausschließlich Funktionen ohne Seiteneffekte —
 * keine DB-Calls, keine fetch-Calls, keine I/O. Damit lassen sich die
 * Sub-Schritte (JSON-Extraktion aus Markdown-Fence, deutsche Zahlen-
 * Parsing, ELSTER-Block-Erkennung) isoliert testen.
 *
 * Re-Import-Pfad: `app/api/tax/import/route.ts` re-exportiert die hier
 * definierten Funktionen, damit Aufrufer (z.B. ältere Tests) den bisherigen
 * Pfad weiternutzen können.
 */
import { normalizePartnerName } from "@/lib/tax/partnerNormalization";

// ── Domain-Typen ─────────────────────────────────────────────────────────────
//
// Die Typen sind absichtlich schmaler als die DB-Schemas — wir wollen nur
// das, was aus dem PDF rauskommt, modellieren. Das vollständige tax_data-Schema
// lebt weiterhin in `types/tax`.

export type ImportedExpenseBlock = {
  key: string;
  label: string;
  amount: number | null;
  detail: string | null;
};

export type ImportedDepreciationItem = {
  label: string;
  item_type: "building" | "outdoor" | "movable_asset";
  gross_annual_amount: number | null;
  apply_rental_ratio: boolean;
};

export type ImportedMaintenanceDistribution = {
  label: string;
  source_year: number | null;
  total_amount: number | null;
  classification: "maintenance_expense" | "production_cost" | "depreciation";
  deduction_mode: "immediate" | "distributed";
  distribution_years: number | null;
  current_year_share_override: number | null;
  apply_rental_ratio: boolean;
  note: string | null;
};

export type ParsedElsterTextData = {
  acquisition_date: string | null;
  depreciation_building: number | null;
  depreciation_fixtures: number | null;
  expense_blocks: ImportedExpenseBlock[];
  maintenance_distributions: ImportedMaintenanceDistribution[];
};

// ── Kleine Helfer ────────────────────────────────────────────────────────────

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizePdfText(value: string) {
  return value
    .replace(/ /g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Value-Unwrapper für Claude-API-Antworten ─────────────────────────────────
//
// Claude liefert Werte mal als plainen Wert (z.B. 12.625), mal als
// `{ value: 12.625, confidence: "high" }`. Der Unwrapper kapselt diese
// Detail-Logik, damit der Rest dieses Moduls beide Fälle homogen verarbeitet.

export function unwrapExtractedValue(value: unknown): unknown {
  if (value && typeof value === "object" && "value" in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).value;
  }
  return value;
}

export function asNullableString(value: unknown): string | null {
  const unwrapped = unwrapExtractedValue(value);
  if (unwrapped == null || unwrapped === "") return null;
  return String(unwrapped);
}

/**
 * Deutsches Zahlenformat parsen.
 *
 * Beispiele:
 *   "1.234,56"   → 1234.56
 *   " 12.625 "   → 12625    (Tausenderpunkt vor 3 Ziffern)
 *   "12,5"       → 12.5
 *   "0,00"       → 0
 *   ""           → null
 *   null         → null
 */
export function parseGermanAmount(value: string | null | undefined) {
  if (!value) return null;
  const normalized = value
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function asNullableNumber(value: unknown): number | null {
  const unwrapped = unwrapExtractedValue(value);
  if (unwrapped == null || unwrapped === "") return null;
  if (typeof unwrapped === "number") return Number.isFinite(unwrapped) ? unwrapped : null;
  if (typeof unwrapped === "string") {
    return parseGermanAmount(unwrapped);
  }
  return null;
}

export function asNullableInteger(value: unknown): number | null {
  const num = asNullableNumber(value);
  return num == null ? null : Math.trunc(num);
}

export function asNullableBoolean(value: unknown): boolean | null {
  const unwrapped = unwrapExtractedValue(value);
  if (unwrapped == null || unwrapped === "") return null;
  if (typeof unwrapped === "boolean") return unwrapped;
  if (typeof unwrapped === "number") return unwrapped !== 0;
  if (typeof unwrapped === "string") {
    const normalized = unwrapped.trim().toLowerCase();
    if (["true", "ja", "yes", "1"].includes(normalized)) return true;
    if (["false", "nein", "no", "0"].includes(normalized)) return false;
  }
  return null;
}

/**
 * Datum normalisieren auf `YYYY-MM-DD` (Europe/Berlin).
 *
 * Akzeptiert:
 *   - ISO `YYYY-MM-DD` und `YYYY-MM-DDTHH:MM:SS...`
 *   - Deutsch `DD.MM.YYYY` und `D.M.YYYY`
 *   - Sonst: JS-Date-Parse (mit Zeitzone Europe/Berlin)
 */
export function asNullableDateString(value: unknown): string | null {
  const raw = asNullableString(value);
  if (!raw) return null;

  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const isoLikeMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})[T\s]/);
  if (isoLikeMatch) return `${isoLikeMatch[1]}-${isoLikeMatch[2]}-${isoLikeMatch[3]}`;

  const deMatch = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (deMatch) {
    const day = deMatch[1].padStart(2, "0");
    const month = deMatch[2].padStart(2, "0");
    return `${deMatch[3]}-${month}-${day}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return raw;
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Berlin",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(parsed);
}

// ── JSON-Extraktion aus Claude-API-Antwort ───────────────────────────────────

/**
 * Parst Claude-Antwort, die ein JSON-Objekt enthält. Toleriert Markdown-
 * Code-Fences (` ```json ... ``` `), Zeilenumbrüche und führt im Notfall
 * einen Substring-Trim auf das erste/letzte `{...}` durch.
 *
 * Wirft, wenn keine JSON-Struktur extrahierbar ist.
 */
export function extractJsonText(raw: string) {
  let jsonStr = raw.trim();
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
  }

  try {
    return JSON.parse(jsonStr) as Record<string, unknown>;
  } catch {
    const firstBrace = jsonStr.indexOf("{");
    const lastBrace = jsonStr.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return JSON.parse(jsonStr.slice(firstBrace, lastBrace + 1)) as Record<string, unknown>;
    }
    throw new Error("Antwort enthielt kein parsebares JSON.");
  }
}

// ── ELSTER-Block-Erkennung aus rohem PDF-OCR-Text ────────────────────────────

/**
 * Sucht in OCR-Text die offiziellen ELSTER-Block-Zeilen (Z.35, Z.45, Z.57-72,
 * Z.75, Z.78, Z.82) und baut daraus expense_blocks +
 * maintenance_distributions auf.
 *
 * Wird zusätzlich zum direkten Claude-JSON-Output verwendet, weil im
 * Steuerbescheid-PDF die offiziellen ELSTER-Werte oft präziser sind als
 * Claudes Pseudo-Aggregate.
 */
export function parseOfficialElsterValuesFromText(args: {
  text: string;
  taxYear: number;
}): ParsedElsterTextData {
  const flat = normalizePdfText(args.text);
  const taxYear = args.taxYear;

  const parseAmount = (pattern: RegExp) => {
    const match = flat.match(pattern);
    return parseGermanAmount(match?.[1] ?? null);
  };

  const acquisitionDate =
    flat.match(/Angeschafft am (\d{2}\.\d{2}\.\d{4})/i)?.[1] ??
    flat.match(/Anschaffungsdatum (\d{2}\.\d{2}\.\d{4})/i)?.[1] ??
    null;

  const expenseBlocks: ImportedExpenseBlock[] = [];
  const pushExpenseBlock = (key: string, label: string, amount: number | null, detail: string | null = null) => {
    if (amount == null || amount <= 0) return;
    expenseBlocks.push({ key, label, amount: round2(amount), detail });
  };

  const allocatedCosts = parseAmount(/75 Abzugsfähige Werbungskosten ([\d.,]+)/i);
  const nonAllocatedCosts = parseAmount(/78 Abzugsfähige Werbungskosten ([\d.,]+)/i);
  const otherExpenses = parseAmount(/82 Abzugsfähige Werbungskosten ([\d.,]+)/i);
  const maintenanceCurrentDeductible = parseAmount(/60 Abzugsfähige Werbungskosten ([\d.,]+)/i);
  const maintenanceCurrentGrossShare = parseAmount(/59 Gesamtbetrag in EUR, Ct ([\d.,]+)/i);
  const maintenanceCurrentTotal = parseAmount(/57 Gesamtaufwand 20\d{2} ([\d.,]+)/i);
  const maintenance2022Gross = parseAmount(/68 Gesamtbetrag in EUR, Ct ([\d.,]+)/i);
  const maintenance2022Deductible = parseAmount(/69 Abzugsfähige Werbungskosten ([\d.,]+)/i);
  const maintenance2023Gross = parseAmount(/71 Gesamtbetrag in EUR, Ct ([\d.,]+)/i);
  const maintenance2023Deductible = parseAmount(/72 Abzugsfähige Werbungskosten ([\d.,]+)/i);

  pushExpenseBlock(
    "allocated_costs",
    "Umlagefähige laufende Kosten",
    allocatedCosts,
    "Aus offiziellem ELSTER-Block Zeile 75 übernommen",
  );
  pushExpenseBlock(
    "non_allocated_costs",
    "Nicht umlegbare Objektkosten",
    nonAllocatedCosts,
    "Aus offiziellem ELSTER-Block Zeile 78 übernommen",
  );
  pushExpenseBlock(
    "other_expenses",
    "Sonstige Werbungskosten",
    otherExpenses,
    "Aus offiziellem ELSTER-Block Zeile 82 übernommen",
  );
  pushExpenseBlock(
    `maintenance_${taxYear}`,
    `Verteilter Erhaltungsaufwand ${taxYear}`,
    maintenanceCurrentDeductible,
    "Aus offiziellem ELSTER-Block Zeile 60 übernommen",
  );
  pushExpenseBlock(
    "maintenance_prior_year_2022",
    "Verteilter Erhaltungsaufwand aus 2022",
    maintenance2022Deductible,
    "Aus offiziellem ELSTER-Block Zeile 69 übernommen",
  );
  pushExpenseBlock(
    "maintenance_prior_year_2023",
    "Verteilter Erhaltungsaufwand aus 2023",
    maintenance2023Deductible,
    "Aus offiziellem ELSTER-Block Zeile 72 übernommen",
  );

  const maintenanceDistributions: ImportedMaintenanceDistribution[] = [];
  if (maintenanceCurrentTotal != null && maintenanceCurrentTotal > 0) {
    maintenanceDistributions.push({
      label: `Verteilter Erhaltungsaufwand ${taxYear}`,
      source_year: taxYear,
      total_amount: round2(maintenanceCurrentTotal),
      classification: "maintenance_expense",
      deduction_mode: "distributed",
      distribution_years: 3,
      current_year_share_override: maintenanceCurrentGrossShare != null ? round2(maintenanceCurrentGrossShare) : null,
      apply_rental_ratio: true,
      note: "Aus offiziellem ELSTER-Block Zeilen 57-60 übernommen",
    });
  }
  if (maintenance2022Gross != null && maintenance2022Gross > 0) {
    maintenanceDistributions.push({
      label: "Verteilter Erhaltungsaufwand aus 2022",
      source_year: 2022,
      total_amount: round2(maintenance2022Gross),
      classification: "maintenance_expense",
      deduction_mode: "distributed",
      distribution_years: Math.max(3, taxYear - 2022 + 1),
      current_year_share_override: maintenance2022Deductible != null ? round2(maintenance2022Deductible) : null,
      apply_rental_ratio: false,
      note: "Aus offiziellem ELSTER-Block Zeilen 68-69 übernommen",
    });
  }
  if (maintenance2023Gross != null && maintenance2023Gross > 0) {
    maintenanceDistributions.push({
      label: "Verteilter Erhaltungsaufwand aus 2023",
      source_year: 2023,
      total_amount: round2(maintenance2023Gross),
      classification: "maintenance_expense",
      deduction_mode: "distributed",
      distribution_years: Math.max(2, taxYear - 2023 + 1),
      current_year_share_override: maintenance2023Deductible != null ? round2(maintenance2023Deductible) : null,
      apply_rental_ratio: false,
      note: "Aus offiziellem ELSTER-Block Zeilen 71-72 übernommen",
    });
  }

  return {
    acquisition_date: acquisitionDate ? asNullableDateString(acquisitionDate) : null,
    depreciation_building: parseAmount(/35 Abzugsfähige Werbungskosten ([\d.,]+)/i),
    depreciation_fixtures: parseAmount(/45 Abzugsfähige Werbungskosten ([\d.,]+)/i),
    expense_blocks: expenseBlocks,
    maintenance_distributions: maintenanceDistributions,
  };
}

// ── Maintenance-Distribution-Normalisierung ──────────────────────────────────

/**
 * Erschließt das Quelljahr eines Verteilungs-Eintrags, falls Claude es nicht
 * explizit gesetzt hat. Sucht "aus YYYY" in Label und Note.
 */
export function inferMaintenanceSourceYear(
  item: ImportedMaintenanceDistribution,
  taxYear: number,
) {
  if (item.source_year != null) return item.source_year;
  const haystack = `${item.label} ${item.note ?? ""}`.toLowerCase();
  const yearMatch = haystack.match(/\baus\s+(20\d{2})\b/);
  if (yearMatch) return Number(yearMatch[1]);
  return taxYear;
}

/**
 * Maintenance-Distribution auf Konsistenz prüfen und normalisieren:
 *   - source_year setzen (über inferMaintenanceSourceYear),
 *   - deduction_mode `distributed` erzwingen, wenn das Quelljahr vor dem
 *     Steuerjahr liegt (sonst wäre es Sofortabzug aus der Vergangenheit),
 *   - distribution_years auf 2..5 clampen, mit minimum für Carry-Forward.
 */
export function normalizeImportedMaintenanceDistribution(
  item: ImportedMaintenanceDistribution,
  taxYear: number,
): ImportedMaintenanceDistribution {
  const sourceYear = inferMaintenanceSourceYear(item, taxYear);
  const looksDistributed = item.deduction_mode === "distributed" || sourceYear < taxYear;
  const minimumYearsForCarryForward = Math.max(1, taxYear - sourceYear + 1);
  const distributionYears = looksDistributed
    ? Math.min(5, Math.max(Math.max(2, minimumYearsForCarryForward), item.distribution_years ?? 3))
    : 1;

  return {
    ...item,
    source_year: sourceYear,
    deduction_mode: looksDistributed ? "distributed" : "immediate",
    distribution_years: distributionYears,
  };
}

/**
 * ELSTER-Jahresbeträge aus expense_blocks rückwärts in Maintenance-Items
 * einklinken, sofern beide existieren. Damit setzen wir
 * `current_year_share_override` und schalten Rental-Ratio auf `false` (der
 * Block-Wert ist bereits offizieller ELSTER-Wert, also bereits quotiert).
 */
export function reconcileMaintenanceDistributionsWithExpenseBlocks(args: {
  blocks: ImportedExpenseBlock[];
  taxYear: number;
  distributions: ImportedMaintenanceDistribution[];
}) {
  const blockByYear = new Map<number, ImportedExpenseBlock>();

  for (const block of args.blocks) {
    const combined = `${block.key} ${block.label} ${block.detail ?? ""}`;
    if (!/erhaltungsaufwand|maintenance/i.test(combined)) continue;
    const yearMatch = combined.match(/\b(20\d{2})\b/);
    const sourceYear = yearMatch ? Number(yearMatch[1]) : args.taxYear;
    if (block.amount == null || block.amount <= 0) continue;
    blockByYear.set(sourceYear, block);
  }

  return args.distributions.map((item) => {
    const block = item.source_year != null ? blockByYear.get(item.source_year) : null;
    if (!block || block.amount == null || block.amount <= 0) return item;
    return {
      ...item,
      current_year_share_override: round2(block.amount),
      apply_rental_ratio: false,
      note: [item.note, "ELSTER-Jahresbetrag aus Kostenblock übernommen"].filter(Boolean).join(" · "),
    };
  });
}

/**
 * Wir merken uns die Funktion, weil sie in Tests hilfreich ist und mehrere
 * Helfer in `route.ts` denselben Normalizer nutzen.
 */
export function normalizeExpenseBlockKey(rawKey: string): string {
  return normalizePartnerName(rawKey).replace(/\s+/g, "_");
}
