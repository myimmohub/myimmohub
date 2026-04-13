export type UnitType = 'residential' | 'commercial' | 'parking' | 'other';
export type RentType = 'fixed' | 'index' | 'stepped';
export type TenantStatus = 'active' | 'notice_given' | 'ended';
export type AllocationMethod = 'direct' | 'sqm' | 'meter_reading' | 'manual';
export type MatchMethod = 'reference' | 'amount' | 'sender_name' | 'manual';
export type MatchStatus = 'auto_matched' | 'suggested' | 'confirmed' | 'rejected';
export type MatchDirection = 'incoming' | 'outgoing';

export interface Unit {
  id: string;
  property_id: string;
  label: string;
  unit_type: UnitType;
  floor: string | null;
  area_sqm: number | null;
  rooms: number | null;
  features: Record<string, unknown>;
  meter_ids: { heat?: string; water?: string; power?: string };
  vat_liable: boolean;
  is_active: boolean;
  created_at: string;
  // joined
  tenants?: Tenant[];
  active_tenant?: Tenant | null;
}

export interface AdditionalTenant {
  name: string;
  email?: string | null;
}

export interface Tenant {
  id: string;
  unit_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  additional_tenants: AdditionalTenant[];
  lease_start: string;
  lease_end: string | null;
  cold_rent_cents: number;
  additional_costs_cents: number;
  deposit_cents: number;
  payment_reference: string | null;
  rent_type: RentType;
  status: TenantStatus;
  source_document_id: string | null;
  extraction_confidence: Record<string, number> | null;
  created_at: string;
  // joined
  unit?: Unit;
}

export interface CostAllocation {
  id: string;
  transaction_id: string;
  unit_id: string;
  allocation_method: AllocationMethod;
  share_percent: number | null;
  amount_cents: number | null;
  meter_value_from: number | null;
  meter_value_to: number | null;
  note: string | null;
  created_at: string;
}

export interface PaymentMatch {
  id: string;
  transaction_id: string;
  tenant_id: string | null;
  unit_id: string | null;
  match_method: MatchMethod;
  match_confidence: number;
  status: MatchStatus;
  direction: MatchDirection;
  period_month: string | null;
  matched_at: string;
  // joined
  tenant?: Tenant | null;
  unit?: Unit | null;
}

export interface LeaseExtractionResult {
  tenant_names: string[];
  lease_start: string | null;
  lease_end: string | null;
  cold_rent_cents: number | null;
  additional_costs_cents: number | null;
  unit_description: string | null;
  area_sqm: number | null;
  payment_reference: string | null;
  confidence_scores: Record<string, number>;
}
