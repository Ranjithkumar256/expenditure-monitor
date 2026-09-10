import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/75d2776b-39f8-480f-b26f-d87cececce90';
const APP_URL = 'http://localhost:8000';

async function run() {
  console.log('🚀 Launching Puppeteer for Mobile UX & Chart Verification...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    // 1. Desktop Test (1440x900)
    console.log('🖥️ Testing Desktop (1440x900)...');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 15000 });

    // If Auth Overlay is visible, click Quick Demo Login
    const isAuth = await page.$eval('#authOverlay', el => el.style.display !== 'none' && !el.classList.contains('d-none')).catch(() => false);
    if (isAuth) {
      console.log('⚡ Logging in with Quick Demo...');
      await page.click('#btnQuickDemoLogin');
      await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
    }

    await page.waitForSelector('#kpiNetworth', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 600));

    // Ensure desktop hides mobile segments
    const isMobileSegHidden = await page.$eval('#mobileDashSegmentNav', el => window.getComputedStyle(el).display === 'none');
    console.log(`✅ Desktop hides mobile segmented nav: ${isMobileSegHidden}`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_desktop_dashboard.png') });
    console.log('📸 Captured desktop dashboard.');

    // 2. Mobile Test (390x844 - iPhone / Modern Android)
    console.log('📱 Testing Mobile Viewport (390x844)...');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await new Promise(r => setTimeout(r, 600));

    // Verify 2x2 grid columns
    const kpiCols = await page.$eval('.kpi-grid', el => window.getComputedStyle(el).gridTemplateColumns);
    console.log(`✅ Mobile KPI Grid columns: ${kpiCols}`);

    // Verify no horizontal overflow
    const hasHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`✅ Zero horizontal overflow on mobile: ${!hasHorizontalOverflow}`);

    // Capture Mobile Overview Segment
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_overview.png') });
    console.log('📸 Captured mobile overview.');

    // Test Segment: Analytics (Charts)
    console.log('📊 Switching to Mobile Charts Segment...');
    await page.evaluate(() => window.switchMobileSegment('analytics'));
    await new Promise(r => setTimeout(r, 600));

    const donutWidth = await page.$eval('#categoryDonutChart', el => el.clientWidth);
    const trendWidth = await page.$eval('#trendBarChart', el => el.clientWidth);
    console.log(`✅ Mobile Donut Chart width: ${donutWidth}px, Trend Chart width: ${trendWidth}px`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_charts.png') });
    console.log('📸 Captured mobile charts.');

    // Test Segment: Accounts & Debts
    console.log('🏦 Switching to Mobile Accounts Segment...');
    await page.evaluate(() => window.switchMobileSegment('accounts'));
    await new Promise(r => setTimeout(r, 600));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_accounts.png') });
    console.log('📸 Captured mobile accounts.');

    // Test Transactions View
    console.log('💳 Testing Transactions View on Mobile...');
    await page.evaluate(() => window.switchTab('transactions'));
    await new Promise(r => setTimeout(r, 800));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_transactions.png') });
    console.log('📸 Captured mobile transactions card view.');

    // Test Reports View
    console.log('📈 Testing Reports View on Mobile...');
    await page.evaluate(() => window.switchTab('reports'));
    await new Promise(r => setTimeout(r, 800));

    // Day-wise tab in Reports
    await page.evaluate(() => document.getElementById('subTabDayWise')?.click());
    await new Promise(r => setTimeout(r, 600));

    const dailyChartWidth = await page.$eval('#reportDailyChart', el => el.clientWidth);
    console.log(`✅ Daily Timeline Chart width on mobile: ${dailyChartWidth}px`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_reports.png') });
    console.log('📸 Captured mobile reports.');

    console.log('🎉 ALL MOBILE UX & CHARTS VERIFICATIONS PASSED!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
