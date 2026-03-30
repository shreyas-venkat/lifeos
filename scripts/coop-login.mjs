#!/usr/bin/env node

/**
 * Co-op Login Session Saver
 * Opens browser, waits for login, auto-saves session when logged in.
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SESSION_FILE = path.join(__dirname, 'coop-session.json');

async function main() {
  console.log('Opening Co-op...');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://shoponline.calgarycoop.com/crowfoot');

  // Poll every 3 seconds — check if we're logged in by looking for account/cart elements
  console.log('Waiting for login (checking every 3s)...');
  for (let i = 0; i < 120; i++) {
    await page.waitForTimeout(3000);
    const url = page.url();
    // If we're past the login page and on the shop
    const loggedIn = await page.evaluate(() => {
      // Look for typical logged-in indicators
      return !!(
        document.querySelector('[data-testid="account-menu"]') ||
        document.querySelector('.user-menu') ||
        document.querySelector('[class*="account"]') ||
        document.querySelector('[class*="cart"]') ||
        document.querySelector('[aria-label*="cart"]') ||
        document.querySelector('[aria-label*="Account"]')
      );
    }).catch(() => false);

    if (loggedIn || (url.includes('crowfoot') && !url.includes('login'))) {
      console.log('Detected logged in state!');
      break;
    }
    if (i % 10 === 0) console.log(`  Still waiting... (${i * 3}s)`);
  }

  // Save session
  const storage = await context.storageState();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(storage, null, 2));
  const cookies = storage.cookies || [];
  console.log(`Session saved: ${SESSION_FILE} (${cookies.length} cookies)`);

  await browser.close();
  console.log('Done! Browser closed.');
}

main().catch(console.error);
