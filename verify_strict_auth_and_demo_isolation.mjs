import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Strict Authentication & Demo Data Isolation Verification...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Handle dialogs (alerts, confirms)
  page.on('dialog', async dialog => {
    console.log('Dialog opened:', dialog.message());
    await dialog.accept();
  });

  // Navigate to app
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });

  // Ensure clean initial state (logout / clear token)
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.reload({ waitUntil: 'networkidle0' });

  // -------------------------------------------------------------
  // Test 1: Invalid Login (Wrong Password)
  // -------------------------------------------------------------
  console.log('\n--- Test 1: Testing invalid login rejection ---');
  await page.waitForSelector('#loginUsername', { visible: true });
  await page.type('#loginUsername', 'demo');
  await page.type('#loginPassword', 'wrongpassword999');
  await page.click('#btnSubmitLogin');

  await page.waitForFunction(() => {
    const alertBox = document.getElementById('authAlert');
    return alertBox && alertBox.style.display !== 'none' && alertBox.textContent.trim().length > 0;
  }, { timeout: 4000 });

  const alertText = await page.$eval('#authAlert', el => el.textContent.trim());
  console.log('Auth Alert Text displayed:', alertText);
  if (!alertText.toLowerCase().includes('incorrect username or password')) {
    throw new Error(`Expected 'Incorrect username or password' but got: '${alertText}'`);
  }

  const overlayVisible = await page.$eval('#authOverlay', el => el.style.display !== 'none');
  if (!overlayVisible) {
    throw new Error('User was mistakenly let into the dashboard on invalid credentials!');
  }
  console.log('✅ PASS: Access properly blocked with "Incorrect username or password".');

  // -------------------------------------------------------------
  // Test 2: Valid Demo Login & Check Demo Controls Visibility
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Testing valid Demo user login ---');
  await page.evaluate(() => {
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  });
  await page.type('#loginUsername', 'demo');
  await page.type('#loginPassword', 'demo123');
  await page.click('#btnSubmitLogin');

  // Wait for overlay to hide
  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && overlay.style.display === 'none';
  }, { timeout: 6000 });

  console.log('✅ Demo user logged in successfully.');

  // Check demo controls in Header, Drawer, and Settings
  const quickDemoDisplay = await page.$eval('#quickToggleDemoBtn', el => window.getComputedStyle(el).display);
  console.log('Header Quick Demo button display (Demo User):', quickDemoDisplay);
  if (quickDemoDisplay === 'none') {
    throw new Error('Expected #quickToggleDemoBtn to be VISIBLE for Demo user!');
  }

  const drawerDemoDisplay = await page.$eval('#drawerToggleDemoBtn', el => window.getComputedStyle(el).display);
  console.log('Drawer Demo button display (Demo User):', drawerDemoDisplay);
  if (drawerDemoDisplay === 'none') {
    throw new Error('Expected #drawerToggleDemoBtn to be VISIBLE for Demo user!');
  }

  // Switch to Settings Tab
  await page.click('[data-tab="settings"]');
  await page.waitForSelector('.demo-data-control-card');
  const settingsDemoCardDisplay = await page.$eval('.demo-data-control-card', el => window.getComputedStyle(el).display);
  console.log('Settings Demo Data Control Card display (Demo User):', settingsDemoCardDisplay);
  if (settingsDemoCardDisplay === 'none') {
    throw new Error('Expected .demo-data-control-card to be VISIBLE for Demo user in Settings!');
  }
  console.log('✅ PASS: Dummy controls are correctly visible for Demo user.');

  // -------------------------------------------------------------
  // Test 3: Log Out
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Signing out ---');
  await page.click('#logoutBtn');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && overlay.style.display !== 'none';
  }, { timeout: 4000 });
  console.log('✅ Logged out successfully.');

  // -------------------------------------------------------------
  // Test 4: Real User Registration & Verify Clean Slate
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Registering real user & verifying clean slate ---');
  await page.click('[data-target="signUpTab"]');
  await page.waitForSelector('#regUsername', { visible: true });

  const randomUser = `priya_${Date.now()}`;
  await page.type('#regFullName', 'Priya Sharma');
  await page.type('#regUsername', randomUser);
  await page.type('#regEmail', `${randomUser}@gmail.com`);
  await page.type('#regPassword', 'securepass123');
  await page.click('#btnSubmitRegister');

  // Wait for overlay to hide
  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && overlay.style.display === 'none';
  }, { timeout: 6000 });

  console.log(`✅ Real user '${randomUser}' registered and inside dashboard.`);

  // Verify Header Quick Demo button is HIDDEN
  const realQuickDemoDisplay = await page.$eval('#quickToggleDemoBtn', el => window.getComputedStyle(el).display);
  console.log('Header Quick Demo button display (Real User):', realQuickDemoDisplay);
  if (realQuickDemoDisplay !== 'none') {
    throw new Error('Expected #quickToggleDemoBtn to be HIDDEN for Real user!');
  }

  // Verify Drawer Demo button is HIDDEN
  const realDrawerDemoDisplay = await page.$eval('#drawerToggleDemoBtn', el => window.getComputedStyle(el).display);
  console.log('Drawer Demo button display (Real User):', realDrawerDemoDisplay);
  if (realDrawerDemoDisplay !== 'none') {
    throw new Error('Expected #drawerToggleDemoBtn to be HIDDEN for Real user!');
  }

  // Verify Settings card is HIDDEN
  await page.click('[data-tab="settings"]');
  const realSettingsCardDisplay = await page.$eval('.demo-data-control-card', el => window.getComputedStyle(el).display);
  console.log('Settings Demo Data Control Card display (Real User):', realSettingsCardDisplay);
  if (realSettingsCardDisplay !== 'none') {
    throw new Error('Expected .demo-data-control-card to be HIDDEN for Real user!');
  }

  // Verify Transactions clean slate (0 dummy records)
  await page.click('[data-tab="transactions"]');
  await page.waitForSelector('#transactionsTbody');
  const txRowCount = await page.$$eval('#transactionsTbody tr:not(.empty-state-row)', rows => rows.length);
  console.log('Transaction rows for Real user:', txRowCount);
  if (txRowCount > 0) {
    throw new Error(`Expected 0 transactions for new real user, but found ${txRowCount}!`);
  }
  console.log('✅ PASS: Real user has clean slate (0 dummy transactions) and ALL demo controls are completely hidden.');

  // -------------------------------------------------------------
  // Test 5: Real User Re-login & Password Verification
  // -------------------------------------------------------------
  console.log('\n--- Test 5: Testing Real user sign out & password verification ---');
  await page.click('#logoutBtn');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && overlay.style.display !== 'none';
  }, { timeout: 4000 });

  await page.click('[data-target="signInTab"]');
  await page.waitForSelector('#loginUsername', { visible: true });
  await page.evaluate(() => {
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  });
  await page.type('#loginUsername', randomUser);
  await page.type('#loginPassword', 'wrongpass999');
  await page.click('#btnSubmitLogin');

  await page.waitForFunction(() => {
    const alertBox = document.getElementById('authAlert');
    return alertBox && alertBox.style.display !== 'none' && alertBox.textContent.trim().length > 0;
  }, { timeout: 4000 });

  const wrongPassMsg = await page.$eval('#authAlert', el => el.textContent.trim());
  console.log('Auth alert on real user wrong password:', wrongPassMsg);
  if (!wrongPassMsg.toLowerCase().includes('incorrect username or password')) {
    throw new Error(`Expected 'Incorrect username or password' on real user wrong password, got: '${wrongPassMsg}'`);
  }
  console.log('✅ PASS: Real user wrong password correctly rejected.');

  // Try correct password
  await page.evaluate(() => {
    document.getElementById('loginPassword').value = '';
  });
  await page.type('#loginPassword', 'securepass123');
  await page.click('#btnSubmitLogin');

  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && overlay.style.display === 'none';
  }, { timeout: 6000 });

  console.log('✅ PASS: Real user logged in with correct password.');

  // Re-verify demo controls remain hidden
  const recheckDemoBtn = await page.$eval('#quickToggleDemoBtn', el => window.getComputedStyle(el).display);
  if (recheckDemoBtn !== 'none') {
    throw new Error('Expected #quickToggleDemoBtn to stay hidden for real user after re-login!');
  }
  console.log('✅ PASS: Demo controls remain strictly hidden for real user.');

  await browser.close();
  console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 100% VERIFIED.');
})();
