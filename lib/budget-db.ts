import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'budget_estimates.db');

let _db: Database.Database | null = null;

export function getBudgetDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  }
  return _db;
}

export function fmtAmount(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '—';
  const sign = val < 0 ? '-' : '';
  const v = Math.abs(val);
  if (v >= 1_000_000) return `${sign}G$${(v / 1_000_000).toFixed(2)}B`;
  if (v >= 1_000) return `${sign}G$${(v / 1_000).toFixed(2)}M`;
  return `${sign}G$${v.toLocaleString()}K`;
}

// ── Document-to-Budget Linkage Map ──

interface DocLink {
  doc: string;
  label: string;
  tag: string;
}

const DOCUMENT_LINKS: Record<string, Record<string, DocLink[]>> = {
  GPL: {
    'Capital Expenditure': [
      { doc: 'GPL Capital Expenditure Justification- Budget 2026.pdf', label: 'Capex Justification: 17+ rollover projects with contractors, costs & scope', tag: 'capex-detail' },
      { doc: 'GPL Capital Expenditure 2026 Details.pdf', label: 'Capex Details: Procurement table with tender status', tag: 'capex-procurement' },
      { doc: 'Justification for L1 and L3.pdf', label: 'L1/L3 Justification: 69kV transmission upgrades, Kingston-Sophia, East Bank', tag: 'l1-l3' },
    ],
    Subsidy: [
      { doc: 'GPL Budget 2026 Revised.pdf', label: 'GPL Budget 2026: P&L, cash flow, generation plan, employment costs', tag: 'budget-revised' },
      { doc: 'Justification for L1 and L3.pdf', label: 'Strategic Overview: Infrastructure expansion & expected outcomes', tag: 'l1-l3' },
      { doc: 'GPL - Financial Summarizes Years 2014 to 2025 (Act) and Budget for Year2026.pdf', label: 'Financial History: Revenue/cost trends 2014-2025', tag: 'financial-history' },
      { doc: 'GPL Unit Cost Analysis 2024-2025.pdf', label: 'Unit Cost Analysis: Generation cost benchmarking', tag: 'unit-costs' },
    ],
    _general: [
      { doc: 'GPL Budget 2026 Revised.pdf', label: 'GPL Full Budget 2026: Financial statements & projections', tag: 'budget-revised' },
    ],
  },
  GWI: {
    'Water Supply Improvement': [
      { doc: 'GWI_Projects_Critical_Analysis_Feb2026.docx', label: 'Projects Critical Analysis: WSIP status, risk assessment, expenditure tracking', tag: 'critical-analysis' },
      { doc: 'GOG Budget Proposal Submission 2026 V9.xlsx', label: 'Capital Budget Proposal: Summary + IDB/CDB foreign-funded project breakdowns', tag: 'budget-proposal' },
    ],
    'Coastal Water': [
      { doc: 'GWI_Projects_Critical_Analysis_Feb2026.docx', label: 'Projects Critical Analysis: WTP status, Bachelor\'s Adventure, transmission', tag: 'critical-analysis' },
      { doc: 'GOG Budget Proposal Submission 2026 V9.xlsx', label: 'Capital Budget Proposal: G$15B coastal programme', tag: 'budget-proposal' },
    ],
    'Urban Sewerage': [
      { doc: 'GWI_Projects_Critical_Analysis_Feb2026.docx', label: 'Projects Critical Analysis: Urban sewerage project status', tag: 'critical-analysis' },
      { doc: 'GOG Budget Proposal Submission 2026 V9.xlsx', label: 'Capital Budget Proposal: G$9B urban programme', tag: 'budget-proposal' },
    ],
    'Hinterland Water': [
      { doc: 'GWI_Projects_Critical_Analysis_Feb2026.docx', label: 'Projects Critical Analysis: Hinterland water supply status', tag: 'critical-analysis' },
      { doc: 'GOG Budget Proposal Submission 2026 V9.xlsx', label: 'Capital Budget Proposal: G$4.7B hinterland programme', tag: 'budget-proposal' },
    ],
    Subsidy: [
      { doc: 'GWI- Budget 2026 queries .docx', label: 'Budget Queries: Employment costs breakdown, field materials, work programme', tag: 'budget-queries' },
    ],
    Capital: [
      { doc: 'GOG Budget Proposal Submission 2026 V9.xlsx', label: 'Capital Budget Proposal: Full G$40B programme', tag: 'budget-proposal' },
    ],
    _general: [
      { doc: 'GWI December 2025 Management Report.docx', label: 'Management Report Dec 2025: Tariff revenue, asset valuations', tag: 'mgmt-report' },
      { doc: 'GWI_Projects_Critical_Analysis_Feb2026.docx', label: 'Projects Critical Analysis: Full capital programme performance review', tag: 'critical-analysis' },
      { doc: 'GOG Budget Proposal Submission 2026 V9.xlsx', label: 'GOG Capital Budget Proposal 2026', tag: 'budget-proposal' },
    ],
  },
  CJIA: {
    'CJIA Corporation': [
      { doc: 'CJIA_Capital_Projects_Brief_Jan2026.docx', label: 'Capital Projects Brief: 5 projects', tag: 'projects-brief' },
      { doc: 'New Administrative Building Project Status-January 2026.pdf', label: 'Admin Building Status', tag: 'admin-bldg' },
      { doc: 'New Terminal Building Project Status-January 2026.pdf', label: 'Terminal Building Status', tag: 'terminal-bldg' },
    ],
    Capital: [
      { doc: 'CJIA_Capital_Projects_Brief_Jan2026.docx', label: 'Capital Projects Brief: Portfolio overview', tag: 'projects-brief' },
    ],
    _general: [
      { doc: 'CJIA_Capital_Projects_Brief_Jan2026.docx', label: 'Capital Projects Executive Brief — Jan 2026', tag: 'projects-brief' },
    ],
  },
  HECI: {
    'Hinterland Electrification': [
      { doc: 'HECI Strategic Plan 2026-2030.pptx', label: 'Strategic Plan 2026-2030: Community targets, satellite companies, solar expansion', tag: 'strategic-plan' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Hinterland Utilities Brief: 7 companies — staff, consumers, tariffs, capacity, financials', tag: 'utilities-brief' },
      { doc: 'All Companies - Subsidy for2026.xls', label: 'Subsidy Allocations 2026: G$7.5B across 7 power companies + KUI + HECI admin', tag: 'subsidy-table' },
    ],
    Subsidy: [
      { doc: 'All Companies - Subsidy for2026.xls', label: 'Subsidy Allocations: Company-by-company breakdown — LINMINE G$4.8B, Lethem G$662M, KUI G$999M', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Hinterland Utilities Brief: Operational context for each subsidy recipient', tag: 'utilities-brief' },
      { doc: 'HECI Strategic Plan 2026-2030.pptx', label: 'Strategic Plan: Mission, performance indicators, budget context', tag: 'strategic-plan' },
      { doc: 'HECI - Appendix T - 2026 & 2025.xlsx', label: 'HECI Appendix T: G$95M admin budget — employment G$72M, recurrent G$23M', tag: 'appendix-t' },
    ],
    Employment: [
      { doc: 'HECI - Appendix T - 2026 & 2025.xlsx', label: 'HECI Appendix T: Employment costs G$72M (9 contracted staff), recurrent charges', tag: 'appendix-t' },
    ],
    Capital: [
      { doc: 'HECI Strategic Plan 2026-2030.pptx', label: 'Strategic Plan: Capital programme scope — 8 satellite companies', tag: 'strategic-plan' },
    ],
    _general: [
      { doc: 'HECI Strategic Plan 2026-2030.pptx', label: 'HECI Strategic Plan 2026-2030: Full presentation', tag: 'strategic-plan' },
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Allocations: All 9 companies under HECI — G$7.5B total', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Brief on Hinterland Utilities: Operational profiles for all 7 power companies + KUI', tag: 'utilities-brief' },
      { doc: 'HECI - Appendix T - 2026 & 2025.xlsx', label: 'HECI Appendix T: Statutory body financial summary 2025/2026', tag: 'appendix-t' },
    ],
  },
  KUI: {
    Subsidy: [
      { doc: 'KUI - Appendix T - 2026 & 2025.xlsx', label: 'KUI Appendix T: G$999M budget — fuel G$426M, employment G$339M, 119 staff', tag: 'appendix-t' },
      { doc: 'All Companies - Subsidy for2026.xls', label: 'Subsidy Allocations: KUI G$998.9M for fuel & admin costs', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: KUI — 1,266 consumers, 893kW peak, electricity + water + sanitation', tag: 'utilities-brief' },
    ],
    Employment: [
      { doc: 'KUI - Appendix T - 2026 & 2025.xlsx', label: 'KUI Appendix T: Employment G$339M — wages G$224M, overhead G$115M, 119 contracted staff', tag: 'appendix-t' },
    ],
    Capital: [
      { doc: 'KUI - Appendix T - 2026 & 2025.xlsx', label: 'KUI Appendix T: Full financial summary — revenue, expenditure breakdown', tag: 'appendix-t' },
    ],
    _general: [
      { doc: 'KUI - Appendix T - 2026 & 2025.xlsx', label: 'KUI Appendix T: Statutory body financial summary 2025/2026 — G$999M budget', tag: 'appendix-t' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: Kwakwani Utilities — electricity, water & sanitation for 1,266 consumers', tag: 'utilities-brief' },
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Table: KUI allocation G$998.9M', tag: 'subsidy-table' },
    ],
  },
  LINMINE: {
    Subsidy: [
      { doc: 'All Companies - Subsidy for2026.xls', label: 'Subsidy Allocations: LINMINE G$4.81B — largest hinterland fuel subvention', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: LINMINE — 13,699 consumers, 14.1MW peak, 70 staff, BOSAI PPA', tag: 'utilities-brief' },
    ],
    _general: [
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Table: LINMINE G$4.81B fuel subvention', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: Linden Electricity — 13,699 consumers, power via BOSAI PPA', tag: 'utilities-brief' },
    ],
  },
  LPC: {
    _general: [
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Table: Lethem Power G$662.5M fuel subvention', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: Lethem Power — 1,891 consumers, 2,520kW peak, 101 staff', tag: 'utilities-brief' },
    ],
  },
  MABARUMA: {
    _general: [
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Table: Mabaruma Power G$545M fuel subvention (+139%)', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: Mabaruma Power — 1,364 consumers, 1,062kW peak, 17 staff', tag: 'utilities-brief' },
    ],
  },
  MAHDIA: {
    _general: [
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Table: Mahdia Power G$158.6M fuel subvention', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: Mahdia Power — 823 consumers, 630kW peak, 31 staff', tag: 'utilities-brief' },
    ],
  },
  PKAITUMA: {
    _general: [
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Table: Port Kaituma Power G$105.3M fuel subvention', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: Port Kaituma Power — 1,070 consumers, 762kW peak, 23 staff', tag: 'utilities-brief' },
    ],
  },
  MRIDGE: {
    _general: [
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Table: Matthew\'s Ridge Power G$75M fuel subvention (+53%)', tag: 'subsidy-table' },
      { doc: 'BRIEF ON HINTERLAND UTILITIES-1.docx', label: 'Utilities Brief: Matthew\'s Ridge Power — 172 consumers, 165kW peak, 6 staff', tag: 'utilities-brief' },
    ],
  },
  MORUCA: {
    _general: [
      { doc: 'All Companies - Subsidy for2026.xls', label: '2026 Subsidy Table: Moruca Power G$60M fuel subvention (+150%)', tag: 'subsidy-table' },
    ],
  },
  MARAD: {
    Dredging: [
      { doc: 'DG MARAD BUDGET BRIEF FOR MINISTER.docx', label: 'DG Budget Brief: Vessel traffic +67%, port development, dredging programme', tag: 'dg-brief' },
      { doc: 'BUDGET 2026- Write Current Budget with edits-3.docx', label: 'Current Budget Write-Up: MARAD overview, capital grants, infrastructure maintenance', tag: 'budget-writeup' },
    ],
    Navigational: [
      { doc: 'DG MARAD BUDGET BRIEF FOR MINISTER.docx', label: 'DG Budget Brief: G$800M for concrete leading beacons & vessel traffic service', tag: 'dg-brief' },
      { doc: 'BUDGET 2026- Write Current Budget with edits-3.docx', label: 'Current Budget Write-Up: Capital revenue from Central Govt for project execution', tag: 'budget-writeup' },
    ],
    Employment: [
      { doc: 'BUDGET 2026- Write Current Budget with edits-3.docx', label: 'Current Budget Write-Up: Employment costs, training, education subventions', tag: 'budget-writeup' },
    ],
    Revenue: [
      { doc: 'BUDGET 2026- Write Current Budget with edits-3.docx', label: 'Current Budget Write-Up: Revenue from fees, dues, charges & admin services', tag: 'budget-writeup' },
      { doc: 'DG MARAD BUDGET BRIEF FOR MINISTER.docx', label: 'DG Budget Brief: Marine traffic growth, port construction applications', tag: 'dg-brief' },
    ],
    Capital: [
      { doc: 'DG MARAD BUDGET BRIEF FOR MINISTER.docx', label: 'DG Budget Brief: Capital programme — dredging, beacons, vessel traffic service', tag: 'dg-brief' },
      { doc: 'BUDGET 2026- Write Current Budget with edits-3.docx', label: 'Current Budget Write-Up: Capital grants from Central Govt, infrastructure maintenance', tag: 'budget-writeup' },
    ],
    Maintenance: [
      { doc: 'BUDGET 2026- Write Current Budget with edits-3.docx', label: 'Current Budget Write-Up: Aged vessel repairs, maintenance costs from current revenue', tag: 'budget-writeup' },
    ],
    _general: [
      { doc: 'DG MARAD BUDGET BRIEF FOR MINISTER.docx', label: 'DG MARAD Budget Brief for Minister — Feb 2026', tag: 'dg-brief' },
      { doc: 'BUDGET 2026- Write Current Budget with edits-3.docx', label: 'MARAD Current Budget Write-Up: Overview, revenue, expenditure projections 2026', tag: 'budget-writeup' },
    ],
  },
};

export function getLinkedDocs(agencyCode: string, lineItem: string): DocLink[] {
  const agencyLinks = DOCUMENT_LINKS[agencyCode] || {};
  const matched: DocLink[] = [];
  const seenDocs = new Set<string>();

  for (const [pattern, docs] of Object.entries(agencyLinks)) {
    if (pattern === '_general') continue;
    if ((lineItem || '').toLowerCase().includes(pattern.toLowerCase())) {
      for (const d of docs) {
        if (!seenDocs.has(d.doc)) {
          matched.push(d);
          seenDocs.add(d.doc);
        }
      }
    }
  }

  if (matched.length === 0 && agencyLinks._general) {
    for (const d of agencyLinks._general) {
      if (!seenDocs.has(d.doc)) {
        matched.push(d);
        seenDocs.add(d.doc);
      }
    }
  }

  return matched;
}

// ── Query Functions ──

export interface BudgetAllocation {
  sector: string;
  agency_code: string;
  agency_name: string;
  programme: string;
  programme_number: string;
  line_item: string;
  line_item_code: string;
  expenditure_type: string;
  actual_2024: number;
  budget_2025: number;
  revised_2025: number;
  budget_2026: number;
  source_volume: number;
  source_page: number;
  notes: string | null;
  actual_2024_fmt: string;
  budget_2025_fmt: string;
  revised_2025_fmt: string;
  budget_2026_fmt: string;
  source: string;
  linked_docs: DocLink[];
}

// ── GPL Disaggregated Detail ──

function fmtGplAmount(val: number | null | undefined): string {
  if (val === null || val === undefined || val === 0) return '—';
  const sign = val < 0 ? '-' : '';
  const v = Math.abs(val) / 1000; // GPL tables are in G$ not G$'000
  if (v >= 1_000_000) return `${sign}G$${(v / 1_000_000).toFixed(2)}B`;
  if (v >= 1_000) return `${sign}G$${(v / 1_000).toFixed(2)}M`;
  if (v >= 1) return `${sign}G$${v.toFixed(0)}K`;
  return `${sign}G$${Math.abs(val).toLocaleString()}`;
}

export function getGplDetail() {
  const db = getBudgetDb();

  // Capital projects
  const capitalProjects = db.prepare("SELECT * FROM gpl_capital_projects ORDER BY project_number").all() as Record<string, unknown>[];
  for (const cp of capitalProjects) {
    cp.project_cost_usd_fmt = cp.project_cost_usd ? `US$${((cp.project_cost_usd as number) / 1e6).toFixed(1)}M` : '—';
    cp.project_cost_gyd_fmt = cp.project_cost_gyd ? `G$${((cp.project_cost_gyd as number) / 1e9).toFixed(2)}B` : '—';
  }

  // P&L
  const pnl = db.prepare("SELECT * FROM gpl_financials WHERE statement_type='pnl' ORDER BY id").all() as Record<string, unknown>[];
  for (const r of pnl) {
    for (const k of ['budget_2026', 'projection_2025', 'budget_2025', 'actual_2024']) {
      (r as Record<string, unknown>)[`${k}_fmt`] = r[k] ? fmtAmount(r[k] as number) : '—';
    }
  }

  // Detailed P&L
  const pnlDetailed = db.prepare("SELECT * FROM gpl_financials WHERE statement_type='pnl_detailed' ORDER BY id").all() as Record<string, unknown>[];
  for (const r of pnlDetailed) {
    for (const k of ['budget_2026', 'projection_2025', 'actual_2024']) {
      (r as Record<string, unknown>)[`${k}_fmt`] = r[k] ? fmtAmount(r[k] as number) : '—';
    }
  }

  // Cash budget
  const cashBudget = db.prepare("SELECT * FROM gpl_financials WHERE statement_type='cash_budget' ORDER BY id").all() as Record<string, unknown>[];
  for (const r of cashBudget) {
    for (const k of ['budget_2026', 'projection_2025', 'actual_2024']) {
      (r as Record<string, unknown>)[`${k}_fmt`] = r[k] ? fmtAmount(r[k] as number) : '—';
    }
  }

  // Balance sheet
  const balanceSheet = db.prepare("SELECT * FROM gpl_financials WHERE statement_type='balance_sheet' ORDER BY id").all() as Record<string, unknown>[];
  for (const r of balanceSheet) {
    for (const k of ['budget_2026', 'projection_2025', 'actual_2024']) {
      (r as Record<string, unknown>)[`${k}_fmt`] = r[k] ? fmtAmount(r[k] as number) : '—';
    }
  }

  // Capital summary
  const capitalSummary = db.prepare("SELECT * FROM gpl_financials WHERE statement_type='capital' ORDER BY id").all() as Record<string, unknown>[];
  for (const r of capitalSummary) {
    for (const k of ['budget_2026', 'projection_2025', 'actual_2024']) {
      (r as Record<string, unknown>)[`${k}_fmt`] = r[k] ? fmtAmount(r[k] as number) : '—';
    }
  }

  // Employment
  const employment = db.prepare("SELECT * FROM gpl_employment ORDER BY id").all() as Record<string, unknown>[];
  for (const r of employment) {
    for (const k of ['budget_2026', 'estimate_2025', 'variance']) {
      (r as Record<string, unknown>)[`${k}_fmt`] = r[k] ? fmtGplAmount(r[k] as number) : '—';
    }
  }

  // Generation plan
  const generation = db.prepare("SELECT * FROM gpl_generation ORDER BY id").all() as Record<string, unknown>[];

  // Admin expenses
  const adminExpenses = db.prepare("SELECT * FROM gpl_admin_expenses ORDER BY id").all() as Record<string, unknown>[];
  for (const r of adminExpenses) {
    for (const k of ['budget_2026', 'actual_2025', 'change_amount']) {
      (r as Record<string, unknown>)[`${k}_fmt`] = r[k] ? fmtGplAmount(r[k] as number) : '—';
    }
  }

  return {
    capital_projects: capitalProjects,
    pnl,
    pnl_detailed: pnlDetailed,
    cash_budget: cashBudget,
    balance_sheet: balanceSheet,
    capital_summary: capitalSummary,
    employment,
    generation,
    admin_expenses: adminExpenses,
  };
}

export function getSectorDetail(sector: string) {
  const db = getBudgetDb();

  // All allocations for this sector, grouped by agency
  const allocs = db.prepare(`
    SELECT * FROM budget_allocations WHERE sector = ? ORDER BY agency_code, expenditure_type, budget_2026 DESC
  `).all(sector) as Record<string, unknown>[];

  const allocations: BudgetAllocation[] = allocs.map(r => ({
    sector: r.sector as string,
    agency_code: r.agency_code as string,
    agency_name: r.agency_name as string,
    programme: r.programme as string,
    programme_number: r.programme_number as string,
    line_item: r.line_item as string,
    line_item_code: r.line_item_code as string,
    expenditure_type: r.expenditure_type as string,
    actual_2024: r.actual_2024 as number,
    budget_2025: r.budget_2025 as number,
    revised_2025: r.revised_2025 as number,
    budget_2026: r.budget_2026 as number,
    source_volume: r.source_volume as number,
    source_page: r.source_page as number,
    notes: r.notes as string | null,
    actual_2024_fmt: fmtAmount(r.actual_2024 as number),
    budget_2025_fmt: fmtAmount(r.budget_2025 as number),
    revised_2025_fmt: fmtAmount(r.revised_2025 as number),
    budget_2026_fmt: fmtAmount(r.budget_2026 as number),
    source: `V${r.source_volume}p${r.source_page}`,
    linked_docs: getLinkedDocs(r.agency_code as string, r.line_item as string),
  }));

  // Get unique agency codes in this sector
  const agencyCodes = [...new Set(allocs.map(a => a.agency_code as string))];

  // Capital projects for all agencies in this sector
  const projects = agencyCodes.length > 0
    ? db.prepare(`
        SELECT * FROM capital_project_profiles
        WHERE ${agencyCodes.map(() => 'agency_code = ?').join(' OR ')}
        ORDER BY budget_2026 DESC
      `).all(...agencyCodes) as Record<string, unknown>[]
    : [];

  // Performance indicators for all agencies in this sector
  const indicators = agencyCodes.length > 0
    ? db.prepare(`
        SELECT * FROM performance_indicators
        WHERE ${agencyCodes.map(() => 'agency_code = ?').join(' OR ')}
      `).all(...agencyCodes) as Record<string, unknown>[]
    : [];

  // Documents for all agencies in this sector
  const docRows = agencyCodes.length > 0
    ? db.prepare(`
        SELECT agency, document_name, COUNT(*) as chunk_count, SUBSTR(MIN(text_content), 1, 400) as first_snippet
        FROM agency_documents
        WHERE ${agencyCodes.map(() => 'agency = ?').join(' OR ')}
        GROUP BY agency, document_name ORDER BY agency, document_name
      `).all(...agencyCodes) as { agency: string; document_name: string; chunk_count: number; first_snippet: string }[]
    : [];

  // GPL loans if energy sector
  const loans = sector === 'energy'
    ? db.prepare("SELECT * FROM gpl_loans").all() as Record<string, unknown>[]
    : [];

  // GPL disaggregated detail if energy sector
  const gplDetail = sector === 'energy' ? getGplDetail() : null;

  return {
    sector,
    agency_codes: agencyCodes,
    allocations,
    projects,
    indicators,
    documents: docRows,
    loans,
    gpl_detail: gplDetail,
  };
}

export function getSummary() {
  const db = getBudgetDb();

  const sectorDefs = [
    { sector: 'energy', prog: '342', label: 'Electricity Services', color: '#ef4444' },
    { sector: 'water', prog: '343', label: 'Water Services', color: '#3b82f6' },
    { sector: 'aviation', prog: '344', label: 'Aviation', color: '#06b6d4' },
    { sector: 'maritime', prog: '345', label: 'Maritime Administration', color: '#22c55e' },
  ];

  const sectors = sectorDefs.map(({ sector, prog, label, color }) => {
    const total = (db.prepare(
      "SELECT budget_2026 FROM budget_allocations WHERE sector=? AND expenditure_type='total' AND programme_number=?"
    ).get(sector, prog) as { budget_2026: number } | undefined)?.budget_2026 || 0;

    const current = (db.prepare(
      "SELECT budget_2026 FROM budget_allocations WHERE sector=? AND expenditure_type='current' AND programme_number=?"
    ).get(sector, prog) as { budget_2026: number } | undefined)?.budget_2026 || 0;

    const capital = (db.prepare(
      "SELECT budget_2026 FROM budget_allocations WHERE sector=? AND expenditure_type='capital' AND programme_number=?"
    ).get(sector, prog) as { budget_2026: number } | undefined)?.budget_2026 || 0;

    const items = db.prepare(`
      SELECT line_item, budget_2026, expenditure_type, agency_code FROM budget_allocations
      WHERE sector=? AND programme_number=? AND expenditure_type NOT IN ('total') AND budget_2026 > 0
      ORDER BY budget_2026 DESC LIMIT 5
    `).all(sector, prog) as { line_item: string; budget_2026: number; expenditure_type: string; agency_code: string }[];

    return {
      sector, programme_number: prog, label, color,
      total, total_fmt: fmtAmount(total),
      current, current_fmt: fmtAmount(current),
      capital, capital_fmt: fmtAmount(capital),
      top_items: items.map(i => ({
        line_item: i.line_item, budget_2026: i.budget_2026,
        budget_2026_fmt: fmtAmount(i.budget_2026),
        type: i.expenditure_type, agency: i.agency_code,
      })),
    };
  });

  const grandTotal = sectors.reduce((s, sec) => s + sec.total, 0);

  return {
    sectors,
    grand_total: grandTotal,
    grand_total_fmt: fmtAmount(grandTotal),
  };
}

export function getAgencyDetail(code: string) {
  const db = getBudgetDb();
  const codeUpper = code.toUpperCase();

  const agencyInfo = db.prepare("SELECT * FROM target_agencies WHERE agency_code = ?").get(codeUpper) as Record<string, unknown> | undefined;

  const allocs = db.prepare(`
    SELECT * FROM budget_allocations
    WHERE agency_code = ? OR agency_name LIKE ?
    ORDER BY expenditure_type, budget_2026 DESC
  `).all(codeUpper, `%${code}%`) as Record<string, unknown>[];

  const allocations: BudgetAllocation[] = allocs.map(r => ({
    sector: r.sector as string,
    agency_code: r.agency_code as string,
    agency_name: r.agency_name as string,
    programme: r.programme as string,
    programme_number: r.programme_number as string,
    line_item: r.line_item as string,
    line_item_code: r.line_item_code as string,
    expenditure_type: r.expenditure_type as string,
    actual_2024: r.actual_2024 as number,
    budget_2025: r.budget_2025 as number,
    revised_2025: r.revised_2025 as number,
    budget_2026: r.budget_2026 as number,
    source_volume: r.source_volume as number,
    source_page: r.source_page as number,
    notes: r.notes as string | null,
    actual_2024_fmt: fmtAmount(r.actual_2024 as number),
    budget_2025_fmt: fmtAmount(r.budget_2025 as number),
    revised_2025_fmt: fmtAmount(r.revised_2025 as number),
    budget_2026_fmt: fmtAmount(r.budget_2026 as number),
    source: `V${r.source_volume}p${r.source_page}`,
    linked_docs: getLinkedDocs(codeUpper, r.line_item as string),
  }));

  const projects = db.prepare(`
    SELECT * FROM capital_project_profiles WHERE agency_code = ? OR agency_name LIKE ?
  `).all(codeUpper, `%${code}%`) as Record<string, unknown>[];

  const indicators = db.prepare(`
    SELECT * FROM performance_indicators WHERE agency_code = ? OR programme LIKE ?
  `).all(codeUpper, `%${code}%`) as Record<string, unknown>[];

  const loans = codeUpper === 'GPL'
    ? db.prepare("SELECT * FROM gpl_loans").all() as Record<string, unknown>[]
    : [];

  // Documents
  const docRows = db.prepare(`
    SELECT document_name, COUNT(*) as chunk_count, SUBSTR(MIN(text_content), 1, 400) as first_snippet
    FROM agency_documents WHERE agency = ? GROUP BY document_name ORDER BY document_name
  `).all(codeUpper) as { document_name: string; chunk_count: number; first_snippet: string }[];

  // GPL disaggregated detail
  const gplDetail = codeUpper === 'GPL' ? getGplDetail() : null;

  return {
    agency: agencyInfo || null,
    allocations,
    projects,
    indicators,
    loans,
    documents: docRows,
    gpl_detail: gplDetail,
  };
}

export function getDocumentContent(agency: string, docName: string) {
  const db = getBudgetDb();
  let rows = db.prepare(`
    SELECT id, page_number, text_content FROM agency_documents
    WHERE agency = ? AND document_name = ? ORDER BY id
  `).all(agency.toUpperCase(), docName) as { id: number; page_number: number; text_content: string }[];

  if (rows.length === 0) {
    rows = db.prepare(`
      SELECT id, page_number, text_content FROM agency_documents
      WHERE document_name = ? ORDER BY id
    `).all(docName) as { id: number; page_number: number; text_content: string }[];
  }

  return rows;
}

export function buildAnalysisContext(agencyCode: string, lineItem: string): string {
  const db = getBudgetDb();
  const sections: string[] = [];

  // 1. Budget allocation row
  const alloc = db.prepare(`
    SELECT * FROM budget_allocations WHERE agency_code = ? AND line_item LIKE ? LIMIT 1
  `).get(agencyCode, `%${lineItem}%`) as Record<string, unknown> | undefined;

  if (alloc) {
    sections.push(`## BUDGET ALLOCATION
Line Item: ${alloc.line_item}
Agency: ${alloc.agency_code} — ${alloc.agency_name}
Programme: ${alloc.programme} (Programme ${alloc.programme_number})
Sector: ${alloc.sector}
Type: ${alloc.expenditure_type}
2024 Actual: G$${(alloc.actual_2024 as number || 0).toLocaleString()}K
2025 Budget: G$${(alloc.budget_2025 as number || 0).toLocaleString()}K
2025 Revised: G$${(alloc.revised_2025 as number || 0).toLocaleString()}K
2026 Budget: G$${(alloc.budget_2026 as number || 0).toLocaleString()}K
Source: Volume ${alloc.source_volume}, Page ${alloc.source_page}
Notes: ${alloc.notes || 'None'}`);
  }

  // 2. Linked documents
  const linked = getLinkedDocs(agencyCode, lineItem);
  for (const docInfo of linked) {
    const rows = db.prepare(`
      SELECT text_content FROM agency_documents WHERE document_name = ? ORDER BY id
    `).all(docInfo.doc) as { text_content: string }[];
    if (rows.length > 0) {
      let fullText = rows.map(r => r.text_content).join('\n---\n');
      if (fullText.length > 15000) fullText = fullText.slice(0, 15000) + '\n... [truncated]';
      sections.push(`## SUPPORTING DOCUMENT: ${docInfo.doc}\nRelevance: ${docInfo.label}\n${fullText}`);
    }
  }

  // 3. Capital project profiles
  const keywords = lineItem.split(/\s+/).filter(w => w.length > 3);
  if (keywords.length > 0) {
    const kwWhere = keywords.map(() => '(project_title LIKE ? OR description LIKE ?)').join(' OR ');
    const kwParams: string[] = [];
    keywords.forEach(kw => kwParams.push(`%${kw}%`, `%${kw}%`));

    let projects = db.prepare(`
      SELECT * FROM capital_project_profiles
      WHERE (agency_code = ? OR agency_name LIKE ?) AND (${kwWhere})
    `).all(agencyCode, `%${agencyCode}%`, ...kwParams) as Record<string, unknown>[];

    if (projects.length === 0) {
      projects = db.prepare(`
        SELECT * FROM capital_project_profiles WHERE agency_code = ? OR agency_name LIKE ?
      `).all(agencyCode, `%${agencyCode}%`) as Record<string, unknown>[];
    }

    if (projects.length > 0) {
      const projText = projects.map(p =>
        `- ${p.project_title} (Ref: ${p.ref_number})\n  Status: ${p.status} | Region: ${p.region}\n  Total Cost: G$${(p.total_project_cost as number || 0).toLocaleString()}K | 2026 Budget: G$${(p.budget_2026 as number || 0).toLocaleString()}K\n  Description: ${p.description}\n  Benefits: ${p.benefits}`
      ).join('\n');
      sections.push(`## CAPITAL PROJECT PROFILES\n${projText}`);
    }
  }

  // 4. Performance indicators
  const indicators = db.prepare(`
    SELECT * FROM performance_indicators WHERE agency_code = ? OR programme LIKE ?
  `).all(agencyCode, `%${agencyCode}%`) as Record<string, unknown>[];
  if (indicators.length > 0) {
    const indText = indicators.map(i =>
      `- ${i.indicator}: Target 2025=${i.target_2025} → Target 2026=${i.target_2026} (Source: V${i.source_volume}p${i.source_page})`
    ).join('\n');
    sections.push(`## PERFORMANCE INDICATORS\n${indText}`);
  }

  // 5. GPL disaggregated data (if GPL)
  if (agencyCode === 'GPL') {
    try {
      const gpl = getGplDetail();
      // Capital projects summary
      if (gpl.capital_projects.length > 0) {
        const cpText = gpl.capital_projects.map(cp =>
          `- Project #${cp.project_number}: ${cp.project_name} | Contractor: ${cp.contractor} | Cost: ${cp.project_cost_gyd_fmt} | Status: ${cp.is_rollover ? 'Rollover' : 'New'}`
        ).join('\n');
        sections.push(`### GPL Capital Projects (Disaggregated)\n${cpText}`);
      }
      // P&L summary
      if (gpl.pnl.length > 0) {
        const pnlText = gpl.pnl.slice(0, 15).map(row =>
          `- ${row.item}: 2024 Actual=${row.actual_2024_fmt ?? '—'} | 2025 Proj=${row.projection_2025_fmt ?? '—'} | 2026 Budget=${row.budget_2026_fmt ?? '—'}`
        ).join('\n');
        sections.push(`### GPL Profit & Loss Summary\n${pnlText}`);
      }
      // Employment
      if (gpl.employment.length > 0) {
        const empText = gpl.employment.slice(0, 10).map(row =>
          `- ${row.category}: 2025 Est=${row.estimate_2025_fmt ?? '—'} | 2026 Budget=${row.budget_2026_fmt ?? '—'}`
        ).join('\n');
        sections.push(`### GPL Employment Costs\n${empText}`);
      }
    } catch { /* ignore if tables missing */ }
  }

  // 6. Other allocations for context
  const otherAllocs = db.prepare(`
    SELECT line_item, expenditure_type, budget_2026, actual_2024, budget_2025, revised_2025
    FROM budget_allocations WHERE agency_code = ? AND line_item NOT LIKE ?
    ORDER BY budget_2026 DESC LIMIT 10
  `).all(agencyCode, `%${lineItem}%`) as Record<string, unknown>[];
  if (otherAllocs.length > 0) {
    const oaText = otherAllocs.map(oa =>
      `- ${oa.line_item} (${oa.expenditure_type}): 2026=${fmtAmount(oa.budget_2026 as number)}`
    ).join('\n');
    sections.push(`## OTHER ALLOCATIONS FOR ${agencyCode} (CONTEXT)\n${oaText}`);
  }

  let context = sections.join('\n\n');
  if (context.length > 80000) context = context.slice(0, 80000) + '\n\n... [context truncated]';
  return context;
}

// ── Search ──

export interface BudgetLineItem {
  id: number;
  volume: number;
  page_number: number;
  agency: string;
  programme: string;
  programme_number: string;
  line_item: string;
  description: string;
  expenditure_type: string;
  actual_previous_year: number;
  revised_current_year: number;
  budget_estimate: number;
  actual_previous_year_fmt: string;
  revised_current_year_fmt: string;
  budget_estimate_fmt: string;
  source: string;
}

export interface SearchResults {
  allocations: BudgetAllocation[];
  line_items: BudgetLineItem[];
  projects: Record<string, unknown>[];
  indicators: Record<string, unknown>[];
  documents: { agency: string; document_name: string; snippet: string }[];
  loans: Record<string, unknown>[];
  raw_pages: { volume: number; page: number; snippet: string }[];
  total_results: number;
}

export function searchBudget(
  q: string,
  opts?: { sector?: string; agency?: string; programme?: string }
): SearchResults {
  const db = getBudgetDb();
  const sector = opts?.sector || '';
  const agency = opts?.agency || '';
  const programme = opts?.programme || '';

  const results: SearchResults = {
    allocations: [],
    line_items: [],
    projects: [],
    indicators: [],
    documents: [],
    loans: [],
    raw_pages: [],
    total_results: 0,
  };

  // ── Budget Allocations ──
  const allocConds: string[] = [];
  const allocParams: (string | number)[] = [];

  if (sector) {
    allocConds.push('sector = ?');
    allocParams.push(sector);
  }
  if (agency) {
    allocConds.push('(agency_code = ? OR agency_name LIKE ?)');
    allocParams.push(agency.toUpperCase(), `%${agency}%`);
  }
  if (programme) {
    allocConds.push('(programme_number = ? OR programme LIKE ?)');
    allocParams.push(programme, `%${programme}%`);
  }
  if (q) {
    allocConds.push(`(
      line_item LIKE ? OR agency_name LIKE ? OR programme LIKE ? OR
      notes LIKE ? OR agency_code LIKE ? OR line_item_code LIKE ?
    )`);
    const qp = `%${q}%`;
    allocParams.push(qp, qp, qp, qp, qp, qp);
  }

  const allocWhere = allocConds.length > 0 ? allocConds.join(' AND ') : '1=1';
  const allocRows = db.prepare(`
    SELECT sector, agency_code, agency_name, programme, programme_number,
           line_item, line_item_code, expenditure_type,
           actual_2024, budget_2025, revised_2025, budget_2026,
           unit, source_volume, source_page, notes
    FROM budget_allocations WHERE ${allocWhere}
    ORDER BY sector, programme_number, expenditure_type, budget_2026 DESC
  `).all(...allocParams) as Record<string, unknown>[];

  results.allocations = allocRows.map(r => ({
    sector: r.sector as string,
    agency_code: r.agency_code as string,
    agency_name: r.agency_name as string,
    programme: r.programme as string,
    programme_number: r.programme_number as string,
    line_item: r.line_item as string,
    line_item_code: r.line_item_code as string,
    expenditure_type: r.expenditure_type as string,
    actual_2024: r.actual_2024 as number,
    budget_2025: r.budget_2025 as number,
    revised_2025: r.revised_2025 as number,
    budget_2026: r.budget_2026 as number,
    source_volume: r.source_volume as number,
    source_page: r.source_page as number,
    notes: r.notes as string | null,
    actual_2024_fmt: fmtAmount(r.actual_2024 as number),
    budget_2025_fmt: fmtAmount(r.budget_2025 as number),
    revised_2025_fmt: fmtAmount(r.revised_2025 as number),
    budget_2026_fmt: fmtAmount(r.budget_2026 as number),
    source: `V${r.source_volume}p${r.source_page}`,
    linked_docs: getLinkedDocs(r.agency_code as string, r.line_item as string),
  }));

  // ── Budget Line Items (budget_items — 50K+ auto-parsed rows) ──
  // Search individual parsed line items from all 3 volumes.
  // Relevant Agency 34 pages: V1 p519-523 (subsidies 6321 detail),
  // V1 p564-565 (capital expenditure), V2/V3 (performance/projects)
  {
    const liConds: string[] = [];
    const liParams: (string | number)[] = [];

    // Pages relevant to Agency 34 / Ministry of Public Utilities & Aviation
    const agency34Pages = `(
      (volume = 1 AND page_number BETWEEN 519 AND 523) OR
      (volume = 1 AND page_number IN (564, 565)) OR
      (volume = 2 AND agency LIKE '%34%') OR
      (volume = 3 AND (agency LIKE '%PUBLIC UTILITIES%' OR agency LIKE '%34%')) OR
      agency LIKE '%34 - %' OR
      agency LIKE '%Public Utilities%'
    )`;

    const isNumeric = q ? /^\d+$/.test(q.trim()) : false;

    if (q) {
      if (isNumeric) {
        // Numeric: match project codes in actual_previous_year (parser quirk on capital pages),
        // or in line_item/raw_line text
        liConds.push(`(
          CAST(actual_previous_year AS INTEGER) = ? OR
          line_item LIKE ? OR raw_line LIKE ?
        )`);
        liParams.push(parseInt(q.trim()), `%${q}%`, `%${q}%`);
      } else {
        // Text: search line_item name, description, raw_line, and agency
        liConds.push('(line_item LIKE ? OR description LIKE ? OR raw_line LIKE ? OR agency LIKE ?)');
        const qp = `%${q}%`;
        liParams.push(qp, qp, qp, qp);
      }
    }
    if (agency) {
      liConds.push('(agency LIKE ?)');
      liParams.push(`%${agency}%`);
    }
    if (programme) {
      liConds.push('(programme_number = ? OR programme LIKE ?)');
      liParams.push(programme, `%${programme}%`);
    }

    if (liConds.length > 0) {
      const liWhere = `${agency34Pages} AND ${liConds.join(' AND ')}`;
      const liRows = db.prepare(`
        SELECT id, volume, page_number, agency, programme, programme_number,
               line_item, description, expenditure_type,
               actual_previous_year, revised_current_year, budget_estimate,
               raw_line
        FROM budget_items
        WHERE ${liWhere}
        AND line_item NOT LIKE 'Profile%'
        AND line_item NOT LIKE 'Figures%'
        AND line_item NOT LIKE 'Total |%'
        AND line_item NOT LIKE 'CODE |%'
        AND line_item NOT LIKE 'PROGRAMME AGENCY%'
        AND budget_estimate > 1000
        ORDER BY budget_estimate DESC
        LIMIT 50
      `).all(...liParams) as Record<string, unknown>[];

      results.line_items = liRows.map(r => ({
        id: r.id as number,
        volume: r.volume as number,
        page_number: r.page_number as number,
        agency: r.agency as string,
        programme: r.programme as string,
        programme_number: r.programme_number as string,
        line_item: r.line_item as string,
        description: r.description as string,
        expenditure_type: r.expenditure_type as string || 'current',
        actual_previous_year: r.actual_previous_year as number,
        revised_current_year: r.revised_current_year as number,
        budget_estimate: r.budget_estimate as number,
        actual_previous_year_fmt: fmtAmount(r.actual_previous_year as number),
        revised_current_year_fmt: fmtAmount(r.revised_current_year as number),
        budget_estimate_fmt: fmtAmount(r.budget_estimate as number),
        source: `V${r.volume}p${r.page_number}`,
      }));
    }
  }

  // ── Capital Projects ──
  const projConds: string[] = [];
  const projParams: string[] = [];

  if (sector) { projConds.push('sector = ?'); projParams.push(sector); }
  if (agency) {
    projConds.push('(agency_code = ? OR agency_name LIKE ?)');
    projParams.push(agency.toUpperCase(), `%${agency}%`);
  }
  if (q) {
    projConds.push(`(
      project_title LIKE ? OR description LIKE ? OR benefits LIKE ? OR
      agency_name LIKE ? OR foreign_source LIKE ?
    )`);
    const qp = `%${q}%`;
    projParams.push(qp, qp, qp, qp, qp);
  }

  const projWhere = projConds.length > 0 ? projConds.join(' AND ') : '1=1';
  results.projects = db.prepare(`
    SELECT * FROM capital_project_profiles WHERE ${projWhere}
    ORDER BY sector, budget_2026 DESC
  `).all(...projParams) as Record<string, unknown>[];

  // ── Performance Indicators ──
  const indConds: string[] = [];
  const indParams: string[] = [];

  if (sector) { indConds.push('sector = ?'); indParams.push(sector); }
  if (agency) {
    indConds.push('(agency_code = ? OR programme LIKE ?)');
    indParams.push(agency.toUpperCase(), `%${agency}%`);
  }
  if (q) {
    indConds.push('(indicator LIKE ? OR programme LIKE ?)');
    const qp = `%${q}%`;
    indParams.push(qp, qp);
  }

  const indWhere = indConds.length > 0 ? indConds.join(' AND ') : '1=1';
  results.indicators = db.prepare(`
    SELECT * FROM performance_indicators WHERE ${indWhere}
    ORDER BY sector, programme_number
  `).all(...indParams) as Record<string, unknown>[];

  // ── Agency Documents ──
  try {
    const docConds: string[] = [];
    const docParams: string[] = [];

    if (agency) { docConds.push('agency = ?'); docParams.push(agency.toUpperCase()); }
    if (q) { docConds.push('text_content LIKE ?'); docParams.push(`%${q}%`); }

    if (docConds.length > 0) {
      const docWhere = docConds.join(' AND ');
      const docRows = db.prepare(`
        SELECT agency, document_name, SUBSTR(text_content, 1, 400) as snippet
        FROM agency_documents WHERE ${docWhere} LIMIT 20
      `).all(...docParams) as { agency: string; document_name: string; snippet: string }[];

      results.documents = docRows;
    }
  } catch { /* ignore */ }

  // ── GPL Loans ──
  if ((agency && agency.toUpperCase() === 'GPL') || (q && /loan|gpl/i.test(q))) {
    const loanConds: string[] = [];
    const loanParams: string[] = [];

    if (q && !/^gpl$/i.test(q)) {
      loanConds.push('(loan_ref LIKE ? OR purpose LIKE ?)');
      loanParams.push(`%${q}%`, `%${q}%`);
    }

    const loanWhere = loanConds.length > 0 ? loanConds.join(' AND ') : '1=1';
    results.loans = db.prepare(`SELECT * FROM gpl_loans WHERE ${loanWhere}`).all(...loanParams) as Record<string, unknown>[];
  }

  // ── Raw pages — always search for numeric codes (project/line item codes) ──
  // For numeric queries, always include raw pages since they have the authoritative data
  // For text queries, only use as fallback
  if (q) {
    const isNumeric = /^\d+$/.test(q.trim());
    const hasStructuredResults = results.allocations.length > 0 || results.projects.length > 0 || results.indicators.length > 0 || results.line_items.length > 0;

    if (isNumeric || !hasStructuredResults) {
      const rawRows = db.prepare(`
        SELECT volume, page_number, SUBSTR(text_content, 1, 400) as snippet
        FROM raw_pages WHERE text_content LIKE ?
        ORDER BY CASE WHEN volume = 1 THEN 0 ELSE volume END, page_number
        LIMIT 15
      `).all(`%${q}%`) as { volume: number; page_number: number; snippet: string }[];

      results.raw_pages = rawRows.map(r => ({
        volume: r.volume,
        page: r.page_number,
        snippet: r.snippet,
      }));
    }
  }

  results.total_results = results.allocations.length + results.line_items.length +
    results.projects.length + results.indicators.length + results.documents.length +
    results.loans.length + results.raw_pages.length;

  return results;
}

export function buildAskContext(question: string): string {
  const db = getBudgetDb();
  const sections: string[] = [];
  const words = question.split(/\s+/).filter(w => w.length > 3);

  if (words.length > 0) {
    // Budget allocations
    const likeClauses = words.map(() => 'line_item LIKE ? OR agency_name LIKE ? OR programme LIKE ? OR notes LIKE ?').join(' OR ');
    const params: string[] = [];
    words.forEach(w => params.push(`%${w}%`, `%${w}%`, `%${w}%`, `%${w}%`));

    const allocs = db.prepare(`
      SELECT sector, agency_code, agency_name, programme, line_item, expenditure_type,
             actual_2024, budget_2025, revised_2025, budget_2026, source_volume, source_page
      FROM budget_allocations WHERE ${likeClauses} ORDER BY budget_2026 DESC LIMIT 20
    `).all(...params) as Record<string, unknown>[];

    if (allocs.length > 0) {
      const allocText = allocs.map(a =>
        `- [${a.agency_code}] ${a.line_item} (${a.expenditure_type}): 2024=${fmtAmount(a.actual_2024 as number)} | 2025=${fmtAmount(a.budget_2025 as number)} | Rev=${fmtAmount(a.revised_2025 as number)} | 2026=${fmtAmount(a.budget_2026 as number)} (V${a.source_volume}p${a.source_page})`
      ).join('\n');
      sections.push(`## MATCHING BUDGET ALLOCATIONS\n${allocText}`);
    }

    // Agency documents
    const docLike = words.map(() => 'text_content LIKE ?').join(' OR ');
    const docParams = words.map(w => `%${w}%`);
    const docs = db.prepare(`
      SELECT agency, document_name, SUBSTR(text_content, 1, 3000) as excerpt
      FROM agency_documents WHERE ${docLike} LIMIT 10
    `).all(...docParams) as { agency: string; document_name: string; excerpt: string }[];

    if (docs.length > 0) {
      const docText = docs.map(d => `### ${d.document_name} (${d.agency})\n${d.excerpt}`).join('\n\n');
      sections.push(`## MATCHING AGENCY DOCUMENTS\n${docText}`);
    }
  }

  // Sector summaries
  const sectorTotals = db.prepare(`
    SELECT sector, SUM(CASE WHEN expenditure_type='total' THEN budget_2026 ELSE 0 END) as total_2026,
           SUM(CASE WHEN expenditure_type='current' THEN budget_2026 ELSE 0 END) as current_2026,
           SUM(CASE WHEN expenditure_type='capital' THEN budget_2026 ELSE 0 END) as capital_2026
    FROM budget_allocations GROUP BY sector
  `).all() as { sector: string; total_2026: number; current_2026: number; capital_2026: number }[];

  if (sectorTotals.length > 0) {
    const stText = sectorTotals.map(s =>
      `- ${s.sector.charAt(0).toUpperCase() + s.sector.slice(1)}: Total=${fmtAmount(s.total_2026)} (Current=${fmtAmount(s.current_2026)}, Capital=${fmtAmount(s.capital_2026)})`
    ).join('\n');
    sections.push(`## SECTOR TOTALS\n${stText}`);
  }

  let context = sections.join('\n\n');
  if (context.length > 80000) context = context.slice(0, 80000) + '\n\n... [context truncated]';
  return context;
}
