/**
 * Project listings scraper for oversight.gov.gy.
 * Handles the Interactive Report table with APEX fixed-header layout.
 *
 * Table structure:
 *   .t-fht-thead table.a-IRR-table  -> header row (th cells)
 *   .t-fht-tbody table#..._orig     -> data rows (td cells, first tr is empty)
 *
 * Rows-per-page select: #R976957418070089_row_select (max option "100000" = All)
 */

const { buildApexUrl, parseCurrency, parseApexDate, delay, getDelay } = require('./parsers');
const { waitForApexLoad } = require('./auth');

/**
 * Set rows-per-page to "All" (100000) to avoid pagination.
 */
async function maximizeRowsPerPage(page) {
  try {
    const selector = await page.$('#R976957418070089_row_select, select[name="p_accept_processing"]');
    if (selector) {
      // Pick the largest value option
      const maxVal = await page.evaluate((sel) => {
        const opts = Array.from(sel.options);
        const vals = opts.map((o) => parseInt(o.value, 10)).filter((v) => !isNaN(v));
        return Math.max(...vals).toString();
      }, selector);

      await selector.selectOption(maxVal);
      console.log(`  Set rows per page to: ${maxVal}`);

      // Wait for APEX AJAX reload
      await waitForApexLoad(page);
      await delay(getDelay() + 3000); // Extra wait for large result set
    }
  } catch (err) {
    console.warn(`  Could not maximize rows: ${err.message}`);
  }
}

/**
 * Build a column-index map from the header row.
 */
function buildColumnMap(headers) {
  const map = {};
  const normalizations = {
    'view project': 'viewProject',
    'project reference': 'projectReference',
    'executing agency': 'executingAgency',
    'sub agency': 'subAgency',
    'project name': 'projectName',
    'region': 'region',
    'contract value': 'contractValue',
    'contractor(s)': 'contractors',
    'contractors': 'contractors',
    'contractor': 'contractors',
    'project end date': 'projectEndDate',
    'end date': 'projectEndDate',
    'completion percent': 'completionPercent',
    'completion %': 'completionPercent',
    '% complete': 'completionPercent',
    'has images': 'hasImages',
    'images': 'hasImages',
  };

  headers.forEach((header, idx) => {
    const normalized = header.toLowerCase().trim();
    for (const [pattern, fieldName] of Object.entries(normalizations)) {
      if (normalized.includes(pattern) || normalized === pattern) {
        map[fieldName] = idx;
        break;
      }
    }
  });

  return map;
}

/**
 * Scrape all rows from the current page of the listings table.
 * APEX uses a fixed-header layout: headers in .t-fht-thead, data in .t-fht-tbody.
 */
async function scrapeTablePage(page, columnMap) {
  const projects = [];

  // Build column map from the header table if we don't have one
  if (!columnMap || Object.keys(columnMap).length === 0) {
    const headers = await page.evaluate(() => {
      const headerTable = document.querySelector('.t-fht-thead table.a-IRR-table');
      if (!headerTable) return [];
      const ths = headerTable.querySelectorAll('th');
      return Array.from(ths).map((th) => th.textContent.trim());
    });

    if (headers.length === 0) {
      console.warn('  Warning: Could not find header table');
      return { projects, columnMap: columnMap || {} };
    }
    columnMap = buildColumnMap(headers);
    console.log(`  Column map: ${JSON.stringify(columnMap)}`);
  }

  // Scrape data rows from the body table
  const rowData = await page.evaluate(() => {
    const dataTable = document.querySelector('.t-fht-tbody table.a-IRR-table');
    if (!dataTable) return [];

    const rows = dataTable.querySelectorAll('tr');
    const result = [];

    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) continue; // Skip empty/spacer rows

      const cellData = [];
      for (const cell of cells) {
        const link = cell.querySelector('a[href*="p3_id"]');
        cellData.push({
          text: cell.textContent.trim(),
          linkHref: link ? link.href : null,
        });
      }
      result.push(cellData);
    }
    return result;
  });

  for (const cells of rowData) {
    try {
      const getText = (fieldName) => {
        const idx = columnMap[fieldName];
        if (idx === undefined || idx >= cells.length) return null;
        return cells[idx].text || null;
      };

      // Extract p3_id from any link in the row
      let p3Id = null;
      for (const cell of cells) {
        if (cell.linkHref) {
          const match = cell.linkHref.match(/p3_id=(\d+)/);
          if (match) { p3Id = match[1]; break; }
        }
      }

      const rawContractValue = getText('contractValue');
      const rawEndDate = getText('projectEndDate');
      const rawCompletion = getText('completionPercent');

      const project = {
        p3Id,
        projectReference: getText('projectReference'),
        executingAgency: getText('executingAgency'),
        subAgency: getText('subAgency'),
        projectName: getText('projectName'),
        region: getText('region'),
        contractValue: parseCurrency(rawContractValue),
        contractValueRaw: rawContractValue,
        contractors: getText('contractors'),
        projectEndDate: parseApexDate(rawEndDate),
        projectEndDateRaw: rawEndDate,
        completionPercent: typeof rawCompletion === 'string'
          ? parseFloat(rawCompletion.replace('%', '').trim()) || null
          : null,
        hasImages: getText('hasImages'),
      };

      projects.push(project);
    } catch (err) {
      console.warn(`  Warning: Failed to parse row: ${err.message}`);
    }
  }

  return { projects, columnMap };
}

/**
 * Check if there's a next page button and click it.
 */
async function goToNextPage(page) {
  const nextBtn = await page.$(
    'button.a-IRR-button--pagination[title="Next"], ' +
    'a.a-IRR-pagination-next:not(.a-IRR-pagination-inactive), ' +
    'a[title="Next"]:not(.a-Button--disabled)'
  );
  if (!nextBtn) return false;

  const isDisabled = await nextBtn.evaluate((el) =>
    el.classList.contains('a-IRR-pagination-inactive') ||
    el.hasAttribute('disabled') ||
    el.getAttribute('aria-disabled') === 'true'
  );
  if (isDisabled) return false;

  await nextBtn.click();
  await waitForApexLoad(page);
  await delay(getDelay());
  return true;
}

/**
 * Main listings scrape function.
 * Sets rows-per-page to All, then scrapes the full table.
 */
async function scrapeListings(page, sessionId) {
  const url = buildApexUrl('project-listings1', sessionId);
  console.log('  Navigating to project listings...');
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForApexLoad(page);
  await delay(getDelay());

  // Set to show all rows
  await maximizeRowsPerPage(page);

  let allProjects = [];
  let columnMap = null;
  let pageNum = 1;

  while (true) {
    console.log(`  Scraping page ${pageNum}...`);
    const result = await scrapeTablePage(page, columnMap);
    if (!columnMap) columnMap = result.columnMap;

    if (result.projects.length === 0) {
      if (pageNum === 1) {
        console.log('  No projects found on page 1, stopping.');
      }
      break;
    }

    allProjects = allProjects.concat(result.projects);
    console.log(`  Found ${result.projects.length} projects (total: ${allProjects.length})`);

    // If we set rows to All, no need for pagination
    if (allProjects.length >= 400) {
      console.log('  All rows loaded.');
      break;
    }

    const hasNext = await goToNextPage(page);
    if (!hasNext) {
      console.log('  No more pages.');
      break;
    }
    pageNum++;
  }

  return allProjects;
}

module.exports = { scrapeListings };
