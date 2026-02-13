/**
 * Project detail scraper for individual project forms.
 * Navigates to /oversight/project-form?p3_id={id} and extracts tab data.
 */

const { buildApexUrl, parseCurrency, parseApexDate, delay, getDelay } = require('./parsers');
const { waitForApexLoad, isSessionValid, reLogin, getSession } = require('./auth');

const BATCH_SIZE = 15;

/**
 * Extract labeled field values from the current page.
 * Oracle APEX forms use label-value pairs.
 */
async function extractFormFields(page, container) {
  const fields = {};
  const target = container || page;

  // Try APEX form item pattern: label + display/input
  const formItems = await target.$$('.t-Form-fieldContainer, .t-Form-itemWrapper');
  for (const item of formItems) {
    try {
      const label = await item.$('.t-Form-label, label');
      const value =
        (await item.$('.display_only, .t-Form-inputContainer span, input, select, textarea'));

      if (label && value) {
        const labelText = (await label.textContent()).trim().replace(/:$/, '');
        let valueText;
        const tagName = await value.evaluate((el) => el.tagName.toLowerCase());
        if (tagName === 'input' || tagName === 'select' || tagName === 'textarea') {
          valueText = await value.inputValue().catch(() => null) || (await value.textContent()).trim();
        } else {
          valueText = (await value.textContent()).trim();
        }
        if (labelText) {
          fields[labelText] = valueText || null;
        }
      }
    } catch {
      // Skip malformed items
    }
  }

  // Fallback: try table-based layout (common in APEX)
  if (Object.keys(fields).length === 0) {
    const rows = await target.$$('tr');
    for (const row of rows) {
      const cells = await row.$$('td, th');
      if (cells.length >= 2) {
        const label = (await cells[0].textContent()).trim().replace(/:$/, '');
        const value = (await cells[1].textContent()).trim();
        if (label && label.length < 60) {
          fields[label] = value || null;
        }
      }
    }
  }

  return fields;
}

/**
 * Click a tab by label text.
 */
async function clickTab(page, tabLabel) {
  const tabSelectors = [
    `.t-Tabs-link:has-text("${tabLabel}")`,
    `a[role="tab"]:has-text("${tabLabel}")`,
    `.apex-rds-item a:has-text("${tabLabel}")`,
    `li:has-text("${tabLabel}") a`,
  ];

  for (const selector of tabSelectors) {
    try {
      const tab = await page.$(selector);
      if (tab) {
        await tab.click();
        await waitForApexLoad(page);
        await delay(1000);
        return true;
      }
    } catch {
      // Try next selector
    }
  }
  return false;
}

/**
 * Scrape Project Details tab.
 */
async function scrapeProjectDetailsTab(page) {
  await clickTab(page, 'Project Details');
  const fields = await extractFormFields(page);

  return {
    status: fields['Status'] || fields['PROJECT STATUS'] || fields['Project Status'] || null,
    projectType: fields['Project Type'] || fields['PROJECT TYPE'] || null,
    fundingType: fields['Funding Type'] || fields['FUNDING TYPE'] || fields['Source of Funding'] || null,
    startDate: parseApexDate(fields['Start Date'] || fields['Project Start Date'] || ''),
    endDate: parseApexDate(fields['End Date'] || fields['Project End Date'] || ''),
    extensionDate: parseApexDate(fields['Extension Date'] || fields['Extended End Date'] || ''),
    extensionReason: fields['Extension Reason'] || fields['Reason for Extension'] || null,
    completionPercent: fields['Completion %'] || fields['% Complete'] || fields['Completion Percent'] || null,
    raw: fields,
  };
}

/**
 * Scrape Contract Details tab.
 */
async function scrapeContractDetailsTab(page) {
  const clicked = await clickTab(page, 'Contract Details');
  if (!clicked) return null;

  const fields = await extractFormFields(page);

  return {
    contractRef: fields['Contract Reference'] || fields['Contract Ref'] || fields['CONTRACT REF'] || null,
    contractValue: parseCurrency(fields['Contract Value'] || fields['CONTRACT VALUE'] || ''),
    contractor: fields['Contractor'] || fields['CONTRACTOR'] || fields['Contractor Name'] || null,
    contractStartDate: parseApexDate(fields['Contract Start Date'] || ''),
    contractEndDate: parseApexDate(fields['Contract End Date'] || ''),
    raw: fields,
  };
}

/**
 * Scrape Documents tab -> Bond sub-tab.
 * Check for bond document presence.
 */
async function scrapeBondDocuments(page) {
  const clicked = await clickTab(page, 'Documents');
  if (!clicked) return null;

  // Try to find Bond sub-tab
  await clickTab(page, 'Bond');

  // Check if there are any bond documents listed
  const bondContent = await page.$$('.t-Report-report tr, table tr, .a-IRR-table tr');
  const hasBondDocs = bondContent.length > 1; // More than just header row

  return {
    hasBondDocuments: hasBondDocs,
    bondDocumentCount: Math.max(0, bondContent.length - 1),
  };
}

/**
 * Scrape a single project's detail page.
 */
async function scrapeProjectDetail(page, sessionId, p3Id) {
  const url = buildApexUrl('project-form', sessionId, { p3_id: p3Id });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForApexLoad(page);
  await delay(getDelay());

  const projectDetails = await scrapeProjectDetailsTab(page);
  const contractDetails = await scrapeContractDetailsTab(page);
  const bondInfo = await scrapeBondDocuments(page);

  return {
    p3Id,
    projectDetails,
    contractDetails,
    bondInfo,
    scrapedAt: new Date().toISOString(),
  };
}

/**
 * Batch scrape project details for a list of project IDs.
 * Re-authenticates between batches if needed.
 */
async function scrapeProjectDetails(projectIds) {
  const results = [];
  const batches = [];

  // Split into batches
  for (let i = 0; i < projectIds.length; i += BATCH_SIZE) {
    batches.push(projectIds.slice(i, i + BATCH_SIZE));
  }

  console.log(`  Scraping ${projectIds.length} projects in ${batches.length} batches...`);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];
    console.log(`  Batch ${batchIdx + 1}/${batches.length} (${batch.length} projects)`);

    // Check session validity before each batch
    let { page, sessionId } = getSession();
    const valid = await isSessionValid();
    if (!valid) {
      const refreshed = await reLogin();
      page = refreshed.page;
      sessionId = refreshed.sessionId;
    }

    for (const p3Id of batch) {
      try {
        const detail = await scrapeProjectDetail(page, sessionId, p3Id);
        results.push(detail);
        console.log(`    Scraped project ${p3Id}`);
      } catch (err) {
        console.warn(`    Failed to scrape project ${p3Id}: ${err.message}`);
        results.push({
          p3Id,
          error: err.message,
          scrapedAt: new Date().toISOString(),
        });
      }
    }
  }

  return results;
}

module.exports = { scrapeProjectDetail, scrapeProjectDetails };
