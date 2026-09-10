import puppeteer from 'puppeteer';

const ARTIFACT_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/dfa1304c-d494-4f86-a410-2c3309ae98dc';

async function run() {
  console.log('Starting verification of Dummy Data Remove & Add engine...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });

  // Handle confirm dialogs automatically
  page.on('dialog', async dialog => {
    console.log(`[Dialog Prompt]: ${dialog.message()}`);
    await dialog.accept();
  });

  // 1. Initial Load (with Dummy Data active)
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  // Navigate to Settings to see Control Center
  await page.evaluate(() => {
    const tab = document.querySelector('.nav-link[data-tab="settings"]');
    if (tab) tab.click();
  });
  await new Promise(r => setTimeout(r, 600));

  // Scroll into view of Dummy Data Control Center in Settings
  await page.evaluate(() => {
    const btn = document.getElementById('removeDemoDataBtn');
    if (btn) btn.scrollIntoView({ behavior: 'instant', block: 'center' });
  });
  await new Promise(r => setTimeout(r, 400));

  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_dummy_data_settings_active.png`,
    fullPage: false
  });
  console.log('Saved screenshot_dummy_data_settings_active.png');

  // 2. Click Remove Dummy Data button in Settings
  console.log('Clicking Remove Dummy Data button...');
  await page.click('#removeDemoDataBtn');
  await new Promise(r => setTimeout(r, 1200));

  // Navigate to Dashboard to verify clean slate
  await page.evaluate(() => {
    const tab = document.querySelector('.nav-link[data-tab="dashboard"]');
    if (tab) tab.click();
    window.scrollTo(0, 0);
  });
  await new Promise(r => setTimeout(r, 800));

  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_clean_slate_dashboard.png`,
    fullPage: false
  });
  console.log('Saved screenshot_clean_slate_dashboard.png');

  // Verify Header quick button now says "Add Dummy Data"
  const quickText = await page.$eval('#quickDemoText', el => el.textContent.trim());
  console.log(`Header button text after removal: "${quickText}"`);
  if (!quickText.includes('Add Dummy Data')) {
    throw new Error(`Expected button text to contain "Add Dummy Data", got "${quickText}"`);
  }

  // 3. Click Header Quick Button to Add Dummy Data back
  console.log('Clicking Add Dummy Data button from header...');
  await page.click('#quickToggleDemoBtn');
  await new Promise(r => setTimeout(r, 1200));

  await page.evaluate(() => window.scrollTo(0, 0));
  await new Promise(r => setTimeout(r, 400));

  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_restored_dummy_data_dashboard.png`,
    fullPage: false
  });
  console.log('Saved screenshot_restored_dummy_data_dashboard.png');

  // 4. Test Android Mobile Viewport (412x915)
  console.log('Testing Android Mobile Viewport...');
  await page.setViewport({ width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  // Open mobile drawer
  await page.click('#mobileMenuBtn');
  await new Promise(r => setTimeout(r, 500));

  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_mobile_drawer_dummy_toggle.png`,
    fullPage: false
  });
  console.log('Saved screenshot_mobile_drawer_dummy_toggle.png');

  await browser.close();
  console.log('All dummy data toggle verifications passed successfully!');
}

run().catch(err => {
  console.error('Error during verification:', err);
  process.exit(1);
});
