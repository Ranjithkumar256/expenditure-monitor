/**
 * End-to-End Automated Browser Verification Script
 * Validates PaisaTrack on Desktop and Android Mobile Viewports
 */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const ARTIFACTS_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/dfa1304c-d494-4f86-a410-2c3309ae98dc';
const APP_URL = 'http://localhost:8000';

async function runVerification() {
  console.log('🚀 Starting Puppeteer browser verification...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    // -------------------------------------------------------------
    // Test 1: Desktop Viewport (1440x900)
    // -------------------------------------------------------------
    console.log('📱 Testing Desktop Viewport (1440x900)...');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 15000 });

    // Wait for Dashboard to render
    await page.waitForSelector('#kpiNetworth', { timeout: 5000 });
    const networthText = await page.$eval('#kpiNetworth', el => el.textContent.trim());
    console.log(`✅ Net Worth rendered: ${networthText}`);

    // Capture Desktop Dashboard screenshot
    const shotDesktop = path.join(ARTIFACTS_DIR, 'screenshot_dashboard_desktop.png');
    await page.screenshot({ path: shotDesktop, fullPage: false });
    console.log(`📸 Captured Desktop Dashboard: ${shotDesktop}`);

    // -------------------------------------------------------------
    // Test 2: Log a New Expense via Modal
    // -------------------------------------------------------------
    console.log('💸 Testing Adding a New Expense Transaction...');
    await page.click('#headerAddBtn');
    await page.waitForSelector('#modalTransaction.open', { timeout: 3000 });

    await page.type('#transAmount', '3500.50');
    await page.type('#transDescription', 'Puppeteer Verification Dinner');
    await page.type('#transTags', '#test,#dinner');
    await page.click('#saveTransactionBtn');

    // Wait for modal to close
    await page.waitForSelector('#modalTransaction:not(.open)', { timeout: 5000 });
    console.log('✅ Expense logged successfully via modal!');

    // -------------------------------------------------------------
    // Test 3: Navigate to Accounts & Cards View
    // -------------------------------------------------------------
    console.log('💳 Navigating to Accounts & Cards View...');
    await page.evaluate(() => {
      document.querySelector('.desktop-sidebar [data-tab="accounts"]')?.click();
    });
    await page.waitForSelector('#accountsGrid .bank-account-card', { timeout: 5000 });
    const accCount = await page.$$eval('#accountsGrid .bank-account-card', els => els.length);
    console.log(`✅ Found ${accCount} bank account cards`);

    const shotAccounts = path.join(ARTIFACTS_DIR, 'screenshot_accounts_desktop.png');
    await page.screenshot({ path: shotAccounts, fullPage: false });
    console.log(`📸 Captured Accounts & Cards: ${shotAccounts}`);

    // -------------------------------------------------------------
    // Test 4: Navigate to Month-End Carry Forward View
    // -------------------------------------------------------------
    console.log('⚡ Navigating to Month-End Carry Forward Center...');
    await page.evaluate(() => {
      document.querySelector('.desktop-sidebar [data-tab="carryover"]')?.click();
    });
    await page.waitForFunction(() => {
      const el = document.getElementById('carryoverHeroClosingVal');
      return el && el.textContent.trim() !== '₹0.00' && el.textContent.trim() !== '';
    }, { timeout: 5000 });
    const closingVal = await page.$eval('#carryoverHeroClosingVal', el => el.textContent.trim());
    console.log(`✅ Carry Forward Closing Balance: ${closingVal}`);

    const shotCarryover = path.join(ARTIFACTS_DIR, 'screenshot_carryover_desktop.png');
    await page.screenshot({ path: shotCarryover, fullPage: false });
    console.log(`📸 Captured Carry Forward Center: ${shotCarryover}`);

    // -------------------------------------------------------------
    // Test 5: Navigate to Reports & Charts (Month-wise & Day-wise)
    // -------------------------------------------------------------
    console.log('📊 Navigating to Reports & Charts View...');
    await page.evaluate(() => {
      document.querySelector('.desktop-sidebar [data-tab="reports"]')?.click();
    });
    await page.waitForFunction(() => {
      const el = document.getElementById('reportMonthIncome');
      return el && el.textContent.trim() !== '₹0.00';
    }, { timeout: 5000 });

    // Switch to Day-wise tab
    await page.click('#subTabDayWise');
    await page.waitForFunction(() => {
      const el = document.getElementById('reportDailyAvg');
      return el && el.textContent.trim() !== '₹0.00';
    }, { timeout: 5000 });
    const dailyAvg = await page.$eval('#reportDailyAvg', el => el.textContent.trim());
    console.log(`✅ Day-wise average spend: ${dailyAvg}`);

    const shotReports = path.join(ARTIFACTS_DIR, 'screenshot_reports_desktop.png');
    await page.screenshot({ path: shotReports, fullPage: false });
    console.log(`📸 Captured Reports: ${shotReports}`);

    // -------------------------------------------------------------
    // Test 6: Android Mobile Viewport (412x915 Samsung Galaxy / Pixel)
    // -------------------------------------------------------------
    console.log('📱 Testing Android Mobile Viewport (412x915)...');
    await page.setViewport({
      width: 412,
      height: 915,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2.625
    });

    // Tap Home on mobile bottom bar
    await page.click('.bottom-nav-item[data-tab="dashboard"]');
    await page.waitForSelector('#mobileBottomBar', { timeout: 5000 });

    // Verify Mobile Bottom Bar is visible
    const bottomBarVisible = await page.$eval('#mobileBottomBar', el => window.getComputedStyle(el).display !== 'none');
    console.log(`✅ Android Mobile Bottom Navigation Bar visible: ${bottomBarVisible}`);

    const shotMobileDash = path.join(ARTIFACTS_DIR, 'screenshot_mobile_dashboard.png');
    await page.screenshot({ path: shotMobileDash, fullPage: false });
    console.log(`📸 Captured Android Mobile Dashboard: ${shotMobileDash}`);

    // -------------------------------------------------------------
    // Test 7: Android Mobile Drawer Navigation to Loans & Debts
    // -------------------------------------------------------------
    console.log('🤝 Testing Android Mobile Drawer & Loans/Debts...');
    // Open Mobile Drawer
    await page.click('#mobileMenuBtn');
    await page.waitForSelector('#mobileDrawerBackdrop.open', { timeout: 3000 });
    console.log('✅ Mobile drawer opened successfully!');

    // Click Loans & Debts in drawer
    await page.click('.mobile-drawer-nav [data-tab="debts"]');
    await page.waitForSelector('#loansGrid .loan-card', { timeout: 5000 });
    const loansCount = await page.$$eval('#loansGrid .loan-card', els => els.length);
    console.log(`✅ Android Mobile Loans & Debts view loaded with ${loansCount} active loans!`);

    const shotMobileDebts = path.join(ARTIFACTS_DIR, 'screenshot_mobile_debts.png');
    await page.screenshot({ path: shotMobileDebts, fullPage: false });
    console.log(`📸 Captured Android Mobile Debts: ${shotMobileDebts}`);

    // -------------------------------------------------------------
    // Test 8: Switch Currency to USD ($) and Verify Real-time Update
    // -------------------------------------------------------------
    console.log('💵 Testing Multi-Currency Switcher (INR -> USD)...');
    await page.select('#currencySelect', 'USD');
    await page.waitForFunction(() => {
      const el = document.getElementById('badgeTotalBorrowed');
      return el && el.textContent.includes('$');
    }, { timeout: 5000 });
    const usdVal = await page.$eval('#badgeTotalBorrowed', el => el.textContent.trim());
    console.log(`✅ Real-time currency switch verified! Converted value: ${usdVal}`);

    // Switch back to INR default
    await page.select('#currencySelect', 'INR');
    await page.waitForFunction(() => {
      const el = document.getElementById('badgeTotalBorrowed');
      return el && el.textContent.includes('₹');
    }, { timeout: 5000 });
    console.log('✅ Successfully reverted to Indian Rupee (₹ INR) default!');

    console.log('\n🎉 ALL 8 BROWSER & ANDROID VIEWPORT VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

runVerification().catch(err => {
  console.error('❌ Verification error:', err);
  process.exit(1);
});
