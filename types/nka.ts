export type NkaStatus =
  | "offen"
  | "in_bearbeitung"
  | "versandt"
  | "widerspruch"
  | "abgeschlossen"
  | "verfristet";

export type NkaUmlageschluessel =
  | "wohnflaeche"
  | "personen"
  | "verbrauch"
  | "einheiten"
  | "mea";

export type NkaPositionQuelle =
  | "transaktion"
  | "manuell"
  | "weg_import"
  | "messdienst_api"
  | "messdienst_pdf";

export interface NkaPeriod {
  id: string;
  property_id: string;
  user_id: string;
  gbr_settings_id?: string | null;
  zeitraum_von: string;
  zeitraum_bis: string;
  status: NkaStatus;
  deadline_abrechnung?: string | null;
  versandt_am?: string | null;
  widerspruchsfrist_bis?: string | null;
  gesamtkosten_umlagefaehig: number;
  gesamtkosten_nicht_umlagefaehig: number;
  leerstandsanteil_tage: number;
  leerstandsanteil_eur: number;
  pdf_pfad?: string | null;
  erstellt_von_user_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface NkaCostItem {
  id: string;
  nka_periode_id: string;
  betr_kv_position: number;
  bezeichnung: string;
  betrag_brutto: number;
  umlageschluessel: NkaUmlageschluessel;
  quelle: NkaPositionQuelle;
  transaktion_id?: string | null;
  beleg_pfad?: string | null;
  ist_umlagefaehig: boolean;
  notiz?: string | null;
  created_at?: string;
}

export interface NkaTenantShare {
  id: string;
  nka_periode_id: string;
  mieter_id: string;
  mietvertrag_id: string;
  bewohnt_von: string;
  bewohnt_bis: string;
  tage_anteil: number;
  personen_anzahl: number;
  anteil_wohnflaeche_m2?: number | null;
  summe_anteile: number;
  summe_vorauszahlungen: number;
  nachzahlung_oder_guthaben?: number | null;
  anpassung_vorauszahlung_neu?: number | null;
  faelligkeit_nachzahlung?: string | null;
  versandt_an_email?: string | null;
  versandt_am?: string | null;
  postmark_message_id?: string | null;
  created_at?: string;
  tenant_name?: string | null;
  unit_label?: string | null;
  matched_payment_count?: number;
  matched_payment_sources?: string[];
}

export interface NkaTransactionCandidate {
  id: string;
  date: string;
  amount: number;
  description?: string | null;
  counterpart?: string | null;
  category?: string | null;
  betr_kv_position: number;
  umlageschluessel: NkaUmlageschluessel;
  ist_umlagefaehig: boolean;
  needs_betrkv_review?: boolean;
}

export interface NkaPropertySummary {
  id: string;
  name: string;
  address: string | null;
  wohnflaeche_gesamt_m2?: number | null;
  anzahl_einheiten?: number | null;
  ist_weg?: boolean | null;
}

export interface NkaTenantSummary {
  id: string;
  unit_id: string;
  first_name: string | null;
  last_name: string | null;
  email?: string | null;
  lease_start: string;
  lease_end?: string | null;
  additional_costs_cents?: number | null;
  personen_anzahl?: number | null;
  anteil_wohnflaeche_m2?: number | null;
  unit?: {
    id: string;
    label: string;
    area_sqm?: number | null;
    property_id?: string;
  } | null;
}

export interface NkaOverviewRow extends NkaPeriod {
  property: NkaPropertySummary | null;
  cost_items_count?: number;
  tenant_shares_count?: number;
}
