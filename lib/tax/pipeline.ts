/**
 * Pure berechnungs-Pipeline für /api/tax/calculate.
 *
 * Übernimmt die komplette Steuerberechnungs-Logik aus dem POST-Handler,
 * arbeitet rein in-memory ohne DB-Zugriff. Der Handler liest die nötigen
 * DB-Daten in den `CalculatePipelineInput` ein, ruft `runCalculatePipeline()`
 * auf und schreibt das Ergebnis anschließend zurück in `tax_data`.
 *
 * Determinismus: Diese Funktion verwendet weder `Date.now()` noch
 * `Math.random()`. Das einzige nicht-deterministische Feld (`updated_at`)
 * wird im Handler gesetzt, NICHT hier.
 */

import {
  calculateTaxFromTransactions,
  getSignedTaxFieldAmount,
  mapTaxFieldToTargetBlock,
  resolveField,
  type TaxCalculationTransaction,
} from "@/lib/tax/calculateTaxFromTransactions";
import { computeStructuredTaxData, isDistributionActiveForYear } from "@/lib/tax/structuredTaxLogic";
import { runRentalTaxEngineFromExistingData } from "@/lib/tax/rentalTaxEngineBridge";
import { buildElsterLineSummary } from "@/lib/tax/elsterLineLogic";
import { roundHalfUpEuroFromCents, toCents } from "@/lib/tax/elsterMath";
import { VERWALTUNGSPAUSCHALE_EUR, PORTO_PAUSCHALE_EUR } from "@/lib/tax/constants";
import type {
  ImportedExpenseBlockMetadata,
  TaxData,
  TaxDepreciationItem,
  TaxMaintenanceDistributionItem,
} from "@/types/tax";

export type CalculatePipelineDbCategory = {
  label: string;
  typ: string;
  anlage_v: string | null;
  gruppe: string;
};

export type CalculatePipelineProperty = {
  id: string;
  name: string | null;
  kaufpreis: number | null;
  gebaeudewert: number | null;
  grundwert: number | null;
  inventarwert: number | null;
  baujahr: number | null;
  afa_satz: number | null;
  afa_jahresbetrag: number | null;
  kaufdatum: string | null;
  address: string | null;
  type: string | null;
};

export type CalculatePipelinePaymentMatch = {
  transaction_id: string;
  cold_rent_cents: number;
  additional_costs_cents: number;
};

/**
 * NKA-Umlagen-Eintrag für Anti-Doppelbuchung (Spec §12.3).
 *
 * Was ein Mieter in der NKA bereits umlagefähig erstattet bekommt (oder
 * zumindest umlegen DARF), darf in der Anlage V nicht zusätzlich als
 * Werbungskosten geltend gemacht werden. Die Pipeline subtrahiert daher
 * je `position` den `umlagefaehig_cents`-Betrag vom passenden tax_data-Feld.
 *
 * Quelle: nka_kostenpositionen-Zeilen einer NKA-Periode, die zum
 * Tax-Year passt (period_start/period_end ∩ [taxYear-01-01..taxYear-12-31]).
 *
 * `transaction_id` ist optional: wenn vorhanden, wäre eine genauere
 * Verknüpfung möglich; aktuell wird für die Korrektur nur `position` und
 * `umlagefaehig_cents` verwendet (cents → EUR via /100).
 */
export type CalculatePipelineNkaUmlage = {
  transaction_id: string | null;
  position: import("@/lib/nka/distribute").BetrkvPosition;
  brutto_cents: number;
  umlagefaehig_cents: number;
  period_year: number;
};

export type CalculatePipelineInput = {
  property: CalculatePipelineProperty;
  transactions: TaxCalculationTransaction[];
  paymentMatches: CalculatePipelinePaymentMatch[];
  categories: CalculatePipelineDbCategory[];
  // Aktiv genutzter "effective" Datensatz (bereits vom Caller gewählt). Shape entspricht
  // der Original-DB-Zeile (verwaltungspauschale_eur, porto_pauschale_eur usw.) und kann
  // dynamisch sein, daher `any` analog zum bestehenden Code.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  gbrSettings: any | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  taxSettings: any | null;
  depreciationItems: TaxDepreciationItem[];
  maintenanceDistributions: TaxMaintenanceDistributionItem[];
  existingTaxData: TaxData | null;
  taxYear: number;
  /**
   * Optional: NKA-Umlagen-Korrekturen (Anti-Doppelbuchung Anlage V ↔ NKA).
   * Wenn nicht übergeben oder leeres Array, ändert sich am Pipeline-Verhalten nichts.
   */
  nkaUmlagen?: CalculatePipelineNkaUmlage[];
};

/**
 * Mapping NKA-Position → tax_data-Feld, das durch die NKA-Umlage gekürzt wird.
 *
 * Quelle: muss konsistent sein zu `CATEGORY_TO_FIELD` /
 * `mapTaxFieldToTargetBlock` in lib/tax/calculateTaxFromTransactions.ts.
 *
 * Hintergrund: in der Tax-Pipeline sind diese Positionen bereits als
 * Werbungskosten in `calculated.*` enthalten. Wenn sie zugleich in einer
 * NKA-Periode als umlagefähig auftauchen, wäre das eine Doppelbuchung —
 * wir ziehen daher den umlagefähigen Anteil hier wieder ab.
 *
 * Positionen ohne sinnvolles Anlage-V-Feld (wartung, sonstiges) bleiben
 * unkorrigiert (Mapping = null), weil sie i.d.R. in `other_expenses` landen,
 * was eher eine harte Sub-Kategorie ist.
 */
const NKA_POSITION_TO_TAX_FIELD: Record<
  import("@/lib/nka/distribute").BetrkvPosition,
  keyof TaxData | null
> = {
  grundsteuer: "property_tax",
  wasser: "water_sewage",
  abwasser: "water_sewage",
  heizung: "hoa_fees",
  warmwasser: "hoa_fees",
  strassenreinigung: "hoa_fees",
  muellabfuhr: "waste_disposal",
  gebaeudereinigung: "hoa_fees",
  gartenpflege: "hoa_fees",
  beleuchtung: "hoa_fees",
  schornsteinreinigung: "hoa_fees",
  sach_haftpflicht_versicherung: "insurance",
  hauswart: "hoa_fees",
  gemeinschaftsantenne_kabel: "other_expenses",
  wartung: null,
  sonstiges: null,
};

export type NkaCorrection = {
  position: string;
  subtracted_cents: number;
  reason: string;
};

type MaintenanceSourceResolutionItem = {
  type: "maintenance_source";
  label: string;
  target_block: string;
  source_year: number | null;
  gross_amount: number;
  deductible_amount: number;
  included: boolean;
  exclusion_reason: string | null;
};

type ReconciliationItem =
  | MaintenanceSourceResolutionItem
  | {
      type: "transaction" | "maintenance_distribution" | "depreciation_item";
      label: string;
      target_block: string;
      source_year: number | null;
      gross_amount: number;
      deductible_amount: number;
      included: boolean;
      exclusion_reason: string | null;
    };

/**
 * Datenintegritäts-Warnung. Wird in der Reconciliation sichtbar, wenn
 * NaN- oder Infinity-Werte irgendwo in den ELSTER-relevanten Feldern auftauchen.
 *
 * Diese Warnings werden in der UI angezeigt und auch via console.warn auf dem
 * Server geloggt — anders als vor dem Marktreife-Pass, wo solche Werte still
 * weitergeschleppt wurden.
 */
export type CalculatePipelineWarning = {
  code: "non_finite_value" | "uncategorized_transaction" | "afa_basis_zero";
  field?: string;
  message: string;
};

export type CalculatePipelineReconciliation = {
  items: ReconciliationItem[];
  einnahmen: number;
  deductible_without_afa: number;
  total_deductible_with_afa: number;
  afa: number;
  result_before_partner: number;
  calculated_expense_blocks: ImportedExpenseBlockMetadata[];
  expense_buckets: ReturnType<typeof buildElsterLineSummary>["expense_buckets"];
  depreciation_buckets: ReturnType<typeof buildElsterLineSummary>["depreciation_buckets"];
  /** Datenintegritäts-Warnings: NaN/Infinity, fehlende Kategorien, AfA-Basis 0 etc. */
  warnings: CalculatePipelineWarning[];
  /**
   * Anti-Doppelbuchung Anlage V ↔ NKA (Spec §12.3): Liste der vorgenommenen
   * Korrekturen (umlagefähig-Anteil aus calculated.* abgezogen). Leer, wenn
   * `nkaUmlagen` nicht übergeben oder keine Position für das Tax-Year matched.
   */
  nka_corrections: NkaCorrection[];
};

export type CalculatePipelineEngineSummary = {
  status: ReturnType<typeof runRentalTaxEngineFromExistingData>["status"];
  filing_profile: ReturnType<typeof runRentalTaxEngineFromExistingData>["filingRecommendation"]["filingProfile"];
  blocking_errors: string[];
  review_flags: string[];
};

export type CalculatePipelineOutput = {
  /** Berechnetes Snapshot inklusive maintenance_costs-Override und Verwaltungs-/Porto-Pauschalen. */
  calculated: ReturnType<typeof calculateTaxFromTransactions>;
  /** Strukturierte Patch-Daten (depreciation_*-Felder), die der Handler in tax_data schreiben muss. */
  structuredPatch: Record<string, unknown>;
  /** TaxData-Stand nach Anwendung von structuredPatch + import_confidence (vor finalem DB-Write). */
  taxDataAfterStructured: TaxData;
  /** Reconciliation-Block (entspricht heute `_reconciliation` in der API-Response). */
  reconciliation: CalculatePipelineReconciliation;
  /** Volles `buildElsterLineSummary`-Ergebnis – als expliziter Output zur Weiterverwendung. */
  lineSummary: ReturnType<typeof buildElsterLineSummary>;
  /** Runtime-stable Engine-Felder analog zum heutigen `_engine` in der API-Response. */
  engine: CalculatePipelineEngineSummary;
  /** Transaktionen nach Kalt/NK-Split (Debug/Trace). */
  processedTransactions: TaxCalculationTransaction[];
  /** Effektive Vermietungsquote (0..1). */
  rentalSharePct: number;
  /** Neue `import_confidence`-Map (mit `__expense_blocks`), die der Handler persistieren soll. */
  nextImportConfidence: Record<string, unknown>;
};

function normalizeForMatching(value: string | null | undefined) {
  return (value ?? "")
    .toLocaleLowerCase("de-DE")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function containsAny(text: string, needles: string[]) {
  return needles.some((needle) => text.includes(needle));
}

/**
 * Substring-Match auf normalisiertem Text, aber mit ECHTEN Wortgrenzen,
 * d.h. das Keyword muss entweder ein eigenes Wort sein oder durch Komposition
 * direkt erreicht werden (Stamm + erlaubter Anschluss).
 *
 * Hintergrund: Reines `text.includes("mull")` matched fälschlich "Müller"
 * (Mieter), weil normalisiert beide "mull" enthalten.
 *
 * Strategie: für jedes Keyword prüfen, ob es als ganzes Wort vorkommt oder
 * als Präfix mit nachfolgendem typischen Compound-Anschluss (Konsonant-Vokal
 * oder Wort-Anschluss "abfuhr", "tonne", "gebuhr", etc.). Pragmatisch:
 * Liste erlaubter Compound-Endungen pro Keyword im Aufrufer.
 *
 * Annahme: `text` ist bereits durch normalizeForMatching gelaufen.
 */
function containsAnyWord(text: string, needles: string[]) {
  // Wort-Anker an beiden Seiten: nur ganzes Wort matched.
  return needles.some((needle) => {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
  });
}

function resolveTransactionTargetBlock(
  tx: TaxCalculationTransaction,
  fieldKey: ReturnType<typeof resolveField>,
) {
  const fallback = mapTaxFieldToTargetBlock(fieldKey);
  const haystack = normalizeForMatching([tx.category, tx.counterpart, tx.description].filter(Boolean).join(" "));
  const isExplicitOtherExpense = containsAny(haystack, [
    "steuerberater",
    "rechtskosten",
    "kammerjager",
    "kammerjaeger",
    "internet",
    "telefon",
    "tv",
    "kurtaxe",
    "tourismusabgabe",
    "werkzeug",
    "material",
    "einrichtung",
    "smart home",
    "entfeuchtungsanlage",
    "schlussel",
    "schluessel",
    "verpflegung",
  ]);

  if (isExplicitOtherExpense) {
    return "other_expenses";
  }

  if (
    fallback === "allocated_costs" ||
    // Compound-Wörter als ganze Tokens. Verhindert "Müller" → mull-Match.
    // Wenn ein neues Counterpart-Pattern auftaucht (z.B. "Müllgebühr-XYZ"),
    // hier zur Liste ergänzen.
    containsAnyWord(haystack, [
      "grundsteuer",
      "versicherung",
      "gebaudeversicherung",
      "wohngebaudeversicherung",
      "wohngebaude",
      "mullabfuhr",
      "mulltonne",
      "mullgebuhr",
      "mullentsorgung",
      "abfallentsorgung",
      "abfallgebuhr",
      "wasser",
      "wasserwerk",
      "wasserversorgung",
      "abwasser",
      "hauswart",
      "hausmeister",
      "heizung",
      "heizkosten",
      "warmwasser",
      "hausbeleuchtung",
      "allgemeinstrom",
      "schornstein",
      "schornsteinfeger",
      "schornsteinreinigung",
    ])
  ) {
    return "allocated_costs";
  }

  if (
    fallback === "non_allocated_costs" ||
    containsAny(haystack, [
      "verwaltung",
      "objektverwaltung",
      "immobilienverwaltung",
      "verwaltungspauschale",
      "porto",
      "buro",
      "buero",
      "verwaltungsaufwand",
      "kontofuhr",
      "kontogebuhr",
      "bankgebuhr",
    ])
  ) {
    return "non_allocated_costs";
  }

  if (fallback === "financing_costs") return "financing_costs";
  if (fallback === "maintenance") return "maintenance";
  if (fallback === "depreciation") return "depreciation";
  // Income and unmapped transactions must never land in an expense block
  if (fallback === "income" || fallback === "unmapped") return fallback;
  return "other_expenses";
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}

function num(value: number | null | undefined) {
  return Number(value ?? 0);
}

function getDepreciationSignature(item: TaxDepreciationItem) {
  return [
    item.property_id,
    item.tax_year,
    item.item_type,
    String(item.label ?? "").trim().toLocaleLowerCase("de-DE"),
    round2(Number(item.gross_annual_amount ?? 0)),
    item.apply_rental_ratio ? "1" : "0",
  ].join("::");
}

function dedupeDepreciationItems(items: TaxDepreciationItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const signature = getDepreciationSignature(item);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function getMaintenanceSignature(item: TaxMaintenanceDistributionItem) {
  const transactionIds = (item.source_transaction_ids ?? []).filter(Boolean).slice().sort().join("|");
  return [
    item.property_id,
    item.source_year,
    String(item.label ?? "").trim().toLocaleLowerCase("de-DE"),
    round2(Number(item.total_amount ?? 0)),
    item.classification,
    item.deduction_mode,
    item.distribution_years,
    item.current_year_share_override == null ? "" : round2(Number(item.current_year_share_override ?? 0)),
    item.apply_rental_ratio ? "1" : "0",
    transactionIds,
  ].join("::");
}

function dedupeMaintenanceItems(items: TaxMaintenanceDistributionItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const signature = getMaintenanceSignature(item);
    if (seen.has(signature)) return false;
    seen.add(signature);
    return true;
  });
}

function computeTransactionDeductibleAmount(args: {
  tx: TaxCalculationTransaction;
  targetBlock: string;
  signedAmount: number;
  rentalSharePct: number;
}) {
  const haystack = normalizeForMatching([args.tx.category, args.tx.counterpart, args.tx.description].filter(Boolean).join(" "));
  const fullDeductionKeywords = ["kurtaxe", "tourismusabgabe", "verpflegung arbeitseinsatz", "verpflegung"];

  if (args.targetBlock === "allocated_costs" || args.targetBlock === "non_allocated_costs") {
    return round2(args.signedAmount * args.rentalSharePct);
  }

  if (args.targetBlock === "other_expenses") {
    const applyFullDeduction = containsAny(haystack, fullDeductionKeywords);
    return round2(args.signedAmount * (applyFullDeduction ? 1 : args.rentalSharePct));
  }

  if (args.targetBlock === "financing_costs") {
    return round2(args.signedAmount * args.rentalSharePct);
  }

  return round2(args.signedAmount);
}

function hasOwnManagementTransaction(
  transactions: TaxCalculationTransaction[],
  categories: CalculatePipelineDbCategory[],
  taxYear: number,
) {
  const dbCategoryMap = new Map(categories.map((category) => [category.label, category]));
  return transactions
    .filter((tx) => tx.date >= `${taxYear}-01-01` && tx.date <= `${taxYear}-12-31`)
    .filter((tx) => tx.category != null && tx.category !== "aufgeteilt")
    .filter((tx) => !(tx.amount < 0 && tx.is_tax_deductible === false))
    .some((tx) => resolveField(tx.category ?? "", tx.anlage_v_zeile, dbCategoryMap) === "property_management");
}

function hasOwnPortoTransaction(
  transactions: TaxCalculationTransaction[],
  taxYear: number,
) {
  return transactions
    .filter((tx) => tx.date >= `${taxYear}-01-01` && tx.date <= `${taxYear}-12-31`)
    .filter((tx) => tx.category != null && tx.category !== "aufgeteilt")
    .filter((tx) => !(tx.amount < 0 && tx.is_tax_deductible === false))
    .some((tx) => normalizeForMatching([tx.category, tx.counterpart, tx.description].filter(Boolean).join(" ")).includes("porto"));
}

function buildCalculatedExpenseBlocks(args: {
  items: ReconciliationItem[];
  taxYear: number;
  taxData?: Partial<TaxData>;
  rentalSharePct: number;
}): ImportedExpenseBlockMetadata[] {
  const totals = new Map<string, { label: string; amount: number; detail?: string | null }>();
  // Codex R1+R6: Jede Position separat half-up auf volle Euro runden, BEVOR sie
  // zur Summe addiert wird. Der Pipeline-/Reconciliation-Wert auf 2 Nachkommastellen
  // bleibt für die Detail-Aufstellung erhalten; nur die Aggregations-Summe in
  // import_confidence.__expense_blocks (= ELSTER-Bucket) muss positionsweise
  // gerundet werden, damit die Summe der Bucket-Werte den ELSTER-Sollwerten
  // entspricht (Sum-then-prorate-Bug).
  const add = (key: string, label: string, amount: number, detail?: string | null) => {
    if (!Number.isFinite(amount) || amount === 0) return;
    const roundedItem = roundHalfUpEuroFromCents(toCents(amount));
    if (roundedItem === 0) return;
    const current = totals.get(key);
    totals.set(key, {
      label,
      amount: (current?.amount ?? 0) + roundedItem,
      detail: detail ?? current?.detail ?? null,
    });
  };

  for (const item of args.items) {
    if (!item.included) continue;

    if (item.type === "transaction") {
      if (item.target_block === "allocated_costs") {
        add("allocated_costs", "Umlagefähige laufende Kosten", item.deductible_amount, "Grundsteuer, Versicherungen, Betriebskosten");
      } else if (item.target_block === "non_allocated_costs") {
        add("non_allocated_costs", "Nicht umlegbare Objektkosten", item.deductible_amount, "Verwaltung und Kontoführung");
      } else if (item.target_block === "financing_costs") {
        add("financing_costs", "Finanzierungskosten", item.deductible_amount, "Schuldzinsen");
      } else if (item.target_block === "other_expenses") {
        add("other_expenses", "Sonstige Werbungskosten", item.deductible_amount, null);
      }
      continue;
    }

    if (item.type === "maintenance_source" && item.target_block === "maintenance_immediate") {
      add("maintenance_immediate", "Sofort abziehbarer Erhaltungsaufwand", item.deductible_amount, null);
      continue;
    }

    if (item.type === "maintenance_distribution") {
      const sourceYear = item.source_year ?? args.taxYear;
      const key = sourceYear === args.taxYear ? `maintenance_${sourceYear}` : `maintenance_prior_${sourceYear}`;
      const label = sourceYear === args.taxYear
        ? `Verteilter Erhaltungsaufwand ${sourceYear}`
        : `Verteilter Erhaltungsaufwand aus ${sourceYear}`;
      add(key, label, item.deductible_amount, null);
    }
  }

  const aggregatedTaxData = args.taxData;
  if (aggregatedTaxData) {
    const prorate = (value: number) => round2(value * args.rentalSharePct);
    const ensureMinimum = (key: string, label: string, minimumAmount: number, detail?: string | null) => {
      // Position selber half-up auf Euro runden (R6) und dann mit der bereits in
      // Euro vorliegenden Summe vergleichen.
      const normalizedMinimum = roundHalfUpEuroFromCents(toCents(minimumAmount));
      if (!Number.isFinite(normalizedMinimum) || normalizedMinimum <= 0) return;
      const currentAmount = totals.get(key)?.amount ?? 0;
      const delta = normalizedMinimum - currentAmount;
      if (delta > 0) {
        add(key, label, delta, detail);
      }
    };

    ensureMinimum(
      "allocated_costs",
      "Umlagefähige laufende Kosten",
      prorate(
        num(aggregatedTaxData.property_tax) +
          num(aggregatedTaxData.insurance) +
          num(aggregatedTaxData.hoa_fees) +
          num(aggregatedTaxData.water_sewage) +
          num(aggregatedTaxData.waste_disposal)
      ),
      "Grundsteuer, Versicherungen, Betriebskosten",
    );
    ensureMinimum(
      "non_allocated_costs",
      "Nicht umlegbare Objektkosten",
      prorate(num(aggregatedTaxData.property_management) + num(aggregatedTaxData.bank_fees)),
      "Verwaltung und Kontoführung",
    );
    ensureMinimum(
      "financing_costs",
      "Finanzierungskosten",
      prorate(num(aggregatedTaxData.loan_interest)),
      "Schuldzinsen",
    );
  }

  return Array.from(totals.entries()).map(([key, value]) => ({
    key,
    label: value.label,
    amount: value.amount,
    detail: value.detail ?? null,
  }));
}

function buildMaintenanceSourceResolution(args: {
  transactions: TaxCalculationTransaction[];
  taxYear: number;
  categories: CalculatePipelineDbCategory[];
  maintenanceDistributions: TaxMaintenanceDistributionItem[];
}) {
  const dbCatMap = new Map(args.categories.map((category) => [category.label, category]));
  const activePlans = args.maintenanceDistributions.filter((item) => isDistributionActiveForYear(item, args.taxYear));
  const planBySourceTransactionId = new Map<string, TaxMaintenanceDistributionItem>();

  for (const plan of activePlans) {
    for (const transactionId of plan.source_transaction_ids ?? []) {
      if (transactionId && !planBySourceTransactionId.has(transactionId)) {
        planBySourceTransactionId.set(transactionId, plan);
      }
    }
  }

  const maintenanceTransactions = args.transactions
    .filter((tx) => tx.date >= `${args.taxYear}-01-01` && tx.date <= `${args.taxYear}-12-31`)
    .filter((tx) => tx.category != null && tx.category !== "aufgeteilt")
    .filter((tx) => resolveField(tx.category ?? "", tx.anlage_v_zeile, dbCatMap) === "maintenance_costs");

  const items: MaintenanceSourceResolutionItem[] = [];
  let immediateTotal = 0;

  for (const tx of maintenanceTransactions) {
    const grossAmount = Math.abs(Number(tx.amount ?? 0));
    const plan = tx.id ? planBySourceTransactionId.get(tx.id) : undefined;

    if (!plan) {
      items.push({
        type: "maintenance_source",
        label: tx.counterpart || tx.description || tx.category || "Erhaltungsaufwand",
        target_block: "excluded",
        source_year: args.taxYear,
        gross_amount: grossAmount,
        deductible_amount: 0,
        included: false,
        exclusion_reason: "Noch keinem steuerlichen Erhaltungsplan zugeordnet",
      });
      continue;
    }

    if (plan.classification === "maintenance_expense" && plan.deduction_mode === "distributed") {
      items.push({
        type: "maintenance_source",
        label: tx.counterpart || tx.description || plan.label,
        target_block: `maintenance_${plan.source_year ?? args.taxYear}`,
        source_year: plan.source_year ?? args.taxYear,
        gross_amount: grossAmount,
        deductible_amount: 0,
        included: false,
        exclusion_reason: `Bereits über Verteilungsplan "${plan.label}" berücksichtigt`,
      });
      continue;
    }

    if (plan.classification === "maintenance_expense") {
      immediateTotal += grossAmount;
      items.push({
        type: "maintenance_source",
        label: tx.counterpart || tx.description || plan.label,
        target_block: "maintenance_immediate",
        source_year: plan.source_year ?? args.taxYear,
        gross_amount: grossAmount,
        deductible_amount: grossAmount,
        included: true,
        exclusion_reason: null,
      });
      continue;
    }

    items.push({
      type: "maintenance_source",
      label: tx.counterpart || tx.description || plan.label,
      target_block: plan.classification === "production_cost" ? "capitalized" : "depreciation",
      source_year: plan.source_year ?? args.taxYear,
      gross_amount: grossAmount,
      deductible_amount: 0,
      included: false,
      exclusion_reason: plan.classification === "production_cost"
        ? "Als Herstellungskosten kapitalisiert"
        : "Über AfA berücksichtigt",
    });
  }

  const unlinkedCurrentYearPlans = activePlans.filter((plan) =>
    (plan.source_year ?? args.taxYear) === args.taxYear &&
    (plan.source_transaction_ids?.length ?? 0) === 0 &&
    plan.classification === "maintenance_expense",
  );

  for (const plan of unlinkedCurrentYearPlans) {
    const grossAmount = Math.abs(Number(plan.total_amount ?? 0));
    const isImmediatePlan = plan.deduction_mode === "immediate";
    if (isImmediatePlan) {
      immediateTotal += grossAmount;
    }
    items.push({
      type: "maintenance_source",
      label: `${plan.label} (Quelle ohne Transaktionslink)`,
      target_block: isImmediatePlan ? "maintenance_immediate" : `maintenance_${plan.source_year ?? args.taxYear}`,
      source_year: plan.source_year ?? args.taxYear,
      gross_amount: grossAmount,
      deductible_amount: isImmediatePlan ? grossAmount : 0,
      included: isImmediatePlan,
      exclusion_reason: isImmediatePlan ? null : "Quelle wird über Verteilungsplan statt Sofortabzug behandelt",
    });
  }

  return {
    immediateTotal: Math.round(immediateTotal * 100) / 100,
    items,
  };
}

/**
 * Reine Variante des heutigen Closure `applyStructuredData`. Ermittelt den
 * structured-Patch (depreciation_*-Felder) und gibt das resultierende TaxData-Objekt
 * sowie den vollständigen Patch zurück. Schreibt NICHTS in die DB.
 */
function applyStructuredData(args: {
  baseData: TaxData;
  taxYear: number;
  rentalSharePct: number;
  depreciationItems: TaxDepreciationItem[];
  maintenanceDistributions: TaxMaintenanceDistributionItem[];
}): {
  structured: ReturnType<typeof computeStructuredTaxData>;
  structuredPatch: Record<string, unknown>;
  taxDataAfterStructuredPatch: TaxData;
} {
  const structured = computeStructuredTaxData({
    taxData: args.baseData,
    taxYear: args.taxYear,
    rentalSharePct: args.rentalSharePct,
    depreciationItems: args.depreciationItems,
    maintenanceDistributions: args.maintenanceDistributions,
  });

  // Nur Felder aus dem strukturierten Ergebnis schreiben, die tatsächlich berechnet wurden
  const structuredPatch: Record<string, unknown> = {};
  const assignIfChanged = (key: "depreciation_building" | "depreciation_outdoor" | "depreciation_fixtures") => {
    const nextValue = structured.taxData[key];
    const baseValue = args.baseData[key];
    const normalizedNext = nextValue == null ? null : Number(nextValue);
    const normalizedBase = baseValue == null ? null : Number(baseValue);
    if (normalizedNext === normalizedBase) return;
    structuredPatch[key] = normalizedNext;
  };
  // maintenance_costs is NOT patched here: it must stay as the immediate-only transaction amount.
  // §82b distribution annual shares are computed on-the-fly by buildElsterLineSummary.
  if (structured.lineTotals.depreciation_building != null) {
    structuredPatch.depreciation_building = structured.taxData.depreciation_building;
  } else {
    assignIfChanged("depreciation_building");
  }
  if (structured.lineTotals.depreciation_outdoor != null) {
    structuredPatch.depreciation_outdoor = structured.taxData.depreciation_outdoor;
  } else {
    assignIfChanged("depreciation_outdoor");
  }
  if (structured.lineTotals.depreciation_fixtures != null) {
    structuredPatch.depreciation_fixtures = structured.taxData.depreciation_fixtures;
  } else {
    assignIfChanged("depreciation_fixtures");
  }

  // Nach Anwendung des Patches entspricht die TaxData dem von computeStructuredTaxData
  // produzierten taxData (id/created_at/usw. werden vom Caller mitgepatcht).
  const taxDataAfterStructuredPatch: TaxData = structured.taxData;

  return {
    structured,
    structuredPatch,
    taxDataAfterStructuredPatch,
  };
}

/**
 * Reine Variante des heutigen Closure `buildReconciliation`.
 */
function buildReconciliation(args: {
  structured: ReturnType<typeof computeStructuredTaxData>;
  finalData: TaxData;
  maintenanceSourceItems: MaintenanceSourceResolutionItem[];
  rawTransactions: TaxCalculationTransaction[];
  excludedTransactionIds: string[];
  categories: CalculatePipelineDbCategory[];
  normalizedMaintenanceItems: TaxMaintenanceDistributionItem[];
  taxYear: number;
  rentalSharePct: number;
}): { reconciliation: CalculatePipelineReconciliation; lineSummary: ReturnType<typeof buildElsterLineSummary> } {
  const { structured, finalData, maintenanceSourceItems, rawTransactions, excludedTransactionIds, categories, normalizedMaintenanceItems, taxYear, rentalSharePct } = args;
  const inferTargetBlock = (label: string, type: "transaction" | "maintenance_distribution" | "depreciation_item", sourceYear: number | null) => {
    if (type === "depreciation_item") return "depreciation";
    if (type === "maintenance_distribution") return sourceYear != null && sourceYear < taxYear ? `maintenance_${sourceYear}` : `maintenance_${taxYear}`;
    const normalized = label.toLowerCase();
    if (normalized.includes("grundsteuer") || normalized.includes("versicherung") || normalized.includes("hausgeld") || normalized.includes("weg") || normalized.includes("wasser") || normalized.includes("müll")) return "allocated_costs";
    if (normalized.includes("kontoführung") || normalized.includes("verwaltung")) return "non_allocated_costs";
    if (normalized.includes("schuldzinsen")) return "financing_costs";
    return "other_expenses";
  };

  const allDists = normalizedMaintenanceItems;
  const dbCategoryMap = new Map(categories.map((category) => [category.label, category]));
  const transactionItems = rawTransactions
    .filter((tx) => tx.date >= `${taxYear}-01-01` && tx.date <= `${taxYear}-12-31`)
    .filter((tx) => tx.category != null && tx.category !== "aufgeteilt")
    .filter((tx) => !(tx.amount < 0 && tx.is_tax_deductible === false))
    .filter((tx) => !(tx.id && excludedTransactionIds.includes(tx.id)))
    .map((tx) => {
      const fieldKey = resolveField(tx.category ?? "", tx.anlage_v_zeile, dbCategoryMap);
      const block = resolveTransactionTargetBlock(tx, fieldKey);
      const dbCat = dbCategoryMap.get(tx.category ?? "");
      const signedTaxAmount = getSignedTaxFieldAmount({
        amount: Number(tx.amount ?? 0),
        category: tx.category ?? null,
        dbCategory: dbCat,
      });
      const absoluteAmount = Math.abs(signedTaxAmount);
      const deductibleAmount = computeTransactionDeductibleAmount({
        tx,
        targetBlock: block,
        signedAmount: signedTaxAmount,
        rentalSharePct,
      });
      return {
        type: "transaction" as const,
        label: tx.counterpart || tx.description || tx.category || "Transaktion",
        target_block: block,
        source_year: null as number | null,
        gross_amount: absoluteAmount,
        deductible_amount: deductibleAmount,
        included: fieldKey != null,
        exclusion_reason: fieldKey == null ? "Keine steuerliche Zuordnung" : null,
      };
    });
  const items: ReconciliationItem[] = [
    ...maintenanceSourceItems,
    ...transactionItems,
    // Instandhaltungsverteilungen
    ...allDists.map((item) => {
      const active = isDistributionActiveForYear(item, taxYear);
      const computed = structured.maintenanceDistributions.find((d) => d.id === item.id);
      return {
        type: "maintenance_distribution" as const,
        label: item.label,
        target_block: inferTargetBlock(item.label, "maintenance_distribution", item.source_year),
        source_year: item.source_year,
        gross_amount: Number(item.total_amount),
        deductible_amount: computed?.deductible_amount_elster ?? 0,
        included: active,
        exclusion_reason: !active
          ? item.status !== "active"
            ? `Status: ${item.status}`
            : `Nicht aktiv für ${taxYear} (Quelljahr ${item.source_year}, Verteilung ${item.distribution_years} J.)`
          : null,
      };
    }),
    // AfA-Posten
    ...structured.depreciationItems.map((item) => ({
      type: "depreciation_item" as const,
      label: item.label,
      target_block: inferTargetBlock(item.label, "depreciation_item", null),
      source_year: null as number | null,
      gross_amount: Number(item.gross_annual_amount),
      deductible_amount: item.deductible_amount_elster,
      included: true,
      exclusion_reason: null as string | null,
    })),
    // Gebäude-AfA aus Property-Daten (falls keine expliziten AfA-Posten)
    ...(structured.depreciationItems.length === 0 && finalData.depreciation_building
      ? [{
          type: "depreciation_item" as const,
          label: "Gebäude-AfA (automatisch berechnet)",
          target_block: "depreciation",
          source_year: null as number | null,
          gross_amount: Number(finalData.depreciation_building),
          deductible_amount: Number(finalData.depreciation_building),
          included: true,
          exclusion_reason: null as string | null,
        }]
      : []),
  ];

  const calculatedExpenseBlocks = buildCalculatedExpenseBlocks({
    items,
    taxYear,
    taxData: finalData,
    rentalSharePct,
  });
  const lineSummary = buildElsterLineSummary({
    ...finalData,
    import_confidence: {
      ...(typeof finalData.import_confidence === "object" && finalData.import_confidence != null ? finalData.import_confidence : {}),
      __expense_blocks: calculatedExpenseBlocks,
    },
  }, {
    maintenanceDistributions: structured.maintenanceDistributions,
    taxYear,
  });

  const einnahmen = lineSummary.income_total;
  const afa = lineSummary.depreciation_total;
  const deductible_without_afa = lineSummary.advertising_costs_total;
  const total_deductible_with_afa = lineSummary.advertising_costs_total + lineSummary.depreciation_total + lineSummary.special_deductions_total;
  const result_before_partner = lineSummary.result;

  // ── Datenintegritäts-Check: NaN / Infinity erkennen ─────────────────────────
  // Bisheriges Verhalten: solche Werte wurden stillschweigend mitgeschleppt und
  // tauchten erst im UI als "NaN €" oder als komplett kaputter Überschuss auf.
  // Marktreife-Pass: explizite Warning + console.warn auf Server-Seite.
  const warnings: CalculatePipelineWarning[] = [];
  const checks: { field: string; value: number }[] = [
    { field: "einnahmen", value: einnahmen },
    { field: "afa", value: afa },
    { field: "deductible_without_afa", value: deductible_without_afa },
    { field: "total_deductible_with_afa", value: total_deductible_with_afa },
    { field: "result_before_partner", value: result_before_partner },
  ];
  for (const c of checks) {
    if (!Number.isFinite(c.value)) {
      const message = `Pipeline: ${c.field} ist nicht endlich (Wert=${c.value}). Mögliche Ursache: Division durch 0 oder NaN-Eingabe.`;
      warnings.push({ code: "non_finite_value", field: c.field, message });
      console.warn("[tax-pipeline]", message);
    }
  }

  const reconciliation: CalculatePipelineReconciliation = {
    items,
    einnahmen,
    deductible_without_afa,
    total_deductible_with_afa,
    afa,
    result_before_partner,
    calculated_expense_blocks: calculatedExpenseBlocks,
    expense_buckets: lineSummary.expense_buckets,
    depreciation_buckets: lineSummary.depreciation_buckets,
    warnings,
    // Wird vom Caller (runCalculatePipeline) mit nkaCorrections befüllt.
    nka_corrections: [],
  };

  return { reconciliation, lineSummary };
}

const RENT_INCOME_CATS = new Set(["Mieteinnahmen", "Ferienvermietung – Einnahmen", "miete_einnahmen_wohnen", "miete_einnahmen_gewerbe"]);

/**
 * Pure-Variante der Berechnungslogik aus `app/api/tax/calculate/route.ts`.
 * Erhält alle DB-Reads als Input und gibt die zu schreibenden Daten plus
 * Engine-/Reconciliation-Ergebnisse zurück.
 */
export function runCalculatePipeline(input: CalculatePipelineInput): CalculatePipelineOutput {
  const {
    property,
    transactions,
    paymentMatches,
    categories,
    gbrSettings,
    taxSettings,
    depreciationItems,
    maintenanceDistributions,
    existingTaxData,
    taxYear,
  } = input;

  // ── Split matched rent transactions into Kaltmiete + Nebenkosten ─────────────
  const splitMap = new Map<string, { coldRentCents: number; additionalCostsCents: number }>();
  for (const m of paymentMatches) {
    if (m.transaction_id) {
      splitMap.set(m.transaction_id, {
        coldRentCents: m.cold_rent_cents ?? 0,
        additionalCostsCents: m.additional_costs_cents ?? 0,
      });
    }
  }

  const processedTxData: TaxCalculationTransaction[] = [];
  for (const tx of transactions) {
    const split = tx.id ? splitMap.get(tx.id) : undefined;
    const isRent = tx.category != null && RENT_INCOME_CATS.has(tx.category);

    if (split && isRent && split.additionalCostsCents > 0) {
      const total = split.coldRentCents + split.additionalCostsCents;
      const coldRentRatio = total > 0 ? split.coldRentCents / total : 1;
      // Cold rent portion → Mieteinnahmen
      processedTxData.push({ ...tx, amount: Number(tx.amount) * coldRentRatio, category: "Mieteinnahmen" });
      // Additional costs portion → Nebenkostenerstattungen
      processedTxData.push({ ...tx, id: (tx.id ?? "") + "_nk", amount: Number(tx.amount) * (1 - coldRentRatio), category: "Nebenkostenerstattungen" });
    } else {
      processedTxData.push(tx);
    }
  }

  const normalizedDepreciationItems = dedupeDepreciationItems(depreciationItems);
  const normalizedMaintenanceItems = dedupeMaintenanceItems(maintenanceDistributions);
  const excludedTransactionIds = Array.from(new Set(
    normalizedMaintenanceItems.flatMap((item) => Array.isArray(item.source_transaction_ids) ? item.source_transaction_ids : []),
  ));

  // ── Pre-Flight-Warnings: AfA-Basis 0, unkategorisierte Tx ────────────────────
  const preFlightWarnings: CalculatePipelineWarning[] = [];
  const afaBase =
    Number(property.gebaeudewert ?? 0) +
    Number(property.inventarwert ?? 0);
  if (afaBase <= 0 && Number(property.afa_jahresbetrag ?? 0) <= 0) {
    const message = `Pipeline: AfA-Basis (Gebäudewert + Inventarwert) ist 0 oder fehlt. Property "${property.name ?? property.id}" wird ohne AfA-Position berechnet.`;
    preFlightWarnings.push({ code: "afa_basis_zero", field: "gebaeudewert", message });
    console.warn("[tax-pipeline]", message);
  }
  const uncategorizedCount = transactions
    .filter((tx) => tx.date >= `${taxYear}-01-01` && tx.date <= `${taxYear}-12-31`)
    .filter((tx) => tx.category == null).length;
  if (uncategorizedCount > 0) {
    const message = `Pipeline: ${uncategorizedCount} Transaktion(en) ohne Kategorie im Steuerjahr ${taxYear}. Diese werden ignoriert.`;
    preFlightWarnings.push({ code: "uncategorized_transaction", message });
    console.warn("[tax-pipeline]", message);
  }

  const rentalSharePct = taxSettings?.rental_share_override_pct != null
    ? taxSettings.rental_share_override_pct / 100
    : taxSettings?.eigennutzung_tage != null && taxSettings?.gesamt_tage != null
      ? Math.max(0, Math.min(1, 1 - taxSettings.eigennutzung_tage / taxSettings.gesamt_tage))
      : 1.0;

  const calculated = calculateTaxFromTransactions(
    processedTxData,
    {
      kaufpreis: property.kaufpreis,
      gebaeudewert: property.gebaeudewert,
      grundwert: property.grundwert,
      inventarwert: property.inventarwert,
      baujahr: property.baujahr,
      afa_satz: property.afa_satz,
      afa_jahresbetrag: property.afa_jahresbetrag,
      kaufdatum: property.kaufdatum,
      address: property.address,
      type: property.type,
    },
    taxYear,
    categories,
    excludedTransactionIds,
  );

  // ── Anti-Doppelbuchung Anlage V ↔ NKA (Spec §12.3) ───────────────────────────
  // Was ein Mieter über die NKA umlagefähig erstattet bekommen DARF, soll
  // nicht zusätzlich als Werbungskosten auftauchen. Wir kürzen daher die
  // jeweiligen `calculated.*`-Felder um den umlagefähig_cents-Anteil
  // (cents → EUR via /100). Nur wenn die NKA-Periode für `taxYear` greift.
  const nkaCorrections: NkaCorrection[] = [];
  const relevantUmlagen = (input.nkaUmlagen ?? []).filter(
    (u) => u.period_year === taxYear,
  );
  if (relevantUmlagen.length > 0) {
    // Pro tax_data-Feld die Summe der zu kürzenden EUR-Beträge sammeln.
    const correctionsByField = new Map<keyof TaxData, number>();
    for (const u of relevantUmlagen) {
      const targetField = NKA_POSITION_TO_TAX_FIELD[u.position];
      if (!targetField) {
        nkaCorrections.push({
          position: u.position,
          subtracted_cents: 0,
          reason: `Position ${u.position} hat kein passendes Anlage-V-Feld; keine Kürzung.`,
        });
        continue;
      }
      const subtractCents = Math.max(0, Math.round(Number(u.umlagefaehig_cents)));
      if (subtractCents <= 0) continue;
      correctionsByField.set(
        targetField,
        (correctionsByField.get(targetField) ?? 0) + subtractCents,
      );
      nkaCorrections.push({
        position: u.position,
        subtracted_cents: subtractCents,
        reason: `Umlagefähiger Anteil aus NKA ${u.period_year} → tax_data.${String(targetField)} gekürzt`,
      });
    }
    // Eigentliche Kürzung. Wert des Felds darf negativ sein (z.B. wenn
    // tatsächliche Werbungskosten kleiner als Umlage waren) — die Pipeline
    // klemmt das nicht ab, weil die Anti-Doppelbuchung exakt die volle
    // umlegbare Summe abziehen muss, sonst wäre die Doppelbuchung nicht
    // vollständig neutralisiert.
    for (const [fieldKey, sumCents] of correctionsByField.entries()) {
      const currentValueEur = Number(
        (calculated as Record<string, unknown>)[fieldKey as string] ?? 0,
      );
      const subtractEur = sumCents / 100;
      // round2 sorgt für stabile 2-Nachkommastellen-Repräsentation.
      (calculated as Record<string, unknown>)[fieldKey as string] = round2(
        currentValueEur - subtractEur,
      );
    }
  }

  const maintenanceSourceResolution = buildMaintenanceSourceResolution({
    transactions: processedTxData,
    taxYear,
    categories,
    maintenanceDistributions: normalizedMaintenanceItems,
  });
  calculated.maintenance_costs = maintenanceSourceResolution.immediateTotal;

  const managementFallback = Number(taxSettings?.verwaltungspauschale_eur ?? VERWALTUNGSPAUSCHALE_EUR);
  const portoFallback = Number(taxSettings?.porto_pauschale_eur ?? PORTO_PAUSCHALE_EUR);
  const hasManagementTx = hasOwnManagementTransaction(processedTxData, categories, taxYear);
  const hasPortoTx = hasOwnPortoTransaction(processedTxData, taxYear);
  const nonAllocableFallback = round2(
    (!hasManagementTx && Number.isFinite(managementFallback) ? managementFallback * rentalSharePct : 0) +
    (!hasPortoTx && Number.isFinite(portoFallback) ? portoFallback * rentalSharePct : 0),
  );
  if (nonAllocableFallback > 0) {
    calculated.property_management = round2(Number(calculated.property_management ?? 0) + nonAllocableFallback);
  }

  // Basis-TaxData aufbauen, wie sie nach dem ersten DB-Write (insert/update) aussehen würde.
  // Bei Update: existingTaxData mit calculated + import_source überschrieben.
  // Bei Insert: nur calculated + property_id (id/created_at/updated_at setzt die DB).
  const baseData: TaxData = existingTaxData
    ? ({
        ...existingTaxData,
        ...calculated,
        import_source: "calculated",
      } as TaxData)
    : ({
        ...(calculated as Partial<TaxData>),
        property_id: property.id,
      } as TaxData);

  const { structured, structuredPatch, taxDataAfterStructuredPatch } = applyStructuredData({
    baseData,
    taxYear,
    rentalSharePct,
    depreciationItems: normalizedDepreciationItems,
    maintenanceDistributions: normalizedMaintenanceItems,
  });

  const { reconciliation, lineSummary } = buildReconciliation({
    structured,
    finalData: taxDataAfterStructuredPatch,
    maintenanceSourceItems: maintenanceSourceResolution.items,
    rawTransactions: transactions,
    excludedTransactionIds,
    categories,
    normalizedMaintenanceItems,
    taxYear,
    rentalSharePct,
  });

  const nextImportConfidence: Record<string, unknown> = {
    ...(typeof taxDataAfterStructuredPatch.import_confidence === "object" && taxDataAfterStructuredPatch.import_confidence != null ? taxDataAfterStructuredPatch.import_confidence : {}),
    __expense_blocks: reconciliation.calculated_expense_blocks,
  };

  const taxDataAfterStructured: TaxData = {
    ...taxDataAfterStructuredPatch,
    import_confidence: nextImportConfidence,
  };

  const engineOutput = runRentalTaxEngineFromExistingData({
    property: { id: property.id, name: property.name ?? null, address: property.address ?? null },
    taxData: taxDataAfterStructured,
    gbrSettings: gbrSettings ?? null,
    taxSettings: taxSettings,
    depreciationItems: normalizedDepreciationItems,
    maintenanceDistributions: normalizedMaintenanceItems,
    partnerTaxValues: [],
  });

  const engine: CalculatePipelineEngineSummary = {
    status: engineOutput.status,
    filing_profile: engineOutput.filingRecommendation.filingProfile,
    blocking_errors: engineOutput.blockingErrors.map((item) => item.message),
    review_flags: engineOutput.reviewFlags.map((item) => item.message),
  };

  // Pre-Flight-Warnings (AfA-Basis 0, unkategorisierte Tx) mit den
  // NaN/Infinity-Warnings aus buildReconciliation() vereinen.
  const mergedReconciliation: CalculatePipelineReconciliation = {
    ...reconciliation,
    warnings: [...preFlightWarnings, ...reconciliation.warnings],
    nka_corrections: nkaCorrections,
  };

  return {
    calculated,
    structuredPatch,
    taxDataAfterStructured,
    reconciliation: mergedReconciliation,
    lineSummary,
    engine,
    processedTransactions: processedTxData,
    rentalSharePct,
    nextImportConfidence,
  };
}
