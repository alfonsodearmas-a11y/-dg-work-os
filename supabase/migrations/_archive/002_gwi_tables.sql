-- GWI Tables Migration
-- Run via Supabase Management API or SQL Editor

-- Monthly management/financial reports
CREATE TABLE IF NOT EXISTS gwi_monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month date NOT NULL,
  report_type text NOT NULL DEFAULT 'management',
  financial_data jsonb DEFAULT '{}',
  collections_data jsonb DEFAULT '{}',
  customer_service_data jsonb DEFAULT '{}',
  procurement_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_month, report_type)
);

-- Weekly complaint reports
CREATE TABLE IF NOT EXISTS gwi_weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_week date NOT NULL,
  complaints_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_week)
);

-- File upload tracking
CREATE TABLE IF NOT EXISTS gwi_uploaded_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  report_type text NOT NULL CHECK (report_type IN ('management', 'cscr', 'procurement')),
  report_period date NOT NULL,
  parsed_data jsonb DEFAULT '{}',
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

-- AI insights cache
CREATE TABLE IF NOT EXISTS gwi_ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_month date NOT NULL,
  insight_type text NOT NULL CHECK (insight_type IN ('monthly_analysis', 'financial', 'operational', 'customer_service', 'procurement')),
  insight_json jsonb NOT NULL DEFAULT '{}',
  model_used text,
  data_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(report_month, insight_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gwi_monthly_reports_month ON gwi_monthly_reports(report_month DESC);
CREATE INDEX IF NOT EXISTS idx_gwi_weekly_reports_week ON gwi_weekly_reports(report_week DESC);
CREATE INDEX IF NOT EXISTS idx_gwi_ai_insights_month ON gwi_ai_insights(report_month DESC);

-- Seed: December 2025 management report with all metrics
INSERT INTO gwi_monthly_reports (report_month, report_type, financial_data, collections_data, customer_service_data, procurement_data)
VALUES (
  '2025-12-01',
  'management',
  '{
    "net_profit": 362400000,
    "net_profit_budget": 100200000,
    "net_profit_variance_pct": 261,
    "total_revenue": 1680000000,
    "total_revenue_budget": 1540000000,
    "tariff_revenue": 1230000000,
    "other_operating_revenue": 318000000,
    "non_operating_revenue": 132000000,
    "operating_cost": 1750000000,
    "operating_cost_budget": 1880000000,
    "employment_cost": 687000000,
    "premises_cost": 298000000,
    "supplies_services": 412000000,
    "transport_cost": 89000000,
    "admin_cost": 156000000,
    "depreciation": 108000000,
    "govt_subvention": 433300000,
    "cash_at_bank": 13400000000,
    "net_assets": 94300000000,
    "property_equipment": 72100000000,
    "work_in_progress": 8900000000,
    "current_assets": 18200000000,
    "current_liabilities": 6400000000,
    "trade_payables": 3200000000,
    "gpl_liability": 1800000000
  }',
  '{
    "total_collections": 673700000,
    "ytd_collections": 7380000000,
    "total_billings": 598200000,
    "active_accounts": 189840,
    "accounts_receivable": 2510000000,
    "on_time_payment_pct": 46,
    "region_1_collections": 198000000,
    "region_2_collections": 156000000,
    "region_3_collections": 142000000,
    "region_4_collections": 97700000,
    "region_5_collections": 80000000,
    "billing_efficiency_pct": 89,
    "arrears_30_days": 890000000,
    "arrears_60_days": 620000000,
    "arrears_90_plus_days": 1000000000
  }',
  '{
    "total_complaints": 2364,
    "resolved_complaints": 2137,
    "resolution_rate_pct": 90,
    "within_timeline_pct": 70,
    "unresolved_complaints": 260,
    "avg_resolution_days": 4.2,
    "disconnections": 1423,
    "reconnections": 1616,
    "reconnection_payments": 487000000,
    "legal_actions": 34,
    "enforcement_actions": 89,
    "puc_complaints": 12,
    "puc_resolved": 9
  }',
  '{
    "total_purchases": 2730000000,
    "gog_funded": 1720000000,
    "gog_funded_pct": 62.9,
    "gwi_funded": 1010000000,
    "gwi_funded_pct": 37.1,
    "major_contracts_count": 14,
    "major_contracts_value": 1660000000,
    "minor_contracts_count": 76,
    "minor_contracts_value": 493500000,
    "inventory_value": 2650000000,
    "inventory_receipts": 389000000,
    "inventory_issues": 412000000,
    "major_contracts_by_type": {
      "infrastructure": {"count": 6, "value": 890000000},
      "equipment": {"count": 4, "value": 420000000},
      "services": {"count": 3, "value": 280000000},
      "other": {"count": 1, "value": 70000000}
    },
    "minor_contracts_by_type": {
      "maintenance": {"count": 32, "value": 198000000},
      "supplies": {"count": 28, "value": 165000000},
      "services": {"count": 16, "value": 130500000}
    }
  }'
)
ON CONFLICT (report_month, report_type) DO UPDATE SET
  financial_data = EXCLUDED.financial_data,
  collections_data = EXCLUDED.collections_data,
  customer_service_data = EXCLUDED.customer_service_data,
  procurement_data = EXCLUDED.procurement_data;
