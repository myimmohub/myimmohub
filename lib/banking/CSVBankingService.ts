/**
 * Konkrete CSV-Implementierung von BankingService.
 *
 * Architektur:
 *   getTransactions / getAccountBalance
 *     → Browser-Supabase-Client (direkte Datenbankabfrage, RLS greift)
 *
 *   importFromCSV
 *     → parseCSV()  (Browser-seitig, nutzt PapaParse + File-API)
 *     → POST /api/banking/import-csv  (Server-seitig, berechnet import_hash
 *        via crypto-Modul und führt den Upsert aus)
 *
 * Die Klasse hält keinen internen Zustand außer dem injiziertem Supabase-Client.
 * Sie ist daher idempotent und kann pro Komponente einmalig instanziiert werden.
 *
 * @example
 * import { supabase } from "@/lib/supabase";
 * import { CSVBankingService } from "@/lib/banking/CSVBankingService";
 *
 * const banking = new CSVBankingService(supabase);
 * const txs = await banking.getTransactions(userId, propertyId);
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCSV } from "@/lib/banking/parseCSV";
import type {
  BankingService,
  BankingTransaction,
  AccountBalance,
  ImportResult,
  ColumnMapping,
} from "@/lib/banking/BankingService";

// ── Interne Hilfsfunktionen ───────────────────────────────────────────────────

/**
 * Berechnet Einnahmen, Ausgaben und Cashflow aus einer bereits geladenen
 * Transaktionsliste. Split-Ursprünge müssen vorher gefiltert worden sein.
 */
function computeBalance(transactions: BankingTransaction[]): AccountBalance {
  let einnahmen = 0;
  let ausgaben  = 0;

  for (const tx of transactions) {
    const amount = Number(tx.amount);
    if (amount > 0) {
      einnahmen += amount;
    } else {
      ausgaben += Math.abs(amount);
    }
  }

  return {
    einnahmen,
    ausgaben,
    cashflow: einnahmen - ausgaben,
    transactionCount: transactions.length,
  };
}

// ── Klasse ────────────────────────────────────────────────────────────────────

export class CSVBankingService implements BankingService {
  /**
   * @param db Supabase-Browser-Client (createBrowserClient).
   *           Für Server-Routen: serviceRoleClient() übergeben.
   */
  constructor(private readonly db: SupabaseClient) {}

  // ── getTransactions ─────────────────────────────────────────────────────────

  async getTransactions(
    userId: string,
    propertyId?: string | null,
    dateFrom?: string | null,
    dateTo?: string | null,
  ): Promise<BankingTransaction[]> {
    let query = this.db
      .from("transactions")
      .select(
        "id, user_id, property_id, date, amount, description, counterpart, " +
        "category, source, import_hash, is_tax_deductible, anlage_v_zeile, " +
        "split_from_transaction_id, confidence, is_confirmed, created_at",
      )
      .eq("user_id", userId)
      // Aufgesplittete Ursprünge ausschließen (würden sonst doppelt zählen)
      .or("category.is.null,category.neq.aufgeteilt")
      .order("date", { ascending: false });

    if (propertyId) {
      query = query.eq("property_id", propertyId);
    }

    if (dateFrom) {
      query = query.gte("date", dateFrom);
    }

    if (dateTo) {
      query = query.lte("date", dateTo);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`getTransactions: ${error.message}`);
    }

    return (data ?? []) as BankingTransaction[];
  }

  // ── importFromCSV ───────────────────────────────────────────────────────────

  async importFromCSV(
    file: File,
    mapping: ColumnMapping,
    propertyId: string,
    userId: string,
  ): Promise<ImportResult> {
    // Schritt 1: CSV im Browser parsen (PapaParse, File-API)
    const { transactions, errors: parseErrors } = await parseCSV(file, mapping);

    // Früh zurückkehren wenn gar keine Zeilen geparst werden konnten
    if (transactions.length === 0) {
      return {
        inserted: 0,
        skipped: 0,
        errors: parseErrors.map((e) => ({ row: e.row, error: e.message })),
      };
    }

    // Schritt 2: Serverseitigen Import anstoßen (import_hash via Node.js crypto)
    const response = await fetch("/api/banking/import-csv", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactions, propertyId, parseErrors }),
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(
        `importFromCSV: Server antwortete mit ${response.status} — ${body.error ?? "Unbekannter Fehler"}`,
      );
    }

    // Wir vertrauen dem Shape den /api/banking/import-csv immer zurückgibt
    return (await response.json()) as ImportResult;
  }

  // ── getAccountBalance ───────────────────────────────────────────────────────

  async getAccountBalance(
    propertyId: string,
    userId: string,
    dateFrom?: string | null,
    dateTo?: string | null,
  ): Promise<AccountBalance> {
    // Nur die für die Berechnung notwendigen Spalten laden
    let query = this.db
      .from("transactions")
      .select("id, user_id, property_id, date, amount, category")
      .eq("user_id", userId)
      .eq("property_id", propertyId)
      // Split-Ursprünge ausschließen
      .or("category.is.null,category.neq.aufgeteilt");

    if (dateFrom) {
      query = query.gte("date", dateFrom);
    }

    if (dateTo) {
      query = query.lte("date", dateTo);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`getAccountBalance: ${error.message}`);
    }

    // computeBalance erwartet BankingTransaction[], wir haben hier ein Subset —
    // casten ist sicher da nur `amount` für die Berechnung ausgewertet wird.
    return computeBalance((data ?? []) as BankingTransaction[]);
  }
}
