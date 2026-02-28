export interface PendingApplication {
  id: string
  agency: 'GPL' | 'GWI'
  customerReference: string
  firstName: string
  lastName: string
  telephone: string
  region: string
  district: string
  villageWard: string
  street: string
  lot: string
  eventCode: string
  eventDescription: string
  applicationDate: string
  daysWaiting: number
  dataAsOf: string
  // GPL-specific fields
  pipelineStage?: string
  accountType?: string
  serviceOrderType?: string
  serviceOrderNumber?: string
  accountStatus?: string
  cycle?: string
  divisionCode?: string
}

export interface PendingApplicationStats {
  total: number
  avgDaysWaiting: number
  maxDaysWaiting: number
  longestWaitCustomer: PendingApplication | null
  byRegion: { region: string; count: number; avgDays: number; maxDays: number; over30Count: number }[]
  waitBrackets: { label: string; min: number; max: number | null; count: number }[]
  byStage?: { stage: string; count: number; avgDays: number; slaCompliant: number }[]
  dataAsOf: string
}

// ── Analysis Types ─────────────────────────────────────────────────────────

export interface AgingBucket {
  label: string
  min: number
  max: number | null
  count: number
  pct: number
}

export interface GPLPipelineStage {
  stage: string
  count: number
  avgDays: number
  maxDays: number
  slaDays: number
  slaCompliant: number
  slaBreached: number
  compliancePct: number
}

export interface GPLAnalysis {
  pipeline: GPLPipelineStage[]
  agingBuckets: AgingBucket[]
  accountTypes: { type: string; count: number; avgDays: number }[]
  redFlags: string[]
}

export interface GWIRegionBreakdown {
  region: string
  count: number
  avgDays: number
  maxDays: number
  districts: { district: string; count: number; avgDays: number }[]
}

export interface GWICommunityCluster {
  village: string
  region: string
  count: number
  avgDays: number
}

export interface GWIAnalysis {
  agingBuckets: AgingBucket[]
  regions: GWIRegionBreakdown[]
  communityClusters: GWICommunityCluster[]
  redFlags: string[]
}

export interface DeepAnalysisResult {
  id: string
  agency: 'GPL' | 'GWI'
  analysisDate: string
  executiveSummary: string
  sections: { title: string; severity: 'critical' | 'warning' | 'stable' | 'positive'; summary: string; detail: string }[]
  recommendations: { category: string; recommendation: string; urgency: 'Immediate' | 'Short-term' | 'Long-term' }[]
  createdAt: string
}

export interface Snapshot {
  id: string
  agency: 'GPL' | 'GWI'
  snapshotDate: string
  totalCount: number
  summaryData: {
    avgDaysWaiting?: number
    maxDaysWaiting?: number
    byStage?: Record<string, number>
    byRegion?: Record<string, number>
    over30Count?: number
  }
}

export interface ParseResult {
  success: boolean
  records: PendingRecord[]
  agency: 'GPL' | 'GWI'
  dataAsOf: string
  sheetName: string
  warnings: string[]
}

export interface PendingRecord {
  agency: 'GPL' | 'GWI'
  customer_reference: string | null
  first_name: string | null
  last_name: string | null
  telephone: string | null
  region: string | null
  district: string | null
  village_ward: string | null
  street: string | null
  lot: string | null
  event_code: string | null
  event_description: string | null
  application_date: string
  days_waiting: number
  raw_data: Record<string, unknown>
  data_as_of: string
  pipeline_stage?: string | null
  account_type?: string | null
  service_order_type?: string | null
  service_order_number?: string | null
  account_status?: string | null
  cycle?: string | null
  division_code?: string | null
}
