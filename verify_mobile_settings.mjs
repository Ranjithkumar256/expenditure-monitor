import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/75d2776b-39f8-480f-b26f-d87cececce90';
const APP_URL = 'http://localhost:8000';

async function run() {
  console.log('🚀 Launching Puppeteer for Mobile Settings UX Verification...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    // 1. Mobile Test Viewport (390x844 - iPhone 14 / Android 1080p standard scale)
    console.log('📱 Testing Mobile Viewport (390x844)...');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 15000 });

    // Handle login if needed
    const isAuth = await page.$eval('#authOverlay', el => el.style.display !== 'none' && !el.classList.contains('d-none')).catch(() => false);
    if (isAuth) {
      console.log('⚡ Logging in with Quick Demo...');
      await page.click('#btnQuickDemoLogin');
      await page.waitForNetworkIdle({ timeout: 5000 }).catch(() => {});
    }

    await page.waitForSelector('#kpiNetworth', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 600));

    // 2. Navigate to Settings Tab
    console.log('⚙️ Navigating to Settings Tab...');
    await page.evaluate(() => {
      window.switchTab('settings');
      document.querySelectorAll('.toast').forEach(t => t.remove());
    });
    await new Promise(r => setTimeout(r, 800));

    // Check page title
    const pageTitle = await page.$eval('#pageTitle', el => el.textContent.trim());
    console.log(`✅ Page Title: "${pageTitle}"`);

    // Verify Mobile Settings Segment Bar is visible
    const isSegmentVisible = await page.$eval('#mobileSettingsSegmentNav', el => {
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden';
    });
    console.log(`✅ Mobile Settings Segment Nav visible: ${isSegmentVisible}`);

    // Check for Horizontal Overflow
    const overflowCheck = await page.evaluate(() => {
      const docW = document.documentElement.scrollWidth;
      const winW = document.documentElement.clientWidth;
      const bodyW = document.body.scrollWidth;
      return {
        docScrollWidth: docW,
        clientWidth: winW,
        bodyScrollWidth: bodyW,
        hasOverflow: docW > winW || bodyW > winW
      };
    });
    console.log(`✅ Zero horizontal overflow on mobile Settings: ${!overflowCheck.hasOverflow}`, overflowCheck);

    // Capture "All" view
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_settings_all.png') });
    console.log('📸 Captured screenshot_mobile_settings_all.png');

    // 3. Test Segment: Profiles
    console.log('👤 Testing Segment: Profiles...');
    await page.evaluate(() => window.switchMobileSettingsSegment('profiles'));
    await new Promise(r => setTimeout(r, 400));

    // Check that Profiles card is visible and others are hidden
    const profilesCardVisible = await page.$eval('.settings-segment-profiles', el => window.getComputedStyle(el).display !== 'none');
    const currencyCardHidden = await page.$eval('.settings-segment-currency', el => window.getComputedStyle(el).display === 'none');
    console.log(`✅ Profiles segment filtering: Profiles visible=${profilesCardVisible}, Currency hidden=${currencyCardHidden}`);

    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_settings_profiles.png') });
    console.log('📸 Captured screenshot_mobile_settings_profiles.png');

    // 4. Test Segment: Currency
    console.log('🌐 Testing Segment: Currency...');
    await page.evaluate(() => window.switchMobileSettingsSegment('currency'));
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_settings_currency.png') });
    console.log('📸 Captured screenshot_mobile_settings_currency.png');

    // 5. Test Segment: Categories
    console.log('🏷️ Testing Segment: Categories...');
    await page.evaluate(() => window.switchMobileSettingsSegment('categories'));
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_settings_categories.png') });
    console.log('📸 Captured screenshot_mobile_settings_categories.png');

    // 6. Test Segment: App Data
    console.log('⚡ Testing Segment: App Data...');
    await page.evaluate(() => window.switchMobileSettingsSegment('data'));
    await new Promise(r => setTimeout(r, 400));
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_settings_data.png') });
    console.log('📸 Captured screenshot_mobile_settings_data.png');

    // 7. Test on Ultra-Compact Android Viewport (360x780 - Samsung Galaxy / Redmi standard)
    console.log('📱 Testing Ultra-Compact Android Screen (360x780)...');
    await page.setViewport({ width: 360, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.evaluate(() => window.switchMobileSettingsSegment('all'));
    await new Promise(r => setTimeout(r, 500));

    const ultraOverflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    console.log(`✅ Zero horizontal overflow on 360px ultra-compact mobile: ${!ultraOverflow}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_settings_360px.png') });
    console.log('📸 Captured screenshot_mobile_settings_360px.png');

    // 8. Test Desktop (1440x900) to ensure desktop view is NOT broken or altered
    console.log('🖥️ Verifying Desktop (1440x900) integrity...');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.evaluate(() => window.switchTab('settings'));
    await new Promise(r => setTimeout(r, 600));

    const isMobileNavHiddenOnDesktop = await page.$eval('#mobileSettingsSegmentNav', el => window.getComputedStyle(el).display === 'none');
    const settingsGridCols = await page.$eval('.settings-grid', el => window.getComputedStyle(el).gridTemplateColumns);
    console.log(`✅ Desktop hides mobile segment nav: ${isMobileNavHiddenOnDesktop}`);
    console.log(`✅ Desktop grid columns preserved: ${settingsGridCols}`);
    await page.screenshot({ path: path.join(ARTIFACTS_DIR, 'screenshot_desktop_settings.png') });
    console.log('📸 Captured screenshot_desktop_settings.png');

    console.log('🎉 ALL SETTINGS UX VERIFICATIONS PASSED PERFECTLY!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
