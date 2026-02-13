#!/usr/bin/env node

/**
 * Oversight.gov.gy Scraper CLI
 *
 * Usage:
 *   node scraper.js --dry-run        Login test only
 *   node scraper.js --highlights     KPIs + listings -> highlights JSON
 *   node scraper.js --filter=delayed Delayed projects with drill-down details
 *   node scraper.js                  Full scrape (all listings + details for flagged)
 */

require('dotenv').config();
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const { login, closeBrowser, getSession } = require('./lib/auth');
const { scrapeDashboard } = require('./lib/dashboard');
const { scrapeListings } = require('./lib/listings');
const { scrapeProjectDetails } = require('./lib/project-detail');
const { generateHighlights, findDelayed, findOverdue } = require('./lib/highlights');

const OUTPUT_DIR = path.join(__dirname, 'output');

/**
 * Write output JSON to file (latest + timestamped copy).
 */
function writeOutput(data, label = 'oversight-highlights') {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const latestPath = path.join(OUTPUT_DIR, `${label}-latest.json`);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const timestampedPath = path.join(OUTPUT_DIR, `${label}-${timestamp}.json`);

  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(latestPath, json);
  fs.writeFileSync(timestampedPath, json);

  console.log(`\nOutput written to:`);
  console.log(`  ${latestPath}`);
  console.log(`  ${timestampedPath}`);

  return latestPath;
}

/**
 * Optionally POST the output to the DG Work OS API.
 */
async function postToApi(data) {
  const apiUrl = process.env.WORKOS_API_URL;
  if (!apiUrl) return;

  console.log(`\nPOSTing highlights to ${apiUrl}...`);
  try {
    const resp = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    console.log(`  Response: ${resp.status} ${resp.statusText}`);
  } catch (err) {
    console.error(`  POST failed: ${err.message}`);
  }
}

/**
 * --dry-run: Login test only.
 */
async function dryRun() {
  console.log('=== Dry Run: Testing Login ===\n');
  const { sessionId } = await login();
  console.log(`\nLogin successful, session: ${sessionId}`);
}

/**
 * --highlights: KPIs + listings -> highlights JSON.
 */
async function highlightsMode() {
  console.log('=== Highlights Mode ===\n');

  console.log('[1/3] Logging in...');
  const { page, sessionId } = await login();

  console.log('\n[2/3] Scraping dashboard...');
  const dashboard = await scrapeDashboard(page, sessionId);

  console.log('\n[3/3] Scraping project listings...');
  const projects = await scrapeListings(page, sessionId);

  console.log('\nGenerating highlights...');
  const highlights = generateHighlights(projects, dashboard);

  writeOutput(highlights);
  await postToApi(highlights);

  console.log(`\nSummary:`);
  console.log(`  Total projects: ${highlights.metadata.totalProjects}`);
  console.log(`  Delayed: ${highlights.summary.delayed}`);
  console.log(`  Overdue: ${highlights.summary.overdue}`);
  console.log(`  Ending soon: ${highlights.summary.endingSoon}`);
  console.log(`  At-risk: ${highlights.summary.atRisk}`);
}

/**
 * --filter=<type>: Filtered scrape with detail drill-down.
 */
async function filterMode(filterType) {
  console.log(`=== Filter Mode: ${filterType} ===\n`);

  console.log('[1/4] Logging in...');
  const { page, sessionId } = await login();

  console.log('\n[2/4] Scraping project listings...');
  const projects = await scrapeListings(page, sessionId);

  // Determine which projects need detail scraping
  let flaggedProjects;
  switch (filterType.toLowerCase()) {
    case 'delayed':
      flaggedProjects = findDelayed(projects);
      break;
    case 'overdue':
      flaggedProjects = findOverdue(projects);
      break;
    default:
      // Combine delayed + overdue for default filter
      flaggedProjects = [
        ...findDelayed(projects),
        ...findOverdue(projects),
      ];
  }

  const projectIds = flaggedProjects
    .map((p) => p.p3Id)
    .filter(Boolean);
  const uniqueIds = [...new Set(projectIds)];

  console.log(`\n[3/4] Scraping ${uniqueIds.length} ${filterType} project details...`);
  const details = uniqueIds.length > 0
    ? await scrapeProjectDetails(uniqueIds)
    : [];

  console.log('\n[4/4] Generating highlights...');
  const highlights = generateHighlights(projects, null, details);

  writeOutput(highlights, `oversight-${filterType}`);
  await postToApi(highlights);

  console.log(`\nSummary:`);
  console.log(`  Total projects: ${highlights.metadata.totalProjects}`);
  console.log(`  ${filterType}: ${flaggedProjects.length}`);
  console.log(`  Details scraped: ${details.length}`);
}

/**
 * Default: Full scrape (all listings + details for flagged projects).
 */
async function fullScrape() {
  console.log('=== Full Scrape ===\n');

  console.log('[1/5] Logging in...');
  const { page, sessionId } = await login();

  console.log('\n[2/5] Scraping dashboard...');
  const dashboard = await scrapeDashboard(page, sessionId);

  console.log('\n[3/5] Scraping project listings...');
  const projects = await scrapeListings(page, sessionId);

  // Identify projects needing detail drill-down
  const delayed = findDelayed(projects);
  const overdue = findOverdue(projects);
  const flaggedIds = [...new Set([
    ...delayed.map((p) => p.p3Id),
    ...overdue.map((p) => p.p3Id),
  ].filter(Boolean))];

  console.log(`\n[4/5] Scraping ${flaggedIds.length} flagged project details...`);
  const details = flaggedIds.length > 0
    ? await scrapeProjectDetails(flaggedIds)
    : [];

  console.log('\n[5/5] Generating highlights...');
  const highlights = generateHighlights(projects, dashboard, details);

  writeOutput(highlights);
  await postToApi(highlights);

  console.log(`\nSummary:`);
  console.log(`  Total projects: ${highlights.metadata.totalProjects}`);
  console.log(`  Delayed: ${highlights.summary.delayed}`);
  console.log(`  Overdue: ${highlights.summary.overdue}`);
  console.log(`  Ending soon: ${highlights.summary.endingSoon}`);
  console.log(`  At-risk: ${highlights.summary.atRisk}`);
  console.log(`  Bond warnings: ${highlights.summary.bondWarnings}`);
  console.log(`  Details scraped: ${details.length}`);
}

// CLI setup
program
  .name('oversight-scraper')
  .description('Scrape project data from oversight.gov.gy')
  .version('1.0.0')
  .option('--dry-run', 'Test login only')
  .option('--highlights', 'Quick scrape: KPIs + listings -> highlights')
  .option('--filter <type>', 'Filtered scrape with details (delayed, overdue)')
  .action(async (options) => {
    const startTime = Date.now();
    try {
      if (options.dryRun) {
        await dryRun();
      } else if (options.highlights) {
        await highlightsMode();
      } else if (options.filter) {
        await filterMode(options.filter);
      } else {
        await fullScrape();
      }

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`\nDone in ${elapsed}s`);
    } catch (err) {
      console.error(`\nError: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
      process.exitCode = 1;
    } finally {
      await closeBrowser();
    }
  });

program.parse();
