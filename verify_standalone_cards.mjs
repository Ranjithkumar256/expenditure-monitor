import puppeteer from 'puppeteer';
import fs from 'fs';

const ARTIFACT_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/dfa1304c-d494-4f86-a410-2c3309ae98dc';

async function run() {
  console.log('Starting verification of Linked Bank vs Standalone Cards...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  // 1. Desktop Viewport
  await page.setViewport({ width: 1440, height: 1300, deviceScaleFactor: 2 });
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });

  // Navigate to Accounts & Cards tab
  console.log('Navigating to Accounts & Cards tab...');
  await page.evaluate(() => {
    const tab = document.querySelector('.nav-link[data-tab="accounts"]');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Take screenshot of Accounts & Cards grid showing linked and standalone cards
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_cards_linked_vs_standalone.png`,
    fullPage: false
  });
  console.log('Saved screenshot_cards_linked_vs_standalone.png');

  // 2. Open Add Card Modal and verify Linked Bank Account dropdown
  console.log('Opening Add Card modal...');
  await page.click('#openAddCardBtn');
  await new Promise(r => setTimeout(r, 400));

  // Screenshot modal showing None / Standalone default option
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_modal_standalone_option.png`,
    fullPage: false
  });
  console.log('Saved screenshot_modal_standalone_option.png');

  // Close modal
  await page.click('#modalCard .modal-close-btn');
  await new Promise(r => setTimeout(r, 300));

  // 3. Android Mobile Viewport (412x915)
  console.log('Testing Android Mobile Viewport (412x915)...');
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    const tab = document.querySelector('.nav-link[data-tab="accounts"]');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Scroll to cards grid
  await page.evaluate(() => {
    const el = document.getElementById('cardsGrid');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
  });
  await new Promise(r => setTimeout(r, 400));

  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_mobile_standalone_cards.png`,
    fullPage: false
  });
  console.log('Saved screenshot_mobile_standalone_cards.png');

  await browser.close();
  console.log('Verification completed successfully!');
}

run().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
