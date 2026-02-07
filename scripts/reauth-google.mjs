#!/usr/bin/env node
/**
 * Google Calendar OAuth2 re-authorization script.
 * Gets a new refresh token with full calendar read+write scope.
 *
 * 1. Run: node scripts/reauth-google.mjs
 * 2. Open the printed URL in your browser, authorize
 * 3. You'll be redirected — the local server catches the code automatically
 * 4. Copy the new GOOGLE_REFRESH_TOKEN into .env.local
 *
 * PREREQUISITE: In Google Cloud Console → APIs & Services → Credentials →
 *   your OAuth Client → Authorized redirect URIs, add:
 *   http://localhost:3333/callback
 */

import { google } from 'googleapis';
import { resolve } from 'path';
import http from 'http';
import { readFileSync, writeFileSync } from 'fs';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = 'http://localhost:3333/callback';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const url = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent',
  scope: SCOPES,
});

console.log('\n╔═══════════════════════════════════════════════════════╗');
console.log('║  Google Calendar OAuth2 — Reauthorization             ║');
console.log('╚═══════════════════════════════════════════════════════╝\n');
console.log('Scopes requested:');
console.log('  • https://www.googleapis.com/auth/calendar');
console.log('  • https://www.googleapis.com/auth/calendar.events\n');
console.log('Open this URL in your browser:\n');
console.log(url);
console.log('\nWaiting for callback on http://localhost:3333/callback ...\n');

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, 'http://localhost:3333');

  if (reqUrl.searchParams.get('error')) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(`<h2>Authorization denied</h2><p>${reqUrl.searchParams.get('error')}</p>`);
    console.error('Authorization denied:', reqUrl.searchParams.get('error'));
    server.close();
    process.exit(1);
    return;
  }

  const authCode = reqUrl.searchParams.get('code');
  if (!authCode) {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<p>Waiting for authorization...</p>');
    return;
  }

  try {
    const { tokens } = await oauth2Client.getToken(authCode);

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2 style="color:green">✓ Authorization successful!</h2><p>You can close this tab. Check your terminal.</p>');

    if (!tokens.refresh_token) {
      console.log('⚠  No refresh_token returned.');
      console.log('   Go to https://myaccount.google.com/permissions');
      console.log('   Revoke access for this app, then run this script again.\n');
      server.close();
      process.exit(1);
      return;
    }

    console.log('✓ New refresh token received!\n');

    // Auto-update .env.local
    const envPath = resolve(process.cwd(), '.env.local');
    let envContent = readFileSync(envPath, 'utf-8');
    const oldToken = process.env.GOOGLE_REFRESH_TOKEN;

    if (oldToken && envContent.includes(oldToken)) {
      envContent = envContent.replace(oldToken, tokens.refresh_token);
      writeFileSync(envPath, envContent, 'utf-8');
      console.log('✓ .env.local updated automatically with new GOOGLE_REFRESH_TOKEN\n');
    } else {
      console.log('GOOGLE_REFRESH_TOKEN=' + tokens.refresh_token);
      console.log('\nManually replace the value in .env.local\n');
    }

    // Update Vercel env var
    console.log('Updating Vercel production env...');
    const { execSync } = await import('child_process');
    try {
      // Remove old value first (vercel env add fails if it already exists)
      execSync('npx vercel env rm GOOGLE_REFRESH_TOKEN production -y', { stdio: 'pipe' });
    } catch { /* may not exist yet */ }
    try {
      execSync(`echo "${tokens.refresh_token}" | npx vercel env add GOOGLE_REFRESH_TOKEN production`, { stdio: 'pipe' });
      console.log('✓ Vercel GOOGLE_REFRESH_TOKEN updated for production\n');
      console.log('Run `npx vercel --prod` or push to redeploy with the new token.');
    } catch (vercelErr) {
      console.log('⚠  Could not auto-update Vercel. Manually run:');
      console.log('   npx vercel env rm GOOGLE_REFRESH_TOKEN production -y');
      console.log('   echo "YOUR_TOKEN" | npx vercel env add GOOGLE_REFRESH_TOKEN production\n');
    }

    console.log('\nRestart your local dev server to pick up the new token.');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h2 style="color:red">Error exchanging code</h2><p>' + err.message + '</p>');
    console.error('Error exchanging code:', err.message);
  }

  server.close();
  process.exit(0);
});

server.listen(3333);
