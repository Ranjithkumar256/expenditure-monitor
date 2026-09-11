import puppeteer from 'puppeteer';

(async () => {
  console.log('🚀 Starting Offline Standalone Zero-Server Auth Test...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });

  // Navigate to app first
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });

  // Clear state
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  page.on('console', msg => console.log('BROWSER LOG:', msg.text()));
  page.on('pageerror', err => console.log('BROWSER ERROR:', err.message));

  // Now block all network calls to simulate complete server offline / standalone APK mode
  await page.setRequestInterception(true);
  page.on('request', req => {
    const url = req.url();
    if (url.includes('/api/')) {
      req.abort('failed'); // Force network failure so PaisaLocalDB takes over
    } else {
      req.continue();
    }
  });

  console.log('\n--- Standalone Test 1: Wrong password rejection in zero-server offline mode ---');
  await page.waitForSelector('#loginUsername', { visible: true });
  await page.type('#loginUsername', 'demo');
  await page.type('#loginPassword', 'wrongpassword999');
  await page.click('#btnSubmitLogin');

  await page.waitForFunction(() => {
    const alertBox = document.getElementById('authAlert');
    return alertBox && alertBox.style.display !== 'none' && alertBox.textContent.trim().length > 0;
  }, { timeout: 4000 });

  const alertText = await page.$eval('#authAlert', el => el.textContent.trim());
  console.log('Standalone Auth Alert:', alertText);
  if (!alertText.toLowerCase().includes('incorrect username or password')) {
    throw new Error(`Expected 'Incorrect username or password' offline, got: '${alertText}'`);
  }
  console.log('✅ PASS: Standalone offline mode properly rejected invalid credentials.');

  console.log('\n--- Standalone Test 2: Valid Demo login in zero-server offline mode ---');
  await page.evaluate(() => {
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
  });
  await page.type('#loginUsername', 'demo');
  await page.type('#loginPassword', 'demo123');
  await page.click('#btnSubmitLogin');

  await new Promise(r => setTimeout(r, 2000));
  const alertText2 = await page.$eval('#authAlert', el => el.textContent.trim());
  console.log('Auth alert text during demo login:', alertText2);

  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && overlay.style.display === 'none';
  }, { timeout: 5000 });

  console.log('✅ Demo user logged in successfully in offline mode.');

  const quickDemoDisplay = await page.$eval('#quickToggleDemoBtn', el => window.getComputedStyle(el).display);
  console.log('Header Quick Demo button display (Demo User Offline):', quickDemoDisplay);
  if (quickDemoDisplay === 'none') {
    throw new Error('Expected #quickToggleDemoBtn to be VISIBLE for Demo user in offline mode!');
  }
  console.log('✅ PASS: Demo user sees demo controls in offline mode.');

  console.log('\n--- Standalone Test 3: Real user registration in zero-server offline mode ---');
  await page.click('#logoutBtn');
  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && overlay.style.display !== 'none';
  }, { timeout: 4000 });

  await page.click('[data-target="signUpTab"]');
  await page.waitForSelector('#regUsername', { visible: true });

  const randomUser = `offline_user_${Date.now()}`;
  await page.type('#regFullName', 'Offline User');
  await page.type('#regUsername', randomUser);
  await page.type('#regEmail', `${randomUser}@local.com`);
  await page.type('#regPassword', 'localkey999');
  await page.click('#btnSubmitRegister');

  await page.waitForFunction(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && overlay.style.display === 'none';
  }, { timeout: 5000 });

  console.log(`✅ Offline real user '${randomUser}' created and logged in.`);

  const realQuickDemoDisplay = await page.$eval('#quickToggleDemoBtn', el => window.getComputedStyle(el).display);
  console.log('Header Quick Demo button display (Real User Offline):', realQuickDemoDisplay);
  if (realQuickDemoDisplay !== 'none') {
    throw new Error('Expected #quickToggleDemoBtn to be HIDDEN for Real user in offline mode!');
  }

  // Check transactions clean slate
  await page.click('[data-tab="transactions"]');
  await page.waitForSelector('#transactionsTbody');
  const txRowCount = await page.$$eval('#transactionsTbody tr:not(.empty-state-row)', rows => rows.length);
  console.log('Offline Real user transactions count:', txRowCount);
  if (txRowCount > 0) {
    throw new Error(`Expected 0 transactions for offline real user, but found ${txRowCount}!`);
  }
  console.log('✅ PASS: Offline real user has clean slate and hidden demo controls.');

  await browser.close();
  console.log('\n🎉 ALL OFFLINE STANDALONE TESTS PASSED SUCCESSFULLY!');
})();
