/**
 * Highlights / analysis engine.
 * Takes scraped data and produces structured insights:
 * delayed, overdue, ending soon, at-risk, bond warnings, agency breakdown, top 10.
 */

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
        ...p,
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
    const isPastDue = p.projectEndDate < TODAY;
    const isIncomplete = (p.completionPercent || 0) < 100;
    return isPastDue && isIncomplete;
  }).map((p) => ({
    ...p,
    daysOverdue: daysBetween(p.projectEndDate, TODAY),
  }));
}

/**
 * Identify projects ending within 30 days.
 */
function findEndingSoon(projects) {
  return projects.filter((p) => {
    if (!p.projectEndDate) return false;
    const daysRemaining = daysBetween(TODAY, p.projectEndDate);
    return daysRemaining >= 0 && daysRemaining <= 30;
  }).map((p) => ({
    ...p,
    daysRemaining: daysBetween(TODAY, p.projectEndDate),
  }));
}

/**
 * Identify at-risk projects: completion < 50% with < 90 days remaining.
 */
function findAtRisk(projects) {
  return projects.filter((p) => {
    if (!p.projectEndDate) return false;
    const daysRemaining = daysBetween(TODAY, p.projectEndDate);
    const completion = p.completionPercent || 0;
    return completion < 50 && daysRemaining > 0 && daysRemaining < 90;
  }).map((p) => ({
    ...p,
    daysRemaining: daysBetween(TODAY, p.projectEndDate),
    risk: 'LOW_COMPLETION_NEAR_DEADLINE',
  }));
}

/**
 * Identify bond warnings: delayed/overdue projects missing bond documents.
 */
function findBondWarnings(projects, details = []) {
  const detailMap = new Map(details.map((d) => [d.p3Id, d]));

  // Projects that are delayed or overdue
  const flagged = projects.filter((p) => {
    const status = (p.status || '').toUpperCase();
    const isDelayed = status === 'DELAYED';
    const isOverdue = p.projectEndDate && p.projectEndDate < TODAY && (p.completionPercent || 0) < 100;
    return isDelayed || isOverdue;
  });

  return flagged
    .filter((p) => {
      const detail = detailMap.get(p.p3Id);
      if (!detail || !detail.bondInfo) return true; // No info = flag it
      return !detail.bondInfo.hasBondDocuments;
    })
    .map((p) => ({
      p3Id: p.p3Id,
      projectReference: p.projectReference,
      projectName: p.projectName,
      subAgency: p.subAgency,
      contractValue: p.contractValue,
      reason: 'Missing bond documents for delayed/overdue project',
    }));
}

/**
 * Compute per-agency breakdown.
 */
function agencyBreakdown(projects) {
  const agencies = {};

  for (const p of projects) {
    const agency = p.subAgency || 'Unknown';
    if (!agencies[agency]) {
      agencies[agency] = {
        agency,
        count: 0,
        totalValue: 0,
        totalCompletion: 0,
        completionCount: 0,
      };
    }
    agencies[agency].count++;
    if (p.contractValue) {
      agencies[agency].totalValue += p.contractValue;
    }
    if (p.completionPercent != null) {
      agencies[agency].totalCompletion += p.completionPercent;
      agencies[agency].completionCount++;
    }
  }

  return Object.values(agencies)
    .map((a) => ({
      agency: a.agency,
      projectCount: a.count,
      totalContractValue: a.totalValue,
      avgCompletion: a.completionCount > 0
        ? Math.round((a.totalCompletion / a.completionCount) * 10) / 10
        : null,
    }))
    .sort((a, b) => b.totalContractValue - a.totalContractValue);
}

/**
 * Get top 10 projects by contract value.
 */
function topByValue(projects, n = 10) {
  return [...projects]
    .filter((p) => p.contractValue != null)
    .sort((a, b) => b.contractValue - a.contractValue)
    .slice(0, n)
    .map((p) => ({
      p3Id: p.p3Id,
      projectReference: p.projectReference,
      projectName: p.projectName,
      subAgency: p.subAgency,
      contractValue: p.contractValue,
      completionPercent: p.completionPercent,
      projectEndDate: p.projectEndDate,
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
