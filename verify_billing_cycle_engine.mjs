import puppeteer from 'puppeteer';

const ARTIFACT_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/dfa1304c-d494-4f86-a410-2c3309ae98dc';

async function run() {
  console.log('Starting verification of Credit Card Billing Cycle Engine...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 2 });

  page.on('dialog', async dialog => {
    console.log(`[Dialog]: ${dialog.message()}`);
    await dialog.accept();
  });

  // 1. Initial Load & Navigate to Cards Tab
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  await page.evaluate(() => {
    const tab = document.querySelector('.nav-link[data-tab="accounts"]');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Scroll to cards section
  await page.evaluate(() => {
    const el = document.getElementById('cardsGrid');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 400));

  // Screenshot 1: Desktop Cards Tab with Cycle Indicators & Badges
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_billing_cycles_desktop.png`,
    fullPage: false
  });
  console.log('Captured screenshot_billing_cycles_desktop.png');

  // 2. Open Billing Cycle Inspector for Primary Card (HDFC Regalia Gold)
  await page.evaluate(() => {
    const primaryBtn = document.querySelector('.view-billing-cycles-btn[data-id="1"]');
    if (primaryBtn) primaryBtn.click();
  });
  await new Promise(r => setTimeout(r, 700));

  // Screenshot 2: Primary Card Billing Cycle Modal
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_modal_primary_billing_cycle.png`,
    fullPage: false
  });
  console.log('Captured screenshot_modal_primary_billing_cycle.png');

  // Close modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('#modalBillingCycle [data-close="modalBillingCycle"]');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // 3. Open Billing Cycle Inspector for Add-on Card (HDFC Regalia Add-on with Independent Cycle 15th to 14th)
  await page.evaluate(() => {
    const addonBtn = document.querySelector('.view-billing-cycles-btn[data-id="4"]');
    if (addonBtn) addonBtn.click();
  });
  await new Promise(r => setTimeout(r, 700));

  // Screenshot 3: Add-on Card Independent Billing Cycle Modal
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_modal_addon_independent_cycle.png`,
    fullPage: false
  });
  console.log('Captured screenshot_modal_addon_independent_cycle.png');

  // Close modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('#modalBillingCycle [data-close="modalBillingCycle"]');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // 4. Open Edit Card modal on Primary Card to inspect cycle fields & preview text
  await page.evaluate(() => {
    const editBtn = document.querySelector('.edit-card-btn[data-id="1"]');
    if (editBtn) editBtn.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Screenshot 4: Edit Card with cycle fields & dynamic preview
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_modal_edit_card_cycles.png`,
    fullPage: false
  });
  console.log('Captured screenshot_modal_edit_card_cycles.png');

  // Close card modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('#modalCard [data-close="modalCard"]');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // 5. Mobile Viewport (Android 412x915)
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true });
  await page.evaluate(() => {
    if (window.switchTab) window.switchTab('accounts');
  });
  await new Promise(r => setTimeout(r, 600));

  // Open billing cycle inspector on mobile for Primary Card
  await page.evaluate(() => {
    if (window.openBillingCycleModal) window.openBillingCycleModal(1);
  });
  await new Promise(r => setTimeout(r, 800));

  // Screenshot 5: Android Mobile Billing Cycle Inspector
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_mobile_billing_cycles_modal.png`,
    fullPage: false
  });
  console.log('Captured screenshot_mobile_billing_cycles_modal.png');

  await browser.close();
  console.log('All billing cycle verification steps completed successfully!');
}

run().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
