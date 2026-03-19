/**
 * GWI Data Types — shared across all GWI domain components.
 */

import type { MetaEntry } from '@/lib/gwi-report-merge';

export interface FinancialData {
  net_profit?: number;
  net_profit_budget?: number;
  net_profit_variance_pct?: number;
  total_revenue?: number;
  total_revenue_budget?: number;
  tariff_revenue?: number;
  other_operating_revenue?: number;
  non_operating_revenue?: number;
  operating_cost?: number;
  operating_cost_budget?: number;
  employment_cost?: number;
  premises_cost?: number;
  supplies_services?: number;
  transport_cost?: number;
  admin_cost?: number;
  depreciation?: number;
  govt_subvention?: number;
  cash_at_bank?: number;
  net_assets?: number;
  property_equipment?: number;
  work_in_progress?: number;
  current_assets?: number;
  current_liabilities?: number;
  trade_payables?: number;
  gpl_liability?: number;
  _meta?: Record<string, MetaEntry>;
}

export interface CollectionsData {
  total_collections?: number;
  ytd_collections?: number;
  total_billings?: number;
  active_accounts?: number;
  accounts_receivable?: number;
  on_time_payment_pct?: number;
  region_1_collections?: number;
  region_2_collections?: number;
  region_3_collections?: number;
  region_4_collections?: number;
  region_5_collections?: number;
  regional_collections_total?: number;
  key_accounts_collections?: number;
  billing_efficiency_pct?: number;
  arrears_debt_reduction?: number;
  arrears_debt_reduction_pct?: number;
  arrears_30_days?: number;
  arrears_60_days?: number;
  arrears_90_plus_days?: number;
  region_2_billings?: number;
  region_3_billings?: number;
  region_4_billings?: number;
  region_5_billings?: number;
  region_6_billings?: number;
  region_7_billings?: number;
  region_8_billings?: number;
  region_9_billings?: number;
  region_10_billings?: number;
  hinterland_billings?: number;
}

export interface CustomerServiceData {
  total_complaints?: number;
  resolved_complaints?: number;
  resolution_rate_pct?: number;
  within_timeline_pct?: number;
  unresolved_complaints?: number;
  avg_resolution_days?: number;
  disconnections?: number;
  reconnections?: number;
  reconnection_payments?: number;
  legal_actions?: number;
  enforcement_actions?: number;
  legal_actions_amount?: number;
  enforcement_actions_amount?: number;
  puc_complaints?: number;
  puc_resolved?: number;
}

export interface ProcurementData {
  total_purchases?: number;
  gog_funded?: number;
  gog_funded_pct?: number;
  gwi_funded?: number;
  gwi_funded_pct?: number;
  major_contracts_count?: number;
  major_contracts_value?: number;
  minor_contracts_count?: number;
  minor_contracts_value?: number;
  inventory_value?: number;
  inventory_receipts?: number;
  inventory_issues?: number;
  major_contracts_by_type?: Record<string, { count: number; value: number }>;
  minor_contracts_by_type?: Record<string, { count: number; value: number }>;
}

export interface MonthlyReport {
  id: string;
  report_month: string;
  created_at: string;
  financial_data: FinancialData;
  collections_data: CollectionsData;
  customer_service_data: CustomerServiceData;
  procurement_data: ProcurementData;
}
