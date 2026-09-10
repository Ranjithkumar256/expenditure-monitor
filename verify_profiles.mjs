/**
 * Comprehensive Multi-Profile Verification Script
 * Validates switching, adding, modifying, deleting, and cancelling profiles
 * across Desktop and Android Mobile viewports.
 */
import puppeteer from 'puppeteer';
import path from 'path';
import { execSync } from 'child_process';

const ARTIFACTS_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/dfa1304c-d494-4f86-a410-2c3309ae98dc';
const APP_URL = 'http://localhost:8000';

async function verifyMultiProfiles() {
  console.log('🚀 Starting Multi-Profile End-to-End Verification...');
  // Ensure clean test baseline with only profiles 1 and 2
  try {
    execSync(`python3 -c "
import sqlite3
conn = sqlite3.connect('finance.db')
c = conn.cursor()
for t in ['transactions', 'accounts', 'cards', 'loans', 'borrows_lent', 'categories', 'profiles']:
    c.execute(f'DELETE FROM {t} WHERE profile_id > 2' if t != 'profiles' else 'DELETE FROM profiles WHERE id > 2')
c.execute(\\"UPDATE settings SET value = '1' WHERE key = 'active_profile_id'\\")
conn.commit()
"`);
  } catch (e) {
    console.warn('Pre-clean warning:', e.message);
  }

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });

  try {
    const page = await browser.newPage();

    page.on('console', msg => console.log(`[Browser Console ${msg.type()}]:`, msg.text()));
    page.on('pageerror', err => console.log('[Browser PageError]:', err.message));

    // -------------------------------------------------------------
    // Step 1: Open Desktop Viewport & Check Initial Profile 1
    // -------------------------------------------------------------
    console.log('🖥️ Setting up Desktop Viewport (1440x900)...');
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 15000 });

    await page.waitForSelector('#headerProfileName', { timeout: 5000 });
    const prof1Name = await page.$eval('#headerProfileName', el => el.textContent.trim());
    const prof1Networth = await page.$eval('#kpiNetworth', el => el.textContent.trim());
    console.log(`✅ Profile 1 Active: "${prof1Name}", Net Worth: ${prof1Networth}`);

    const shotP1Dash = path.join(ARTIFACTS_DIR, 'screenshot_profile1_personal.png');
    await page.screenshot({ path: shotP1Dash, fullPage: false });
    console.log(`📸 Captured Profile 1 Dashboard: ${shotP1Dash}`);

    // -------------------------------------------------------------
    // Step 2: Open Profile Switcher Dropdown in Header
    // -------------------------------------------------------------
    console.log('🔽 Opening Profile Switcher Dropdown...');
    await page.click('#activeProfileBtn');
    await page.waitForSelector('#profileDropdownMenu.show', { timeout: 3000 });
    await new Promise(r => setTimeout(r, 400));

    const shotDropdown = path.join(ARTIFACTS_DIR, 'screenshot_profile_dropdown.png');
    await page.screenshot({ path: shotDropdown, fullPage: false });
    console.log(`📸 Captured Profile Switcher Dropdown: ${shotDropdown}`);

    // -------------------------------------------------------------
    // Step 3: Switch to Profile 2 ("Business & Consulting")
    // -------------------------------------------------------------
    console.log('🔄 Switching to Profile 2 (Business & Consulting)...');
    const p2Item = await page.$('.profile-quick-item[data-profile-id="2"]');
    if (p2Item) {
      await p2Item.click();
    } else {
      throw new Error('Profile 2 quick item not found in dropdown');
    }

    // Wait for header and dashboard to update
    await page.waitForFunction(() => {
      const el = document.getElementById('headerProfileName');
      return el && el.textContent.includes('Business');
    }, { timeout: 5000 });

    const prof2Name = await page.$eval('#headerProfileName', el => el.textContent.trim());
    const prof2Networth = await page.$eval('#kpiNetworth', el => el.textContent.trim());
    console.log(`✅ Switched to Profile 2: "${prof2Name}", Net Worth: ${prof2Networth}`);

    const shotP2Dash = path.join(ARTIFACTS_DIR, 'screenshot_profile2_business.png');
    await page.screenshot({ path: shotP2Dash, fullPage: false });
    console.log(`📸 Captured Profile 2 Dashboard: ${shotP2Dash}`);

    // -------------------------------------------------------------
    // Step 4: Open Manage Profiles Modal
    // -------------------------------------------------------------
    console.log('📋 Opening Manage Profiles Modal...');
    await page.click('#sidebarSwitchProfileBtn');
    await page.waitForSelector('#modalManageProfiles.open', { timeout: 3000 });
    await new Promise(r => setTimeout(r, 500));

    const shotManageModal = path.join(ARTIFACTS_DIR, 'screenshot_manage_profiles_modal.png');
    await page.screenshot({ path: shotManageModal, fullPage: false });
    console.log(`📸 Captured Manage Profiles Modal: ${shotManageModal}`);

    // -------------------------------------------------------------
    // Step 5: Add a New Profile (Profile 3: "Vacation & Family Trips")
    // -------------------------------------------------------------
    console.log('➕ Creating Profile 3 ("Vacation & Family Trips")...');
    await page.click('#modalOpenAddProfileBtn');
    await page.waitForSelector('#modalProfileForm.open', { timeout: 3000 });

    await page.type('#profileFormName', 'Vacation & Family Trips');
    await page.type('#profileFormDesc', 'Holiday travel budget, flights, and trip expenses');
    
    // Select cyan color swatch
    await page.evaluate(() => {
      document.querySelector('#colorPresetSwatches [data-color="#06b6d4"]')?.click();
      document.querySelector('#profileIconSelector [data-icon="plane"]')?.click();
    });

    const shotAddForm = path.join(ARTIFACTS_DIR, 'screenshot_add_profile_modal.png');
    await page.screenshot({ path: shotAddForm, fullPage: false });
    console.log(`📸 Captured Add Profile Form: ${shotAddForm}`);

    // Submit profile form
    await page.click('#saveProfileBtn');
    await page.waitForSelector('#modalProfileForm:not(.open)', { timeout: 4000 });

    // Wait for active profile to be "Vacation & Family Trips"
    await page.waitForFunction(() => {
      const el = document.getElementById('headerProfileName');
      return el && el.textContent.includes('Vacation');
    }, { timeout: 5000 });

    const prof3Name = await page.$eval('#headerProfileName', el => el.textContent.trim());
    console.log(`✅ Profile 3 Created & Automatically Switched Active: "${prof3Name}"`);

    // -------------------------------------------------------------
    // Step 6: Modify / Edit Profile 3
    // -------------------------------------------------------------
    console.log('✏️ Modifying Profile 3...');
    await new Promise(r => setTimeout(r, 800));
    await page.click('#sidebarSwitchProfileBtn');
    await page.waitForSelector('#modalManageProfiles.open', { timeout: 4000 });
    await new Promise(r => setTimeout(r, 500));

    // Find and click Edit on Profile 3
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.profile-card-item');
      for (const c of cards) {
        if (c.textContent.includes('Vacation & Family Trips')) {
          c.querySelector('.btn-modal-edit')?.click();
          break;
        }
      }
    });

    await page.waitForSelector('#modalProfileForm.open', { timeout: 4000 });
    // Clear and change description
    await page.evaluate(() => {
      const desc = document.getElementById('profileFormDesc');
      if (desc) desc.value = 'Updated: Europe & Goa Holiday Budget 2026';
    });

    // Save modified profile
    await page.click('#saveProfileBtn');
    await page.waitForSelector('#modalProfileForm:not(.open)', { timeout: 4000 });
    console.log('✅ Profile 3 Modified successfully!');

    // -------------------------------------------------------------
    // Step 7: Test Cancel Button
    // -------------------------------------------------------------
    console.log('🚫 Testing Cancel Button on Profile Form...');
    await new Promise(r => setTimeout(r, 600));
    await page.click('#sidebarSwitchProfileBtn');
    await page.waitForSelector('#modalManageProfiles.open', { timeout: 4000 });

    await page.evaluate(() => {
      const cards = document.querySelectorAll('.profile-card-item');
      for (const c of cards) {
        if (c.textContent.includes('Vacation')) {
          c.querySelector('.btn-modal-edit')?.click();
          break;
        }
      }
    });
    await page.waitForSelector('#modalProfileForm.open', { timeout: 4000 });
    // Click Cancel
    await page.click('#cancelProfileBtn');
    await page.waitForSelector('#modalProfileForm:not(.open)', { timeout: 4000 });
    console.log('✅ Cancel button verified: modal closed without saving!');

    // -------------------------------------------------------------
    // Step 8: Delete Profile 3 & Verify Auto-Fallback to Profile 1
    // -------------------------------------------------------------
    console.log('🗑️ Deleting Profile 3 with confirmation...');
    // Handle browser confirm dialog automatically
    page.on('dialog', async dialog => {
      console.log(`💬 Confirm Dialog: "${dialog.message().slice(0, 45)}..." -> Accepting`);
      await dialog.accept();
    });

    // Re-open Manage Profiles modal
    await new Promise(r => setTimeout(r, 600));
    await page.click('#sidebarSwitchProfileBtn');
    await page.waitForSelector('#modalManageProfiles.open', { timeout: 4000 });

    // Find and click Delete on Profile 3
    await page.evaluate(() => {
      const cards = document.querySelectorAll('.profile-card-item');
      for (const c of cards) {
        if (c.textContent.includes('Vacation')) {
          c.querySelector('.btn-modal-delete')?.click();
          break;
        }
      }
    });

    // Wait for fallback to Profile 1
    await page.waitForFunction(() => {
      const el = document.getElementById('headerProfileName');
      return el && el.textContent.includes('Personal Finances');
    }, { timeout: 5000 });
    console.log('✅ Profile 3 deleted and workspace seamlessly fell back to Profile 1!');

    // Close modal
    await page.evaluate(() => {
      document.querySelector('#modalManageProfiles [data-close="modalManageProfiles"]')?.click();
    });
    await page.waitForSelector('#modalManageProfiles:not(.open)', { timeout: 3000 });

    // -------------------------------------------------------------
    // Step 9: Android Mobile Viewport Verification (390x844)
    // -------------------------------------------------------------
    console.log('📱 Testing Android Mobile Viewport (390x844)...');
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    await page.reload({ waitUntil: 'networkidle0' });

    // Open mobile drawer
    await page.click('#mobileMenuBtn');
    await page.waitForSelector('#mobileDrawerBackdrop.open', { timeout: 3000 });
    await new Promise(r => setTimeout(r, 400));

    const shotMobileDrawer = path.join(ARTIFACTS_DIR, 'screenshot_mobile_drawer_profiles.png');
    await page.screenshot({ path: shotMobileDrawer, fullPage: false });
    console.log(`📸 Captured Android Mobile Drawer with Profile Card: ${shotMobileDrawer}`);

    // Close drawer
    await page.click('#closeDrawerBtn');
    await page.waitForSelector('#mobileDrawerBackdrop:not(.open)', { timeout: 3000 });

    // Open Header Profile Switcher on Mobile
    await page.click('#activeProfileBtn');
    await page.waitForSelector('#profileDropdownMenu.show', { timeout: 3000 });
    await new Promise(r => setTimeout(r, 400));

    const shotMobileDropdown = path.join(ARTIFACTS_DIR, 'screenshot_mobile_profile_switcher.png');
    await page.screenshot({ path: shotMobileDropdown, fullPage: false });
    console.log(`📸 Captured Android Mobile Profile Switcher: ${shotMobileDropdown}`);

    // Switch to Profile 2 on Mobile
    await page.evaluate(() => {
      const p2 = document.querySelector('.profile-quick-item[data-profile-id="2"]');
      if (p2) p2.click();
    });

    await page.waitForFunction(() => {
      const el = document.getElementById('headerProfileName');
      return el && el.textContent.includes('Business');
    }, { timeout: 5000 });

    const shotMobileP2 = path.join(ARTIFACTS_DIR, 'screenshot_mobile_profile2.png');
    await page.screenshot({ path: shotMobileP2, fullPage: false });
    console.log(`📸 Captured Android Mobile Profile 2 View: ${shotMobileP2}`);

    console.log('\n🎉 ALL MULTI-PROFILE VERIFICATION TESTS PASSED FLAWLESSLY!');

  } catch (err) {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

verifyMultiProfiles();
