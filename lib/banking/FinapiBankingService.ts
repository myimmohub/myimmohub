/**
 * Finapi-Implementierung von BankingService.
 *
 * Finapi ist ein deutscher PSD2-konformer Account-Information-Service (AIS),
 * der direkten Lesezugriff auf Bankkonten über XS2A ermöglicht.
 * Sobald die Integration abgeschlossen ist, ersetzt diese Klasse den
 * manuellen CSV-Import für unterstützte Banken vollständig.
 *
 * Finapi-Dokumentation: https://docs.finapi.io
 */

import type {
  BankingService,
  BankingTransaction,
  AccountBalance,
  ImportResult,
  ColumnMapping,
} from "@/lib/banking/BankingService";

export class FinapiBankingService implements BankingService {
  // TODO: Finapi-Integration. Finapi-Dokumentation: https://docs.finapi.io
  async getTransactions(
    _userId: string,
    _propertyId?: string | null,
    _dateFrom?: string | null,
    _dateTo?: string | null,
  ): Promise<BankingTransaction[]> {
    // TODO: Finapi-Integration. Finapi-Dokumentation: https://docs.finapi.io
    throw new Error("Finapi noch nicht integriert – CSV-Import verwenden");
  }

  // TODO: Finapi-Integration. Finapi-Dokumentation: https://docs.finapi.io
  async importFromCSV(
    _file: File,
    _mapping: ColumnMapping,
    _propertyId: string,
    _userId: string,
  ): Promise<ImportResult> {
    // TODO: Finapi-Integration. Finapi-Dokumentation: https://docs.finapi.io
    throw new Error("Finapi noch nicht integriert – CSV-Import verwenden");
  }

  // TODO: Finapi-Integration. Finapi-Dokumentation: https://docs.finapi.io
  async getAccountBalance(
    _propertyId: string,
    _userId: string,
    _dateFrom?: string | null,
    _dateTo?: string | null,
  ): Promise<AccountBalance> {
    // TODO: Finapi-Integration. Finapi-Dokumentation: https://docs.finapi.io
    throw new Error("Finapi noch nicht integriert – CSV-Import verwenden");
  }
}
