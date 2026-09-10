import puppeteer from 'puppeteer';

const ARTIFACT_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/367ebdfd-572d-44c3-b69a-4324cdb0691b';

async function testUserSwitching() {
  console.log('🚀 Starting E2E Multi-User Isolation Verification...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 950, deviceScaleFactor: 1.5 });

  page.on('dialog', async dialog => {
    console.log(`[Browser Dialog]: ${dialog.message()}`);
    await dialog.accept();
  });

  // Step 1: Open clean page
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  const u1Suffix = Date.now().toString().slice(-5);
  const user1 = {
    name: 'Alpha Vikram',
    username: `alpha_${u1Suffix}`,
    email: `alpha_${u1Suffix}@test.com`,
    password: 'Password123!'
  };

  const user2 = {
    name: 'Beta Priya',
    username: `beta_${u1Suffix}`,
    email: `beta_${u1Suffix}@test.com`,
    password: 'Password123!'
  };

  console.log(`Creating User 1: ${user1.name} (${user1.username})`);

  // Step 2: Register User 1
  await page.evaluate((u) => {
    document.getElementById('tabSignUpBtn')?.click();
    document.getElementById('regFullName').value = u.name;
    document.getElementById('regUsername').value = u.username;
    document.getElementById('regEmail').value = u.email;
    document.getElementById('regPassword').value = u.password;
    document.getElementById('formSignUp')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, user1);
  await new Promise(r => setTimeout(r, 1500));

  // Verify User 1 logged in
  let currentHeaderUser = await page.evaluate(() => document.getElementById('userDisplayName')?.textContent);
  console.log(`User 1 logged in as: "${currentHeaderUser}"`);
  if (!currentHeaderUser.includes('Alpha')) {
    throw new Error(`Expected User 1 to be logged in, got: ${currentHeaderUser}`);
  }

  // Step 3: User 1 adds a distinct bank account
  console.log('User 1 creating account "Alpha Platinum Bank"...');
  await page.evaluate(async () => {
    window.switchTab('accounts');
    await new Promise(r => setTimeout(r, 400));
  });

  await page.evaluate(async () => {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('paisa_auth_token')}`
      },
      body: JSON.stringify({
        name: 'Alpha Platinum Bank',
        type: 'bank',
        institution_name: 'Alpha Global Bank',
        account_number_mask: '•••• 8888',
        balance: 75000.0,
        currency: 'INR',
        color: '#0284c7'
      })
    });
    return await res.json();
  });

  // Reload accounts view in page
  await page.evaluate(async () => {
    window.switchTab('accounts');
    await new Promise(r => setTimeout(r, 400));
  });
  await new Promise(r => setTimeout(r, 600));

  const user1AccountsText = await page.evaluate(() => document.getElementById('accountsGrid')?.innerText);
  console.log('User 1 Accounts on screen:', user1AccountsText.replace(/\n+/g, ' | '));
  if (!user1AccountsText.includes('Alpha Platinum Bank')) {
    throw new Error('Alpha Platinum Bank not found for User 1!');
  }

  // Screenshot User 1
  await page.screenshot({ path: `${ARTIFACT_DIR}/user1_alpha_active.png`, fullPage: false });
  console.log('Captured user1_alpha_active.png');

  // Step 4: User 1 LOGS OUT
  console.log('User 1 logging out...');
  await page.evaluate(() => {
    document.getElementById('logoutBtn')?.click();
  });
  await new Promise(r => setTimeout(r, 800));

  // Check state immediately upon logout (before any refresh)
  const isAuthOverlayOpen = await page.evaluate(() => {
    const overlay = document.getElementById('authOverlay');
    return overlay && window.getComputedStyle(overlay).display !== 'none';
  });
  const kpiNetworthAfterLogout = await page.evaluate(() => document.getElementById('kpiNetworth')?.textContent);
  console.log(`Logged out successfully. Auth overlay open: ${isAuthOverlayOpen}, Networth display reset to: "${kpiNetworthAfterLogout}"`);

  // Step 5: User 2 LOGS IN on SAME system WITHOUT any page reload / hard refresh!
  console.log(`Now logging in User 2: ${user2.name} (${user2.username}) WITHOUT page refresh...`);
  await page.evaluate(async (u) => {
    document.getElementById('tabSignUpBtn')?.click();
    document.getElementById('regFullName').value = u.name;
    document.getElementById('regUsername').value = u.username;
    document.getElementById('regEmail').value = u.email;
    document.getElementById('regPassword').value = u.password;
    document.getElementById('formSignUp')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, user2);
  await new Promise(r => setTimeout(r, 1500));

  // Step 6: Verify User 2's screen
  const user2HeaderName = await page.evaluate(() => document.getElementById('userDisplayName')?.textContent);
  console.log(`User 2 logged in as: "${user2HeaderName}"`);
  if (!user2HeaderName.includes('Beta')) {
    throw new Error(`Expected User 2 (Beta) in header, got: ${user2HeaderName}`);
  }

  // Switch to Accounts tab to check if User 1's account is present
  await page.evaluate(async () => {
    window.switchTab('accounts');
    await new Promise(r => setTimeout(r, 500));
  });

  const user2AccountsText = await page.evaluate(() => document.getElementById('accountsGrid')?.innerText);
  console.log('User 2 Accounts on screen:', user2AccountsText.replace(/\n+/g, ' | '));

  // Check for isolation
  if (user2AccountsText.includes('Alpha Platinum Bank')) {
    throw new Error('❌ DATA LEAK DETECTED! User 2 can see User 1\'s "Alpha Platinum Bank" account!');
  }
  if (user2AccountsText.includes('75,000') || user2AccountsText.includes('75000')) {
    throw new Error('❌ DATA LEAK DETECTED! User 2 can see User 1\'s balance!');
  }

  console.log('✅ Isolation Verified: User 1\'s "Alpha Platinum Bank" is NOT visible to User 2!');

  // Check User 2 Dashboard KPIs
  await page.evaluate(() => window.switchTab('dashboard'));
  await new Promise(r => setTimeout(r, 500));
  const user2NetWorth = await page.evaluate(() => document.getElementById('kpiNetworth')?.textContent);
  console.log(`User 2 Net Worth: "${user2NetWorth}" (Expected ₹ 0.00 / clean slate)`);

  // Screenshot User 2 immediately after login
  await page.screenshot({ path: `${ARTIFACT_DIR}/user2_beta_clean_isolation.png`, fullPage: false });
  console.log('Captured user2_beta_clean_isolation.png');

  // Step 7: Log out User 2 and log back in User 1
  console.log('Logging out User 2...');
  await page.evaluate(() => document.getElementById('logoutBtn')?.click());
  await new Promise(r => setTimeout(r, 600));

  console.log('Logging back in User 1...');
  await page.evaluate((u) => {
    document.getElementById('tabSignInBtn')?.click();
    document.getElementById('loginUsername').value = u.username;
    document.getElementById('loginPassword').value = u.password;
    document.getElementById('formSignIn')?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, user1);
  await new Promise(r => setTimeout(r, 1500));

  // Verify User 1 has their account back
  await page.evaluate(() => window.switchTab('accounts'));
  await new Promise(r => setTimeout(r, 500));
  const user1RestoredAccounts = await page.evaluate(() => document.getElementById('accountsGrid')?.innerText);
  console.log('User 1 restored accounts on screen:', user1RestoredAccounts.replace(/\n+/g, ' | '));
  if (!user1RestoredAccounts.includes('Alpha Platinum Bank')) {
    throw new Error('Expected User 1\'s Alpha Platinum Bank to be restored!');
  }

  await page.screenshot({ path: `${ARTIFACT_DIR}/user1_alpha_restored.png`, fullPage: false });
  console.log('Captured user1_alpha_restored.png');

  await browser.close();
  console.log('🎉 ALL MULTI-USER ISOLATION TESTS PASSED PERFECTLY!');
}

testUserSwitching().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
