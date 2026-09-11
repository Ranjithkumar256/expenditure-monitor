import puppeteer from 'puppeteer';

async function runTest() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    console.log('🧪 TESTING "ASK EVERYTIME LOGIN TERMS & CONDITIONS" ACROSS BOTH APPS');
    console.log('=====================================================================');

    // ==========================================
    // 1. PAISATRACK TESTS
    // ==========================================
    console.log('\n--- PAISATRACK (http://localhost:8000) ---');
    const pagePaisa = await browser.newPage();
    await pagePaisa.goto('http://localhost:8000', { waitUntil: 'networkidle0' });

    // Ensure logged out first
    await pagePaisa.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      location.reload();
    });
    await pagePaisa.waitForNavigation({ waitUntil: 'networkidle0' });

    // Step 1: Verify Auth overlay is visible, and terms modal is NOT visible before login
    const authVisible1 = await pagePaisa.$eval('#authOverlay', el => el.style.display !== 'none');
    console.log('PaisaTrack Auth overlay visible before login:', authVisible1);

    // Step 2: Login with Demo User
    console.log('Clicking Quick Demo Login on PaisaTrack...');
    await pagePaisa.click('#btnQuickDemoLogin');
    await new Promise(r => setTimeout(r, 1200));

    // Step 3: Terms modal MUST be displayed immediately upon login!
    const termsVisibleOnLogin1 = await pagePaisa.$eval('#modalTermsConsent', el => el.style.display !== 'none' && el.classList.contains('show'));
    console.log('PaisaTrack Terms modal opened immediately upon login:', termsVisibleOnLogin1);
    if (!termsVisibleOnLogin1) throw new Error('PaisaTrack did not show Terms modal upon login!');

    // Step 4: Click Accept WITHOUT checking checkbox
    console.log('Clicking Accept & Continue without checking box...');
    await pagePaisa.click('#btnAcceptTerms');
    await new Promise(r => setTimeout(r, 400));

    const alertDisplay1 = await pagePaisa.$eval('#termsAgreeErrorAlert', el => el.style.display !== 'none');
    const alertText1 = await pagePaisa.$eval('#termsAgreeErrorAlert', el => el.innerText.trim());
    const logoutOptDisplay1 = await pagePaisa.$eval('#termsLogoutOption', el => el.style.display !== 'none');
    console.log('PaisaTrack Error alert visible:', alertDisplay1, `"${alertText1.split('\n')[0]}"`);
    console.log('PaisaTrack Logout option visible:', logoutOptDisplay1);
    if (!alertDisplay1 || !logoutOptDisplay1) throw new Error('Validation alert or logout option not shown on unchecked accept!');

    // Step 5: Check checkbox and Accept
    console.log('Checking checkbox and accepting...');
    await pagePaisa.click('#termsAgreeCheckbox');
    await new Promise(r => setTimeout(r, 300));
    await pagePaisa.click('#btnAcceptTerms');
    await new Promise(r => setTimeout(r, 600));

    const termsClosed1 = await pagePaisa.$eval('#modalTermsConsent', el => el.style.display === 'none' || !el.classList.contains('show'));
    console.log('PaisaTrack Terms modal closed after checking and accepting:', termsClosed1);
    if (!termsClosed1) throw new Error('Terms modal did not close after checking and accepting!');

    // Step 6: Log out
    console.log('Logging out of PaisaTrack...');
    await pagePaisa.click('#logoutBtn');
    await new Promise(r => setTimeout(r, 800));

    const authVisibleAfterLogout = await pagePaisa.$eval('#authOverlay', el => el.style.display !== 'none');
    console.log('PaisaTrack back to Auth Overlay after logout:', authVisibleAfterLogout);

    // Step 7: Log in AGAIN -> Terms MUST ASK EVERY TIME ON LOGIN!
    console.log('Logging in a SECOND time (verifying "ask everytime login")...');
    await pagePaisa.click('#btnQuickDemoLogin');
    await new Promise(r => setTimeout(r, 1200));

    const termsVisibleOnSecondLogin = await pagePaisa.$eval('#modalTermsConsent', el => el.style.display !== 'none' && el.classList.contains('show'));
    console.log('PaisaTrack Terms modal opened AGAIN on second login:', termsVisibleOnSecondLogin);
    if (!termsVisibleOnSecondLogin) throw new Error('PaisaTrack failed to ask Terms on second login!');

    // Step 8: Click Accept without checking, then click Logout from Terms modal
    await pagePaisa.click('#btnAcceptTerms');
    await new Promise(r => setTimeout(r, 400));
    console.log('Clicking Logout directly from Terms modal...');
    await pagePaisa.click('#btnTermsLogout');
    await new Promise(r => setTimeout(r, 800));

    const authVisibleAfterTermsLogout = await pagePaisa.$eval('#authOverlay', el => el.style.display !== 'none');
    const termsClosedAfterTermsLogout = await pagePaisa.$eval('#modalTermsConsent', el => el.style.display === 'none' || !el.classList.contains('show'));
    console.log('PaisaTrack successfully logged out from Terms modal:', authVisibleAfterTermsLogout && termsClosedAfterTermsLogout);
    if (!authVisibleAfterTermsLogout || !termsClosedAfterTermsLogout) throw new Error('PaisaTrack failed logout from Terms modal!');
    console.log('✅ PAISATRACK "ASK EVERYTIME LOGIN" FULLY VERIFIED!');

    // ==========================================
    // 2. DAILY HEALTH COACH TESTS
    // ==========================================
    console.log('\n--- DAILY HEALTH COACH (http://localhost:8001) ---');
    const pageDhc = await browser.newPage();
    await pageDhc.goto('http://localhost:8001', { waitUntil: 'networkidle0' });

    // Ensure logged out first
    await pageDhc.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      location.reload();
    });
    await pageDhc.waitForNavigation({ waitUntil: 'networkidle0' });

    // Step 1: Verify Auth overlay is visible
    const dhcAuthVisible1 = await pageDhc.$eval('#authOverlay', el => el.style.display !== 'none');
    console.log('Daily Health Coach Auth overlay visible before login:', dhcAuthVisible1);

    // Step 2: Login with Demo User
    console.log('Clicking Quick Demo Login on Daily Health Coach...');
    await pageDhc.click('#btnQuickDemoLogin');
    await new Promise(r => setTimeout(r, 1200));

    // Step 3: Terms modal MUST be displayed immediately upon login!
    const dhcTermsVisibleOnLogin1 = await pageDhc.$eval('#modalTermsConsent', el => el.style.display !== 'none' && el.classList.contains('show'));
    console.log('Daily Health Coach Terms modal opened immediately upon login:', dhcTermsVisibleOnLogin1);
    if (!dhcTermsVisibleOnLogin1) throw new Error('Daily Health Coach did not show Terms modal upon login!');

    // Step 4: Click Accept WITHOUT checking checkbox
    console.log('Clicking Accept & Continue without checking box...');
    await pageDhc.click('#btnAcceptTerms');
    await new Promise(r => setTimeout(r, 400));

    const dhcAlertDisplay1 = await pageDhc.$eval('#termsAgreeErrorAlert', el => el.style.display !== 'none');
    const dhcAlertText1 = await pageDhc.$eval('#termsAgreeErrorAlert', el => el.innerText.trim());
    const dhcLogoutOptDisplay1 = await pageDhc.$eval('#termsLogoutOption', el => el.style.display !== 'none');
    console.log('Daily Health Coach Error alert visible:', dhcAlertDisplay1, `"${dhcAlertText1.split('\n')[0]}"`);
    console.log('Daily Health Coach Logout option visible:', dhcLogoutOptDisplay1);
    if (!dhcAlertDisplay1 || !dhcLogoutOptDisplay1) throw new Error('DHC Validation alert or logout option not shown on unchecked accept!');

    // Step 5: Check checkbox and Accept
    console.log('Checking checkbox and accepting...');
    await pageDhc.click('#termsAgreeCheckbox');
    await new Promise(r => setTimeout(r, 300));
    await pageDhc.click('#btnAcceptTerms');
    await new Promise(r => setTimeout(r, 600));

    const dhcTermsClosed1 = await pageDhc.$eval('#modalTermsConsent', el => el.style.display === 'none' || !el.classList.contains('show'));
    console.log('Daily Health Coach Terms modal closed after checking and accepting:', dhcTermsClosed1);
    if (!dhcTermsClosed1) throw new Error('DHC Terms modal did not close after checking and accepting!');

    // Step 6: Log out (via Targets/Settings modal or app.handleLogout)
    console.log('Logging out of Daily Health Coach...');
    await pageDhc.evaluate(() => window.app.handleLogout());
    await new Promise(r => setTimeout(r, 800));

    const dhcAuthVisibleAfterLogout = await pageDhc.$eval('#authOverlay', el => el.style.display !== 'none');
    console.log('Daily Health Coach back to Auth Overlay after logout:', dhcAuthVisibleAfterLogout);

    // Step 7: Log in AGAIN -> Terms MUST ASK EVERY TIME ON LOGIN!
    console.log('Logging in a SECOND time (verifying "ask everytime login")...');
    await pageDhc.click('#btnQuickDemoLogin');
    await new Promise(r => setTimeout(r, 1200));

    const dhcTermsVisibleOnSecondLogin = await pageDhc.$eval('#modalTermsConsent', el => el.style.display !== 'none' && el.classList.contains('show'));
    console.log('Daily Health Coach Terms modal opened AGAIN on second login:', dhcTermsVisibleOnSecondLogin);
    if (!dhcTermsVisibleOnSecondLogin) throw new Error('Daily Health Coach failed to ask Terms on second login!');

    // Step 8: Click Accept without checking, then click Logout from Terms modal
    await pageDhc.click('#btnAcceptTerms');
    await new Promise(r => setTimeout(r, 400));
    console.log('Clicking Logout directly from Terms modal...');
    await pageDhc.click('#btnTermsLogout');
    await new Promise(r => setTimeout(r, 800));

    const dhcAuthVisibleAfterTermsLogout = await pageDhc.$eval('#authOverlay', el => el.style.display !== 'none');
    const dhcTermsClosedAfterTermsLogout = await pageDhc.$eval('#modalTermsConsent', el => el.style.display === 'none' || !el.classList.contains('show'));
    console.log('Daily Health Coach successfully logged out from Terms modal:', dhcAuthVisibleAfterTermsLogout && dhcTermsClosedAfterTermsLogout);
    if (!dhcAuthVisibleAfterTermsLogout || !dhcTermsClosedAfterTermsLogout) throw new Error('Daily Health Coach failed logout from Terms modal!');
    console.log('✅ DAILY HEALTH COACH "ASK EVERYTIME LOGIN" FULLY VERIFIED!');

    console.log('\n=====================================================================');
    console.log('🎉 ALL TESTS PASSED: TERMS AND CONDITIONS ASKED EVERY TIME ON LOGIN!');
    console.log('=====================================================================');

  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

runTest();
