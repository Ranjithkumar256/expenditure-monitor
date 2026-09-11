import puppeteer from 'puppeteer';

async function run() {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    console.log('🧪 TESTING DOWNLOAD FOLDER BACKUP, NETWORK BLOCKER & NEW INSTALL DB RESTORE');
    console.log('===========================================================================');

    // ==========================================
    // PAISATRACK TESTS
    // ==========================================
    console.log('\n--- PAISATRACK (http://localhost:8000) ---');
    const pagePaisa = await browser.newPage();
    await pagePaisa.goto('http://localhost:8000', { waitUntil: 'networkidle0' });

    // Clean install state
    await pagePaisa.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      location.reload();
    });
    await pagePaisa.waitForNavigation({ waitUntil: 'networkidle0' });

    // Test 1: New Install Backup Restore Option on Login Screen
    const paisaNewInstallCardVisible = await pagePaisa.$eval('#newInstallBackupCard', el => el.style.display !== 'none');
    const paisaAutoRestoreBtn = await pagePaisa.$('#btnAuthAutoRestore');
    const paisaFileRestoreBtn = await pagePaisa.$('#btnAuthFileRestore');
    console.log('PaisaTrack New Install Backup Card visible on login page:', paisaNewInstallCardVisible);
    console.log('PaisaTrack Auto-Restore button present:', !!paisaAutoRestoreBtn);
    console.log('PaisaTrack File-Restore button present:', !!paisaFileRestoreBtn);
    if (!paisaNewInstallCardVisible || !paisaAutoRestoreBtn || !paisaFileRestoreBtn) {
      throw new Error('PaisaTrack new install backup option missing on login page!');
    }
    console.log('✅ PASSED: PaisaTrack displays database restore option on new install login screen.');

    // Test 2: Backup filename in Download folder
    const paisaDownloadFilename = await pagePaisa.evaluate(() => window.BackupManager.DOWNLOAD_BACKUP_FILENAME);
    console.log('PaisaTrack Download backup filename:', paisaDownloadFilename);
    if (paisaDownloadFilename !== 'PaisaTrackbackupdatabase.json') {
      throw new Error(`Expected PaisaTrackbackupdatabase.json but got ${paisaDownloadFilename}`);
    }
    console.log('✅ PASSED: PaisaTrack backup file named PaisaTrackbackupdatabase.json.');

    // Test 3: Network Off Blocking Overlay
    console.log('Testing Network OFF state on PaisaTrack...');
    await pagePaisa.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await new Promise(r => setTimeout(r, 400));

    const paisaBlockerVisible = await pagePaisa.$eval('#networkOfflineBlocker', el => el.style.display !== 'none');
    const paisaBlockerText = await pagePaisa.$eval('#networkOfflineBlocker', el => el.innerText);
    console.log('PaisaTrack Network Off Blocker visible:', paisaBlockerVisible);
    console.log('PaisaTrack Blocker includes "Network is off":', paisaBlockerText.includes('Network is off'));
    if (!paisaBlockerVisible || !paisaBlockerText.includes('Network is off')) {
      throw new Error('PaisaTrack network offline blocker not showing correctly!');
    }

    // Turn Network back ON
    console.log('Testing Network ON state on PaisaTrack...');
    await pagePaisa.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });
    await new Promise(r => setTimeout(r, 400));

    const paisaBlockerHidden = await pagePaisa.$eval('#networkOfflineBlocker', el => el.style.display === 'none');
    console.log('PaisaTrack Network Off Blocker hidden when online:', paisaBlockerHidden);
    if (!paisaBlockerHidden) throw new Error('PaisaTrack blocker did not hide when online!');
    console.log('✅ PASSED: PaisaTrack network offline blocker blocks app and restores when online.');

    // ==========================================
    // DAILY HEALTH COACH TESTS
    // ==========================================
    console.log('\n--- DAILY HEALTH COACH (http://localhost:8001) ---');
    const pageDhc = await browser.newPage();
    await pageDhc.goto('http://localhost:8001', { waitUntil: 'networkidle0' });

    // Clean install state
    await pageDhc.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
      location.reload();
    });
    await pageDhc.waitForNavigation({ waitUntil: 'networkidle0' });

    // Test 4: New Install Backup Restore Option on Login Screen
    const dhcNewInstallCardVisible = await pageDhc.$eval('#newInstallBackupCard', el => el.style.display !== 'none');
    const dhcAutoRestoreBtn = await pageDhc.$('#btnAuthAutoRestore');
    const dhcFileRestoreBtn = await pageDhc.$('#btnAuthFileRestore');
    console.log('Daily Health Coach New Install Backup Card visible on login page:', dhcNewInstallCardVisible);
    console.log('Daily Health Coach Auto-Restore button present:', !!dhcAutoRestoreBtn);
    console.log('Daily Health Coach File-Restore button present:', !!dhcFileRestoreBtn);
    if (!dhcNewInstallCardVisible || !dhcAutoRestoreBtn || !dhcFileRestoreBtn) {
      throw new Error('Daily Health Coach new install backup option missing on login page!');
    }
    console.log('✅ PASSED: Daily Health Coach displays database restore option on new install login screen.');

    // Test 5: Backup filename in Download folder
    const dhcDownloadFilename = await pageDhc.evaluate(() => window.BackupManager.DOWNLOAD_BACKUP_FILENAME);
    console.log('Daily Health Coach Download backup filename:', dhcDownloadFilename);
    if (dhcDownloadFilename !== 'DailyHealthCoachbackupdatabase.json') {
      throw new Error(`Expected DailyHealthCoachbackupdatabase.json but got ${dhcDownloadFilename}`);
    }
    console.log('✅ PASSED: Daily Health Coach backup file named DailyHealthCoachbackupdatabase.json.');

    // Test 6: Network Off Blocking Overlay
    console.log('Testing Network OFF state on Daily Health Coach...');
    await pageDhc.evaluate(() => {
      window.dispatchEvent(new Event('offline'));
    });
    await new Promise(r => setTimeout(r, 400));

    const dhcBlockerVisible = await pageDhc.$eval('#networkOfflineBlocker', el => el.style.display !== 'none');
    const dhcBlockerText = await pageDhc.$eval('#networkOfflineBlocker', el => el.innerText);
    console.log('Daily Health Coach Network Off Blocker visible:', dhcBlockerVisible);
    console.log('Daily Health Coach Blocker includes "Network is off":', dhcBlockerText.includes('Network is off'));
    if (!dhcBlockerVisible || !dhcBlockerText.includes('Network is off')) {
      throw new Error('Daily Health Coach network offline blocker not showing correctly!');
    }

    // Turn Network back ON
    console.log('Testing Network ON state on Daily Health Coach...');
    await pageDhc.evaluate(() => {
      window.dispatchEvent(new Event('online'));
    });
    await new Promise(r => setTimeout(r, 400));

    const dhcBlockerHidden = await pageDhc.$eval('#networkOfflineBlocker', el => el.style.display === 'none');
    console.log('Daily Health Coach Network Off Blocker hidden when online:', dhcBlockerHidden);
    if (!dhcBlockerHidden) throw new Error('Daily Health Coach blocker did not hide when online!');
    console.log('✅ PASSED: Daily Health Coach network offline blocker blocks app and restores when online.');

    // Also capture screenshots of the new install card and network blocker
    await pagePaisa.evaluate(() => window.dispatchEvent(new Event('offline')));
    await new Promise(r => setTimeout(r, 300));
    await pagePaisa.screenshot({
      path: '/home/ranjith/.gemini/antigravity-ide/brain/80a9f79b-6444-45bd-bf2a-396b8804bebb/paisatrack_network_off_blocker.png'
    });

    await pagePaisa.evaluate(() => window.dispatchEvent(new Event('online')));
    await new Promise(r => setTimeout(r, 300));
    await pagePaisa.screenshot({
      path: '/home/ranjith/.gemini/antigravity-ide/brain/80a9f79b-6444-45bd-bf2a-396b8804bebb/paisatrack_login_restore_option.png'
    });

    await pageDhc.evaluate(() => window.dispatchEvent(new Event('offline')));
    await new Promise(r => setTimeout(r, 300));
    await pageDhc.screenshot({
      path: '/home/ranjith/.gemini/antigravity-ide/brain/80a9f79b-6444-45bd-bf2a-396b8804bebb/dhc_network_off_blocker.png'
    });

    await pageDhc.evaluate(() => window.dispatchEvent(new Event('online')));
    await new Promise(r => setTimeout(r, 300));
    await pageDhc.screenshot({
      path: '/home/ranjith/.gemini/antigravity-ide/brain/80a9f79b-6444-45bd-bf2a-396b8804bebb/dhc_login_restore_option.png'
    });

    console.log('\n===========================================================================');
    console.log('🎉 ALL 3 NEW REQUIREMENTS VERIFIED 100% ACROSS BOTH PROJECTS!');
    console.log('===========================================================================');

  } catch (err) {
    console.error('❌ TEST FAILED:', err);
    process.exit(1);
  } finally {
    await browser.close();
  }
}

run();
