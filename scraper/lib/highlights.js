/**
 * Highlights / analysis engine.
 * Takes scraped data and produces structured insights with standardized project format.
 *
 * Standard project shape (every project in every section):
 *   id, reference, name, agency, agencyFull, ministry, region, regionCode,
 *   contractor, contractValue, contractValueDisplay, completion, endDate, hasImages
 *
 * Section-specific fields are added on top of the standard shape.
 */

const {
  standardizeProject,
  formatCurrency,
  formatAgency,
} = require('./parsers');

const TODAY = new Date().toISOString().slice(0, 10);

/**
 * Calculate days between two ISO date strings.
 */
function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

/**
 * Identify delayed projects (status === 'DELAYED').
 */
function findDelayed(projects, details = []) {
  const detailMap = new Map(details.map((d) => [d.p3Id, d]));

  return projects
    .filter((p) => {
      const status = (p.status || '').toUpperCase();
      return status === 'DELAYED';
    })
    .map((p) => {
      const detail = detailMap.get(p.p3Id);
      return {
        ...standardizeProject(p),
        status: 'Delayed',
        extensionReason: detail?.projectDetails?.extensionReason || null,
        extensionDate: detail?.projectDetails?.extensionDate || null,
      };
    });
}

/**
 * Identify overdue projects: end date passed and completion < 100%.
 */
function findOverdue(projects) {
  return projects.filter((p) => {
    if (!p.projectEndDate) return false;
    return p.projectEndDate < TODAY && (p.completionPercent || 0) < 100;
  }).map((p) => {
    const days = daysBetween(p.projectEndDate, TODAY);
    return {
      ...standardizeProject(p),
      status: 'Overdue',
      daysOverdue: days,
      daysOverdueDisplay: `${days} day${days !== 1 ? 's' : ''} overdue`,
    };
  });
}

/**
 * Identify projects ending within 30 days.
 */
function findEndingSoon(projects) {
  return projects.filter((p) => {
    if (!p.projectEndDate) return false;
    const days = daysBetween(TODAY, p.projectEndDate);
    return days >= 0 && days <= 30;
  }).map((p) => {
    const days = daysBetween(TODAY, p.projectEndDate);
    return {
      ...standardizeProject(p),
      status: 'Ending Soon',
      daysRemaining: days,
      daysRemainingDisplay: `${days} day${days !== 1 ? 's' : ''} remaining`,
    };
  });
}

/**
 * Identify at-risk projects: completion < 50% with < 90 days remaining.
 */
function findAtRisk(projects) {
  return projects.filter((p) => {
    if (!p.projectEndDate) return false;
    const days = daysBetween(TODAY, p.projectEndDate);
    return (p.completionPercent || 0) < 50 && days > 0 && days < 90;
  }).map((p) => {
    const days = daysBetween(TODAY, p.projectEndDate);
    return {
      ...standardizeProject(p),
      status: 'At Risk',
      daysRemaining: days,
      daysRemainingDisplay: `${days} day${days !== 1 ? 's' : ''} remaining`,
      riskReason: 'Low completion with approaching deadline',
    };
  });
}

/**
 * Identify bond warnings: delayed/overdue projects missing bond documents.
 */
function findBondWarnings(projects, details = []) {
  const detailMap = new Map(details.map((d) => [d.p3Id, d]));

  const flagged = projects.filter((p) => {
    const status = (p.status || '').toUpperCase();
    const isDelayed = status === 'DELAYED';
    const isOverdue = p.projectEndDate && p.projectEndDate < TODAY && (p.completionPercent || 0) < 100;
    return isDelayed || isOverdue;
  });

  return flagged
    .filter((p) => {
      const detail = detailMap.get(p.p3Id);
      if (!detail || !detail.bondInfo) return true;
      return !detail.bondInfo.hasBondDocuments;
    })
    .map((p) => ({
      ...standardizeProject(p),
      status: 'Bond Warning',
      warning: 'Missing bond documents for delayed/overdue project',
    }));
}

/**
 * Compute per-agency breakdown.
 */
function agencyBreakdown(projects) {
  const agencies = {};

  for (const p of projects) {
    const code = p.subAgency || 'Unknown';
    if (!agencies[code]) {
      agencies[code] = {
        code,
        count: 0,
        totalValue: 0,
        totalCompletion: 0,
        completionCount: 0,
      };
    }
    agencies[code].count++;
    if (p.contractValue) {
      agencies[code].totalValue += p.contractValue;
    }
    if (p.completionPercent != null) {
      agencies[code].totalCompletion += p.completionPercent;
      agencies[code].completionCount++;
    }
  }

  return Object.values(agencies)
    .map((a) => {
      const avg = a.completionCount > 0
        ? Math.round((a.totalCompletion / a.completionCount) * 10) / 10
        : null;
      return {
        agency: a.code,
        agencyFull: formatAgency(a.code),
        projectCount: a.count,
        totalValue: a.totalValue,
        totalValueDisplay: formatCurrency(a.totalValue),
        avgCompletion: avg,
      };
    })
    .sort((a, b) => b.totalValue - a.totalValue);
}

/**
 * Get top 10 projects by contract value.
 */
function topByValue(projects, n = 10) {
  return [...projects]
    .filter((p) => p.contractValue != null)
    .sort((a, b) => b.contractValue - a.contractValue)
    .slice(0, n)
    .map((p, i) => ({
      rank: i + 1,
      ...standardizeProject(p),
    }));
}

/**
 * Generate the full highlights report.
 */
function generateHighlights(projects, dashboard = null, details = []) {
  const delayed = findDelayed(projects, details);
  const overdue = findOverdue(projects);
  const endingSoon = findEndingSoon(projects);
  const atRisk = findAtRisk(projects);
  const bondWarnings = findBondWarnings(projects, details);
  const agencies = agencyBreakdown(projects);
  const top10 = topByValue(projects);

  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalProjects: projects.length,
      analysisDate: TODAY,
    },
    dashboard: dashboard || null,
    summary: {
      delayed: delayed.length,
      overdue: overdue.length,
      endingSoon: endingSoon.length,
      atRisk: atRisk.length,
      bondWarnings: bondWarnings.length,
    },
    delayed,
    overdue,
    endingSoon,
    atRisk,
    bondWarnings,
    agencyBreakdown: agencies,
    top10,
  };
}

module.exports = {
  generateHighlights,
  findDelayed,
  findOverdue,
  findEndingSoon,
  findAtRisk,
  findBondWarnings,
  agencyBreakdown,
  topByValue,
};
