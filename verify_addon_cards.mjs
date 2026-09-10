/**
 * End-to-End verification script for Add-on / Supplementary Credit Cards
 * and Shared Limit synchronization in PaisaTrack.
 */
import puppeteer from 'puppeteer';
import path from 'path';

const ARTIFACTS_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/dfa1304c-d494-4f86-a410-2c3309ae98dc';
const APP_URL = 'http://localhost:8000';

async function verifyAddonCards() {
  console.log('🚀 Starting Add-on / Supplementary Cards verification...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();
    page.on('console', msg => console.log(`[Browser Console]:`, msg.text()));
    page.on('pageerror', err => console.log('[Browser PageError]:', err.message));

    // 1. Open Desktop Viewport
    await page.setViewport({ width: 1366, height: 860, deviceScaleFactor: 2 });
    await page.goto(APP_URL, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    console.log('📍 Navigating to Accounts & Cards tab...');
    await page.evaluate(() => {
      const accountsNav = document.querySelector('.nav-link[data-tab="accounts"]');
      if (accountsNav) accountsNav.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Verify Primary Card and Add-on Card are rendered
    const cardContent = await page.evaluate(() => {
      const grid = document.getElementById('cardsGrid');
      return {
        text: grid ? grid.innerText : '',
        html: grid ? grid.innerHTML : '',
        cardCount: grid ? grid.querySelectorAll('.credit-card-ui').length : 0
      };
    });

    console.log(`💳 Found ${cardContent.cardCount} cards in grid.`);
    if (!cardContent.text.includes('HDFC Regalia Gold (Primary)')) {
      throw new Error('Primary card not found in cards grid!');
    }
    if (!cardContent.text.includes('HDFC Regalia Add-on (Family)')) {
      throw new Error('Add-on card not found in cards grid!');
    }
    if (!cardContent.text.includes('ADD-ON CARD')) {
      throw new Error('ADD-ON CARD badge not found!');
    }
    if (!cardContent.text.includes('PRIMARY CARD')) {
      throw new Error('PRIMARY CARD badge not found!');
    }
    if (!cardContent.text.includes('Shared Available')) {
      throw new Error('Shared Available limit label not found!');
    }
    console.log('✅ Verified: Primary Card and Add-on Card with Shared Limit rendered accurately.');

    // Set height to 1450 so all accounts and all credit cards (including Add-on card) fit seamlessly
    await page.setViewport({ width: 1366, height: 1450, deviceScaleFactor: 2 });
    await new Promise(r => setTimeout(r, 400));

    // Capture Desktop Cards view screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'screenshot_cards_addon_desktop.png'),
      fullPage: false
    });
    console.log('📸 Captured: screenshot_cards_addon_desktop.png');

    // 2. Open Add Card Modal & test Add-on toggle
    console.log('📍 Opening Add Card Modal...');
    await page.evaluate(() => {
      const btn = document.getElementById('openAddCardBtn');
      if (btn) btn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // Toggle Add-on checkbox
    console.log('📍 Toggling Add-on checkbox...');
    await page.evaluate(() => {
      const cb = document.getElementById('cardIsAddon');
      cb.checked = true;
      cb.dispatchEvent(new Event('change'));
    });
    await new Promise(r => setTimeout(r, 500));

    const addonFieldsState = await page.evaluate(() => {
      const fields = document.getElementById('cardAddonFields');
      const parentSelect = document.getElementById('cardParentCard');
      const creditLimit = document.getElementById('cardCreditLimit');
      return {
        isFieldsVisible: fields && fields.style.display !== 'none',
        optionsCount: parentSelect ? parentSelect.options.length : 0,
        optionsText: parentSelect ? Array.from(parentSelect.options).map(o => o.text) : [],
        isCreditLimitReadonly: creditLimit && creditLimit.hasAttribute('readonly')
      };
    });

    console.log('🔍 Add-on fields visible:', addonFieldsState.isFieldsVisible);
    console.log('🔍 Primary card options:', addonFieldsState.optionsText);
    console.log('🔍 Credit limit locked (readonly):', addonFieldsState.isCreditLimitReadonly);

    if (!addonFieldsState.isFieldsVisible) {
      throw new Error('Add-on fields container did not become visible upon checking checkbox!');
    }
    if (addonFieldsState.optionsCount <= 1) {
      throw new Error('Parent card select options were not populated with primary cards!');
    }
    if (!addonFieldsState.isCreditLimitReadonly) {
      throw new Error('Credit limit input should be readonly when Add-on card is selected!');
    }
    console.log('✅ Verified: Add-on toggle reveals primary card dropdown and locks shared limit.');

    // Capture Add-on Card Modal screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'screenshot_modal_addon_card.png'),
      fullPage: false
    });
    console.log('📸 Captured: screenshot_modal_addon_card.png');

    // Close Modal
    await page.evaluate(() => {
      const closeBtn = document.querySelector('#modalCard [data-close="modalCard"]');
      if (closeBtn) closeBtn.click();
    });
    await new Promise(r => setTimeout(r, 500));

    // 3. Test Mobile Android Viewport
    console.log('📍 Testing Mobile Viewport (390x844)...');
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 1000));

    // Navigate to accounts & cards on mobile
    await page.evaluate(() => {
      const accountsNav = document.querySelector('[data-tab="accounts"]');
      if (accountsNav) accountsNav.click();
    });
    await new Promise(r => setTimeout(r, 1000));

    // Scroll to the Add-on Card specifically on mobile
    await page.evaluate(() => {
      const addonCard = document.querySelector('.credit-card-ui.is-addon-card');
      if (addonCard) {
        addonCard.scrollIntoView({ behavior: 'instant', block: 'center' });
      }
    });
    await new Promise(r => setTimeout(r, 400));

    // Capture Mobile Cards Screenshot
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, 'screenshot_mobile_addon_cards.png'),
      fullPage: false
    });
    console.log('📸 Captured: screenshot_mobile_addon_cards.png');

    console.log('🎉 ALL ADD-ON CARD TESTS AND VERIFICATIONS PASSED SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

verifyAddonCards().catch(err => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
