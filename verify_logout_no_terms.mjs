import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });

  console.log('🧪 VERIFYING TERMS & CONDITIONS NEVER ASKED ON LOGOUT');
  console.log('====================================================\n');

  // --- PAISATRACK TESTS ---
  console.log('--- TESTING PAISATRACK (http://localhost:8000) ---');
  const page1 = await browser.newPage();
  await page1.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
  await page1.goto('http://localhost:8000', { waitUntil: 'networkidle0' });

  // Test 1: Click quick demo login -> terms modal appears
  await page1.$eval('#btnQuickDemoLogin', el => el.click());
  await new Promise(r => setTimeout(r, 800));
  let termsDisplay = await page1.$eval('#modalTermsConsent', el => window.getComputedStyle(el).display);
  console.log('PaisaTrack: Terms modal open after login:', termsDisplay === 'flex');

  // Test 2: Click top right corner logout button WITHOUT accepting terms
  console.log('PaisaTrack: Clicking top right corner logout button (#logoutBtn)...');
  await page1.$eval('#logoutBtn', el => el.click());
  await new Promise(r => setTimeout(r, 800));

  let authDisplay = await page1.$eval('#authOverlay', el => window.getComputedStyle(el).display);
  termsDisplay = await page1.$eval('#modalTermsConsent', el => window.getComputedStyle(el).display);
  console.log('PaisaTrack: Auth overlay visible on logout:', authDisplay === 'flex');
  console.log('PaisaTrack: Terms modal HIDDEN and NOT asking on logout:', termsDisplay === 'none');
  if (termsDisplay !== 'none') {
    throw new Error('FAILED: PaisaTrack terms modal still showing after logout!');
  }
  console.log('✅ PASSED: PaisaTrack terms modal is completely hidden when clicking top right logout.\n');

  // Test 3: Log in again and accept terms, then click top right logout
  console.log('PaisaTrack: Logging in second time and accepting terms...');
  await page1.$eval('#btnQuickDemoLogin', el => el.click());
  await new Promise(r => setTimeout(r, 800));
  await page1.$eval('#termsAgreeCheckbox', el => { el.checked = true; });
  await page1.$eval('#btnAcceptTerms', el => el.click());
  await new Promise(r => setTimeout(r, 800));

  console.log('PaisaTrack: Inside app, now clicking top right logout button...');
  await page1.$eval('#logoutBtn', el => el.click());
  await new Promise(r => setTimeout(r, 800));

  authDisplay = await page1.$eval('#authOverlay', el => window.getComputedStyle(el).display);
  termsDisplay = await page1.$eval('#modalTermsConsent', el => window.getComputedStyle(el).display);
  console.log('PaisaTrack: Auth overlay visible on second logout:', authDisplay === 'flex');
  console.log('PaisaTrack: Terms modal HIDDEN and NOT asking on second logout:', termsDisplay === 'none');
  if (termsDisplay !== 'none') {
    throw new Error('FAILED: PaisaTrack terms modal asking on second logout!');
  }
  console.log('✅ PASSED: PaisaTrack terms modal never asks while logging out!\n');

  // --- DAILY HEALTH COACH TESTS ---
  console.log('--- TESTING DAILY HEALTH COACH (http://localhost:8001) ---');
  const page2 = await browser.newPage();
  await page2.setViewport({ width: 375, height: 667, isMobile: true, hasTouch: true });
  await page2.goto('http://localhost:8001', { waitUntil: 'networkidle0' });

  // Test 4: Click quick demo login -> terms modal appears
  await page2.$eval('#btnQuickDemoLogin', el => el.click());
  await new Promise(r => setTimeout(r, 800));
  termsDisplay = await page2.$eval('#modalTermsConsent', el => window.getComputedStyle(el).display);
  console.log('Daily Health Coach: Terms modal open after login:', termsDisplay === 'flex');

  // Test 5: Click top right corner logout button WITHOUT accepting terms
  console.log('Daily Health Coach: Clicking top right corner logout button (#headerSignOutBtn)...');
  await page2.$eval('#headerSignOutBtn', el => el.click());
  await new Promise(r => setTimeout(r, 800));

  authDisplay = await page2.$eval('#authOverlay', el => window.getComputedStyle(el).display);
  termsDisplay = await page2.$eval('#modalTermsConsent', el => window.getComputedStyle(el).display);
  console.log('Daily Health Coach: Auth overlay visible on logout:', authDisplay === 'flex');
  console.log('Daily Health Coach: Terms modal HIDDEN and NOT asking on logout:', termsDisplay === 'none');
  if (termsDisplay !== 'none') {
    throw new Error('FAILED: Daily Health Coach terms modal still showing after logout!');
  }
  console.log('✅ PASSED: Daily Health Coach terms modal is completely hidden when clicking top right logout.\n');

  // Test 6: Log in again and accept terms, then click top right logout
  console.log('Daily Health Coach: Logging in second time and accepting terms...');
  await page2.$eval('#btnQuickDemoLogin', el => el.click());
  await new Promise(r => setTimeout(r, 800));
  await page2.$eval('#termsAgreeCheckbox', el => { el.checked = true; });
  await page2.$eval('#btnAcceptTerms', el => el.click());
  await new Promise(r => setTimeout(r, 800));

  console.log('Daily Health Coach: Inside app, now clicking top right logout button...');
  await page2.$eval('#headerSignOutBtn', el => el.click());
  await new Promise(r => setTimeout(r, 800));

  authDisplay = await page2.$eval('#authOverlay', el => window.getComputedStyle(el).display);
  termsDisplay = await page2.$eval('#modalTermsConsent', el => window.getComputedStyle(el).display);
  console.log('Daily Health Coach: Auth overlay visible on second logout:', authDisplay === 'flex');
  console.log('Daily Health Coach: Terms modal HIDDEN and NOT asking on second logout:', termsDisplay === 'none');
  if (termsDisplay !== 'none') {
    throw new Error('FAILED: Daily Health Coach terms modal asking on second logout!');
  }
  console.log('✅ PASSED: Daily Health Coach terms modal never asks while logging out!\n');

  // Capture clean screenshots
  await page1.screenshot({ path: '/home/ranjith/.gemini/antigravity-ide/brain/80a9f79b-6444-45bd-bf2a-396b8804bebb/paisatrack_clean_logout_screen.png' });
  await page2.screenshot({ path: '/home/ranjith/.gemini/antigravity-ide/brain/80a9f79b-6444-45bd-bf2a-396b8804bebb/dhc_clean_logout_screen.png' });

  await browser.close();

  console.log('====================================================');
  console.log('🎉 ALL LOGOUT VERIFICATIONS PASSED 100% ACROSS BOTH APPS!');
  console.log('====================================================');
})();
