/**
 * Authentication module for oversight.gov.gy (Oracle APEX 24.2).
 * Handles login, session extraction, and re-authentication.
 */

const { chromium } = require('playwright');
const { BASE_URL, delay, getDelay } = require('./parsers');

const LOGIN_URL = `${BASE_URL}/login`;

let browser = null;
let context = null;
let page = null;
let sessionId = null;

/**
 * Wait for APEX page to finish loading.
 * Waits for the spinner overlay to disappear and network to settle.
 */
async function waitForApexLoad(p, timeout = 30000) {
  const target = p || page;
  try {
    // Wait for the APEX loading overlay to disappear
    await target.waitForSelector('#apex_wait_overlay', {
      state: 'hidden',
      timeout,
    });
  } catch {
    // Overlay may not appear on every page
  }
  try {
    await target.waitForLoadState('networkidle', { timeout: 15000 });
  } catch {
    // Fallback - page may have long-polling connections
    await target.waitForLoadState('domcontentloaded', { timeout: 10000 });
  }
}

/**
 * Log in to oversight.gov.gy and return the session ID.
 */
async function login() {
  const headless = process.env.HEADLESS !== 'false';

  browser = await chromium.launch({ headless });
  context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });
  page = await context.newPage();

  const username = process.env.OVERSIGHT_USERNAME;
  const password = process.env.OVERSIGHT_PASSWORD;
  if (!username || !password) {
    throw new Error(
      'OVERSIGHT_USERNAME and OVERSIGHT_PASSWORD must be set in .env'
    );
  }

  console.log('  Navigating to login page...');
  await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await waitForApexLoad();

  console.log('  Filling credentials...');
  await page.fill('input[placeholder="Username"]', username);
  await page.fill('input[placeholder="Password"]', password);

  console.log('  Clicking Sign In...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
    page.click('button:has-text("Sign In")'),
  ]);
  await waitForApexLoad();

  // Check for login failure: APEX keeps session= in URL even on failure,
  // so we must check for error indicators / still being on login page.
  const currentUrl = page.url();

  // Check for notification_msg (APEX error param) or still on /login
  const hasError = currentUrl.includes('notification_msg=');
  const stillOnLogin = currentUrl.includes('/login');

  if (hasError || stillOnLogin) {
    // Try to read the visible error message
    const errorText = await page.evaluate(() => {
      const el =
        document.querySelector('.t-Login-errorMessage') ||
        document.querySelector('.apex-page-error') ||
        document.querySelector('[id*="notification"]') ||
        document.querySelector('.t-Alert--danger');
      return el ? el.textContent.trim() : null;
    });

    // Decode notification_msg if present
    let decoded = '';
    const notifMatch = currentUrl.match(/notification_msg=([^&]+)/);
    if (notifMatch) {
      try {
        // APEX base64-encodes with URL-safe chars and delimiters
        const raw = decodeURIComponent(notifMatch[1]).replace(/\.,/g, '');
        decoded = Buffer.from(raw, 'base64').toString('utf8').replace(/<[^>]+>/g, ' ').trim();
      } catch { /* ignore decode errors */ }
    }

    const msg = errorText || decoded || 'Unknown login error';
    throw new Error(`Login failed: ${msg}`);
  }

  const urlMatch = currentUrl.match(/session=(\d+)/);
  if (!urlMatch) {
    throw new Error(`Login may have failed - no session ID in URL: ${currentUrl}`);
  }

  sessionId = urlMatch[1];
  console.log(`  Session: ${sessionId}`);
  return { page, sessionId };
}

/**
 * Re-login if the session expired.
 */
async function reLogin() {
  console.log('  Re-authenticating...');
  if (page) {
    try { await page.close(); } catch { /* ignore */ }
  }
  if (context) {
    try { await context.close(); } catch { /* ignore */ }
  }
  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
  }
  return login();
}

/**
 * Check if the current page shows a session timeout / login redirect.
 */
async function isSessionValid() {
  if (!page) return false;
  const url = page.url();
  return url.includes('session=') && !url.includes('/login');
}

/**
 * Get the current page and session.
 */
function getSession() {
  return { page, sessionId };
}

/**
 * Close the browser.
 */
async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    context = null;
    page = null;
    sessionId = null;
  }
}

module.exports = {
  login,
  reLogin,
  isSessionValid,
  getSession,
  closeBrowser,
  waitForApexLoad,
};
