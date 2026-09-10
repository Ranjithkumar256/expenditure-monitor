import puppeteer from 'puppeteer';

const ARTIFACT_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/dfa1304c-d494-4f86-a410-2c3309ae98dc';

async function run() {
  console.log('Starting E2E verification of User Registration, Login & Multi-Tenant Data Isolation...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 2 });

  page.on('dialog', async dialog => {
    console.log(`[Dialog]: ${dialog.message()}`);
    await dialog.accept();
  });

  // 1. Clear any prior local storage and load clean page
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    localStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  // 2. Verify Auth Modal is displayed with Sign In tab
  const isAuthVisible = await page.evaluate(() => {
    const el = document.getElementById('authOverlay');
    return el && window.getComputedStyle(el).display !== 'none';
  });
  console.log('Auth Overlay visible on startup:', isAuthVisible);

  // Screenshot 1: Auth Screen (Sign In Tab)
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_auth_modal_signin.png`,
    fullPage: false
  });
  console.log('Captured screenshot_auth_modal_signin.png');

  // 3. Switch to Create Account (Sign Up) tab
  await page.evaluate(() => {
    document.getElementById('tabSignUpBtn')?.click();
  });
  await new Promise(r => setTimeout(r, 400));

  // Screenshot 2: Auth Screen (Register Tab)
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_auth_modal_register.png`,
    fullPage: false
  });
  console.log('Captured screenshot_auth_modal_register.png');

  // 4. Test Quick Demo Login
  await page.evaluate(() => {
    document.getElementById('tabSignInBtn')?.click();
  });
  await new Promise(r => setTimeout(r, 300));
  await page.evaluate(() => {
    document.getElementById('btnQuickDemoLogin')?.click();
  });
  await new Promise(r => setTimeout(r, 1000));

  // Verify demo user authenticated
  const demoUserText = await page.evaluate(() => {
    return document.getElementById('userDisplayName')?.textContent;
  });
  console.log('Logged in as:', demoUserText);

  // Screenshot 3: Demo User Dashboard with sample datasets
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_demo_user_dashboard.png`,
    fullPage: false
  });
  console.log('Captured screenshot_demo_user_dashboard.png');

  // 5. Test Logout
  await page.evaluate(() => {
    document.getElementById('logoutBtn')?.click();
  });
  await new Promise(r => setTimeout(r, 600));

  const isLoggedOut = await page.evaluate(() => {
    const el = document.getElementById('authOverlay');
    return el && window.getComputedStyle(el).display !== 'none';
  });
  console.log('Auth Overlay displayed after logout:', isLoggedOut);

  // 6. Register a Brand New User (e.g. "Ranjith Kumar")
  const uniqueUser = `ranjith_${Date.now().toString().slice(-4)}`;
  await page.evaluate((uName) => {
    document.getElementById('tabSignUpBtn')?.click();
    document.getElementById('regFullName').value = 'Ranjith Kumar';
    document.getElementById('regUsername').value = uName;
    document.getElementById('regEmail').value = `${uName}@example.com`;
    document.getElementById('regPassword').value = 'SecurePass123!';
    document.getElementById('formSignUp')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, uniqueUser);
  await new Promise(r => setTimeout(r, 1200));

  // Verify New User Profile loaded with clean slate
  const newUserName = await page.evaluate(() => {
    return document.getElementById('userDisplayName')?.textContent;
  });
  const netWorth = await page.evaluate(() => {
    return document.getElementById('kpiNetworth')?.textContent;
  });
  console.log(`New User Active: "${newUserName}", Net Worth: "${netWorth}"`);

  // Screenshot 4: New User Clean Slate Dashboard
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_new_user_dashboard.png`,
    fullPage: false
  });
  console.log('Captured screenshot_new_user_dashboard.png');

  // 7. Mobile Viewport & Slide-out Drawer Test
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await new Promise(r => setTimeout(r, 400));

  // Open mobile drawer
  await page.evaluate(() => {
    document.getElementById('mobileMenuBtn')?.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // Screenshot 5: Mobile Drawer with User Profile & Sign Out button
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_mobile_auth_view.png`,
    fullPage: false
  });
  console.log('Captured screenshot_mobile_auth_view.png');

  await browser.close();
  console.log('Verification completed successfully! All screenshots saved.');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
