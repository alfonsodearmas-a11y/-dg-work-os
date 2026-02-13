/**
 * Dashboard scraper for the oversight.gov.gy home page.
 * Extracts KPI cards and status donut chart data.
 *
 * Page structure:
 *   #R81269007201924544 "Summary Cards 1" -> .dc-card elements (3 cards)
 *   #R81270047444924554 "Summary Cards 2" -> .dc-card elements (3 cards)
 *   #R74531209518577438 "Project Status Overall" -> SVG donut with text labels
 *
 * Each .dc-card innerText is newline-delimited: "TITLE\nShort Value\nDetail Value"
 */

const { buildApexUrl, parseCurrency, parsePercent, delay, getDelay } = require('./parsers');
const { waitForApexLoad } = require('./auth');

/**
 * Scrape KPI cards from .dc-card elements.
 */
async function scrapeKpiCards(page) {
  const cards = await page.evaluate(() => {
    const result = {};
    const cardEls = document.querySelectorAll('.dc-card');
    for (const card of cardEls) {
      const lines = card.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      if (lines.length >= 2) {
        result[lines[0]] = {
          short: lines[1],
          detail: lines[2] || null,
        };
      }
    }
    return result;
  });

  return {
    totalContractCost: parseCurrency(cards['TOTAL CONTRACT COST']?.detail || cards['TOTAL CONTRACT COST']?.short),
    totalContractCostDisplay: cards['TOTAL CONTRACT COST']?.short || null,
    totalDisbursement: parseCurrency(cards['TOTAL DISBURSEMENT']?.detail || cards['TOTAL DISBURSEMENT']?.short),
    totalDisbursementDisplay: cards['TOTAL DISBURSEMENT']?.short || null,
    totalBalance: parseCurrency(cards['TOTAL BALANCE']?.detail || cards['TOTAL BALANCE']?.short),
    totalBalanceDisplay: cards['TOTAL BALANCE']?.short || null,
    totalProjects: parseInt(cards['TOTAL PROJECTS']?.short, 10) || null,
    utilizationPercent: parsePercent(cards['TOTAL DISBURSEMENT UTILIZATION']?.short),
    utilizationDetail: cards['TOTAL DISBURSEMENT UTILIZATION']?.detail || null,
    engineerEstimate: parseCurrency(cards['TOTAL ENGINEER ESTIMATE']?.detail || cards['TOTAL ENGINEER ESTIMATE']?.short),
    engineerEstimateDisplay: cards['TOTAL ENGINEER ESTIMATE']?.short || null,
    raw: cards,
  };
}

/**
 * Scrape the "Project Status Overall" donut chart from SVG text elements.
 *
 * The SVG contains labels first (Designed, Commenced, ...) then values
 * in matching order: "0% ( 1 )", "31% ( 69 )", etc.
 */
async function scrapeStatusChart(page) {
  const svgTexts = await page.evaluate(() => {
    const region = document.getElementById('R74531209518577438');
    if (!region) return [];
    const texts = region.querySelectorAll('svg text');
    return Array.from(texts).map(t => t.textContent.trim());
  });

  if (svgTexts.length === 0) return {};

  // Known status labels in expected order
  const statusLabels = ['Designed', 'Commenced', 'Delayed', 'Completed', 'Rollover', 'Cancelled', 'N/A'];

  // Find where labels end and values begin
  const labelIndices = [];
  for (const label of statusLabels) {
    const idx = svgTexts.indexOf(label);
    if (idx !== -1) labelIndices.push(idx);
  }

  if (labelIndices.length === 0) return {};

  const firstLabelIdx = Math.min(...labelIndices);
  const labelsInSvg = svgTexts.slice(firstLabelIdx, firstLabelIdx + statusLabels.length);
  const valuesInSvg = svgTexts.slice(firstLabelIdx + statusLabels.length);

  const statuses = {};
  for (let i = 0; i < labelsInSvg.length; i++) {
    const label = labelsInSvg[i];
    const rawValue = valuesInSvg[i] || null;

    if (rawValue) {
      const parsed = parsePercent(rawValue);
      statuses[label] = parsed || rawValue;
    } else {
      statuses[label] = null;
    }
  }

  return statuses;
}

/**
 * Main dashboard scrape function.
 */
async function scrapeDashboard(page, sessionId) {
  const url = buildApexUrl('home-page1', sessionId);
  console.log('  Navigating to dashboard...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForApexLoad(page);
  await delay(getDelay() + 3000); // Extra wait for charts to render

  console.log('  Scraping KPI cards...');
  const kpis = await scrapeKpiCards(page);

  console.log('  Scraping status chart...');
  const statusChart = await scrapeStatusChart(page);

  return {
    kpis,
    statusChart,
    scrapedAt: new Date().toISOString(),
  };
}

module.exports = { scrapeDashboard };
