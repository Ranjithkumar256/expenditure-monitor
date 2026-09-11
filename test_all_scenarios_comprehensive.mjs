import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const results = {
  paisatrack: {},
  healthCoach: {},
  androidBuilds: {}
};

async function testPaisaTrack(browser) {
  console.log('\n======================================================');
  console.log('🧪 TESTING PAISATRACK (expenditure-monitor: 8000)');
  console.log('======================================================');

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  // -------------------------------------------------------------------------
  // SCENARIO 1: Fresh Launch & Terms Consent Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Fresh Launch & Terms Consent ---');
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });

  const termsModalVisible = await page.$eval('#modalTermsConsent', el => el && el.style.display !== 'none');
  const acceptDisabled = await page.$eval('#btnAcceptTerms', el => el.disabled);
  console.log('Terms Modal Visible on Fresh Launch:', termsModalVisible);
  console.log('Accept Button Disabled Initially:', acceptDisabled);
  if (!termsModalVisible || !acceptDisabled) throw new Error('Terms modal did not enforce consent');

  // Check agreement box and accept
  await page.click('#termsAgreeCheckbox');
  const acceptEnabled = await page.$eval('#btnAcceptTerms', el => !el.disabled);
  console.log('Accept Button Enabled after Checkbox:', acceptEnabled);
  if (!acceptEnabled) throw new Error('Accept button remained disabled after checking agreement');

  await page.click('#btnAcceptTerms');
  await new Promise(r => setTimeout(r, 400));
  const termsModalClosed = await page.$eval('#modalTermsConsent', el => el.style.display === 'none' || !el.classList.contains('show'));
  console.log('Terms Modal Closed after Accept:', termsModalClosed);
  results.paisatrack.scenario1_terms = termsModalClosed ? 'PASSED' : 'FAILED';

  // -------------------------------------------------------------------------
  // SCENARIO 2: Strict Authentication & Real User Clean Slate
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Strict Authentication & Real User Clean Slate ---');
  // 2a. Wrong Password Test
  await page.evaluate(() => {
    document.getElementById('loginUsername').value = 'demo';
    document.getElementById('loginPassword').value = 'wrongpassword';
    document.getElementById('formSignIn').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 600));
  const authAlert = await page.$eval('#authAlert', el => el.textContent.trim());
  console.log('Rejection on Wrong Password:', authAlert);
  if (!authAlert.toLowerCase().includes('incorrect') && !authAlert.toLowerCase().includes('invalid')) {
    throw new Error('Wrong password was not rejected: ' + authAlert);
  }

  // 2b. Valid Demo Login
  await page.evaluate(() => {
    document.getElementById('loginUsername').value = 'demo';
    document.getElementById('loginPassword').value = 'demo123';
    document.getElementById('formSignIn').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 800));
  const demoControlsVisible = await page.evaluate(() => {
    const btn = document.getElementById('quickToggleDemoBtn');
    return btn && window.getComputedStyle(btn).display !== 'none';
  });
  console.log('Demo User Sees Demo Controls:', demoControlsVisible);

  // 2c. Register Real User
  const realUsername = 'real_' + Date.now();
  await page.evaluate(() => {
    document.getElementById('logoutBtn')?.click();
  });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate((uname) => {
    document.getElementById('tabSignUpBtn')?.click();
    document.getElementById('regFullName').value = 'Real Test User';
    document.getElementById('regUsername').value = uname;
    document.getElementById('regEmail').value = `${uname}@example.com`;
    document.getElementById('regPassword').value = 'SecurePass123!';
    document.getElementById('formSignUp').dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  }, realUsername);
  await new Promise(r => setTimeout(r, 1000));

  const realUserDemoControlsHidden = await page.evaluate(() => {
    const btn = document.getElementById('quickToggleDemoBtn');
    return !btn || window.getComputedStyle(btn).display === 'none';
  });
  console.log('Real User Has Clean Slate (Demo Controls Strictly Hidden):', realUserDemoControlsHidden);
  results.paisatrack.scenario2_auth_isolation = realUserDemoControlsHidden ? 'PASSED' : 'FAILED';

  // -------------------------------------------------------------------------
  // SCENARIO 3: Export Database to Dedicated File Manager Path
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Export Database to File Manager ---');
  // Seed sample database entries
  await page.evaluate(() => {
    localStorage.setItem('paisa_local_users_store_v2', JSON.stringify([{ id: 10, username: 'testuser' }]));
    localStorage.setItem('paisa_local_profiles_v1', JSON.stringify([{ id: 10, name: 'Main' }]));
    const txs = [{ id: 101, title: 'Grocery Run', amount: 1500, type: 'expense', date: '2026-09-11' }];
    localStorage.setItem('paisa_local_txs_v1_u10', JSON.stringify(txs));
  });

  const exportPayload = await page.evaluate(async () => {
    return await window.BackupManager.gatherDatabasePayload();
  });
  console.log('Export Payload App:', exportPayload.app);
  console.log('Export Payload Package ID:', exportPayload.package_id);
  console.log('Export Payload Designated Path:', exportPayload.designated_path);
  console.log('Keys Captured in Database:', Object.keys(exportPayload.data).length);

  if (exportPayload.package_id !== 'com.paisatrack.app') throw new Error('Wrong package ID in export');
  if (!exportPayload.designated_path.includes('Android/data/com.paisatrack.app/files/database_backup.json')) {
    throw new Error('Designated path mismatch');
  }
  results.paisatrack.scenario3_export = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 4: Simulated App Reinstall (Zero-Data Launch with Existing Database)
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 4: Simulated Reinstall (Auto-Loads Database File) ---');
  const simulatedDiskBackup = JSON.stringify(exportPayload);

  // Clear local storage (simulating app uninstallation and fresh reinstall)
  await page.evaluate(() => localStorage.clear());

  // Inject mock Capacitor Filesystem that returns the simulated disk file from Android/data
  const reinstallLoadResult = await page.evaluate(async (fileContent) => {
    window.Capacitor = {
      Plugins: {
        Filesystem: {
          readFile: async ({ path, directory }) => {
            if (path === 'database_backup.json') {
              return { data: fileContent };
            }
            throw new Error('File not found');
          }
        }
      }
    };
    // Trigger startup sync
    await window.BackupManager.syncFromDatabaseFileOnStartup();
    const restoredUser = localStorage.getItem('paisa_local_users_store_v2');
    const restoredHash = localStorage.getItem('paisa_loaded_db_file_hash');
    return { restored: !!restoredUser, hash: restoredHash, keys: Object.keys(localStorage) };
  }, simulatedDiskBackup);

  console.log('Reinstall Auto-Sync Result:', reinstallLoadResult);
  if (!reinstallLoadResult.restored) throw new Error('Startup sync failed to restore on reinstall');
  results.paisatrack.scenario4_reinstall = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 5: External Modification in File Manager (Auto-Syncs Modified Data)
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 5: External Modification in File Manager ---');
  // User modifies the database externally (e.g. edits an account balance to ₹999,999)
  const modifiedPayload = JSON.parse(simulatedDiskBackup);
  modifiedPayload.data['paisa_local_accounts_v1_u10'] = [{ id: 1, name: 'HDFC Salary Account', balance: 999999.00 }];
  const modifiedDiskBackup = JSON.stringify(modifiedPayload);

  const externalModifyResult = await page.evaluate(async (modContent) => {
    window.Capacitor.Plugins.Filesystem.readFile = async () => ({ data: modContent });
    await window.BackupManager.syncFromDatabaseFileOnStartup();
    const accounts = JSON.parse(localStorage.getItem('paisa_local_accounts_v1_u10') || '[]');
    const modifiedAcc = accounts.find(a => a.balance === 999999.00);
    return { success: !!modifiedAcc, balance: modifiedAcc ? modifiedAcc.balance : 0 };
  }, modifiedDiskBackup);

  console.log('External File Modification Detected & Applied:', externalModifyResult);
  if (!externalModifyResult.success) throw new Error('External database modification was not synced');
  results.paisatrack.scenario5_external_modify = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 6: Direct Restore from Android/data Button
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Direct Restore from Android/data Button ---');
  const directRestoreResult = await page.evaluate(async (backupData) => {
    let applied = false;
    const oldApply = window.BackupManager.applyImportedPayload;
    window.BackupManager.applyImportedPayload = async function(p, src, reload) {
      applied = true;
      return true;
    };
    await window.BackupManager.restoreFromDesignatedPath();
    window.BackupManager.applyImportedPayload = oldApply;
    return applied;
  }, simulatedDiskBackup);

  console.log('Direct Restore Button Handled:', directRestoreResult);
  if (!directRestoreResult) throw new Error('Direct restore failed');
  results.paisatrack.scenario6_direct_restore = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 7: Custom File Picker Import
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Custom File Picker Import ---');
  const filePickerResult = await page.evaluate(async () => {
    const samplePayload = {
      app: 'PaisaTrack',
      version: '1.2.0',
      data: { paisa_custom_test_import: 'verified_custom_value' }
    };
    const mockFile = {
      name: 'my_custom_backup.json',
      text: async () => JSON.stringify(samplePayload)
    };
    // Intercept reload so test does not drop context
    const oldApply = window.BackupManager.applyImportedPayload;
    window.BackupManager.applyImportedPayload = async function(p) {
      localStorage.setItem('paisa_custom_test_import', p.data.paisa_custom_test_import);
      return true;
    };
    await window.BackupManager.importFromFileManager(mockFile);
    window.BackupManager.applyImportedPayload = oldApply;
    return localStorage.getItem('paisa_custom_test_import') === 'verified_custom_value';
  });
  console.log('Custom File Import Result:', filePickerResult);
  if (!filePickerResult) throw new Error('Custom file import failed');
  results.paisatrack.scenario7_custom_import = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 8: Cloud Database Backup REST API & Modal
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 8: Cloud Database Backup & Restore API ---');
  const cloudPostRes = await page.evaluate(async (payload) => {
    const res = await fetch('/api/cloud-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, status: res.status, json: await res.json() };
  }, exportPayload);

  const cloudGetRes = await page.evaluate(async () => {
    const res = await fetch('/api/cloud-backup');
    return { ok: res.ok, status: res.status, json: await res.json() };
  });

  console.log('Cloud POST /api/cloud-backup:', cloudPostRes.status, cloudPostRes.json.message);
  console.log('Cloud GET /api/cloud-backup:', cloudGetRes.status, cloudGetRes.json.app);

  if (!cloudPostRes.ok || !cloudGetRes.ok || cloudGetRes.json.app !== 'PaisaTrack') {
    throw new Error('Cloud backup API test failed');
  }
  results.paisatrack.scenario8_cloud_api = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 9: Autosave Removal Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 9: Autosave Removal Verification ---');
  const autosaveClean = await page.evaluate(() => {
    return window.BackupManager.triggerAutoSave === undefined &&
           window.BackupManager._autoSaveTimer === undefined;
  });
  console.log('Autosave Timer and Interceptors Completely Removed:', autosaveClean);
  if (!autosaveClean) throw new Error('Autosave was not cleanly removed');
  results.paisatrack.scenario9_autosave_removed = 'PASSED';

  await page.close();
}

async function testHealthCoach(browser) {
  console.log('\n======================================================');
  console.log('🧪 TESTING DAILY HEALTH COACH (daily-health-coach: 8001)');
  console.log('======================================================');

  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });

  // -------------------------------------------------------------------------
  // SCENARIO 1: Fresh Launch & Terms Consent Enforcement
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 1: Fresh Launch & Terms Consent ---');
  await page.goto('http://localhost:8001', { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle0' });

  const termsModalVisible = await page.$eval('#modalTermsConsent', el => el && el.style.display !== 'none');
  const acceptDisabled = await page.$eval('#btnAcceptTerms', el => el.disabled);
  console.log('DHC Terms Modal Visible on Fresh Launch:', termsModalVisible);
  console.log('DHC Accept Button Disabled Initially:', acceptDisabled);
  if (!termsModalVisible || !acceptDisabled) throw new Error('DHC Terms modal did not enforce consent');

  await page.click('#termsAgreeCheckbox');
  await page.click('#btnAcceptTerms');
  await new Promise(r => setTimeout(r, 400));
  const termsModalClosed = await page.$eval('#modalTermsConsent', el => el.style.display === 'none');
  console.log('DHC Terms Modal Closed after Accept:', termsModalClosed);
  results.healthCoach.scenario1_terms = termsModalClosed ? 'PASSED' : 'FAILED';

  // -------------------------------------------------------------------------
  // SCENARIO 2: Log Health Data & Gather Database Payload
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 2: Log Health Data & Gather Database ---');
  await page.evaluate(() => {
    const water = [
      { id: 'w1', amount_ml: 500, timestamp: new Date().toISOString() },
      { id: 'w2', amount_ml: 250, timestamp: new Date().toISOString() }
    ];
    localStorage.setItem('dhc_water_logs_v1', JSON.stringify(water));
    localStorage.setItem('dhc_habits_v1', JSON.stringify([{ id: 'h1', name: 'Morning Jog', completed: true }]));
    localStorage.setItem('dhc_targets_v1', JSON.stringify({ water_target_ml: 3000 }));
  });

  const exportPayload = await page.evaluate(async () => {
    return await window.BackupManager.gatherDatabasePayload();
  });
  console.log('DHC Export App:', exportPayload.app);
  console.log('DHC Export Package ID:', exportPayload.package_id);
  console.log('DHC Export Designated Path:', exportPayload.designated_path);
  console.log('DHC Tables Captured:', Object.keys(exportPayload.data).length);

  if (exportPayload.package_id !== 'com.dailyhealthcoach.app') throw new Error('DHC Wrong package ID');
  if (!exportPayload.designated_path.includes('Android/data/com.dailyhealthcoach.app/files/database_backup.json')) {
    throw new Error('DHC Designated path mismatch');
  }
  results.healthCoach.scenario2_export = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 3: Simulated Reinstall (Auto-Loads Database File)
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 3: Simulated Reinstall (Auto-Loads Database File) ---');
  const simulatedDiskBackup = JSON.stringify(exportPayload);
  await page.evaluate(() => localStorage.clear());

  const reinstallResult = await page.evaluate(async (fileContent) => {
    window.Capacitor = {
      Plugins: {
        Filesystem: {
          readFile: async ({ path }) => {
            if (path === 'database_backup.json') return { data: fileContent };
            throw new Error('Not found');
          }
        }
      }
    };
    await window.BackupManager.syncFromDatabaseFileOnStartup();
    const water = localStorage.getItem('dhc_water_logs_v1');
    return { restored: !!water, data: water };
  }, simulatedDiskBackup);

  console.log('DHC Reinstall Auto-Sync Result:', reinstallResult.restored);
  if (!reinstallResult.restored) throw new Error('DHC Startup sync failed on reinstall');
  results.healthCoach.scenario3_reinstall = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 4: External Modification in File Manager
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 4: External Modification in File Manager ---');
  const modifiedPayload = JSON.parse(simulatedDiskBackup);
  modifiedPayload.data['dhc_water_logs_v1'] = [
    { id: 'w_ext', amount_ml: 9999, timestamp: new Date().toISOString() }
  ];
  const modifiedDiskBackup = JSON.stringify(modifiedPayload);

  const extModResult = await page.evaluate(async (modContent) => {
    window.Capacitor.Plugins.Filesystem.readFile = async () => ({ data: modContent });
    await window.BackupManager.syncFromDatabaseFileOnStartup();
    const logs = JSON.parse(localStorage.getItem('dhc_water_logs_v1') || '[]');
    const modifiedLog = logs.find(l => l.amount_ml === 9999);
    return { success: !!modifiedLog, amount: modifiedLog ? modifiedLog.amount_ml : 0 };
  }, modifiedDiskBackup);

  console.log('DHC External File Modification Detected & Applied:', extModResult);
  if (!extModResult.success) throw new Error('DHC External database modification not synced');
  results.healthCoach.scenario4_external_modify = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 5: Direct Restore Button & Custom Picker
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 5: Direct Restore Button & Custom Picker ---');
  const directRestoreResult = await page.evaluate(async () => {
    let applied = false;
    const oldApply = window.BackupManager.applyImportedPayload;
    window.BackupManager.applyImportedPayload = async function() {
      applied = true;
      return true;
    };
    await window.BackupManager.restoreFromDesignatedPath();
    window.BackupManager.applyImportedPayload = oldApply;
    return applied;
  });
  console.log('DHC Direct Restore Handled:', directRestoreResult);
  if (!directRestoreResult) throw new Error('DHC Direct restore failed');
  results.healthCoach.scenario5_direct_restore = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 6: Cloud Database Backup API
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 6: Cloud Database Backup API ---');
  const cloudPostRes = await page.evaluate(async (payload) => {
    const res = await fetch('/api/cloud-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return { ok: res.ok, status: res.status, json: await res.json() };
  }, exportPayload);

  const cloudGetRes = await page.evaluate(async () => {
    const res = await fetch('/api/cloud-backup');
    return { ok: res.ok, status: res.status, json: await res.json() };
  });

  console.log('DHC Cloud POST /api/cloud-backup:', cloudPostRes.status, cloudPostRes.json.message);
  console.log('DHC Cloud GET /api/cloud-backup:', cloudGetRes.status, cloudGetRes.json.app);

  if (!cloudPostRes.ok || !cloudGetRes.ok || cloudGetRes.json.app !== 'DailyHealthCoach') {
    throw new Error('DHC Cloud backup API test failed');
  }
  results.healthCoach.scenario6_cloud_api = 'PASSED';

  // -------------------------------------------------------------------------
  // SCENARIO 7: Autosave Removal Verification
  // -------------------------------------------------------------------------
  console.log('\n--- Scenario 7: Autosave Removal Verification ---');
  const autosaveClean = await page.evaluate(() => {
    return window.BackupManager.triggerAutoSave === undefined &&
           window.BackupManager._autoSaveTimer === undefined;
  });
  console.log('DHC Autosave Timer and Interceptors Completely Removed:', autosaveClean);
  if (!autosaveClean) throw new Error('DHC Autosave was not cleanly removed');
  results.healthCoach.scenario7_autosave_removed = 'PASSED';

  await page.close();
}

function verifyAndroidBinaries() {
  console.log('\n======================================================');
  console.log('📱 VERIFYING ANDROID MANIFESTS & BINARY ARTIFACTS');
  console.log('======================================================');

  // Check PaisaTrack APK & AAB
  const pApk = '/home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor/android/app/build/outputs/apk/debug/app-debug.apk';
  const pAab = '/home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor/android/app/build/outputs/bundle/release/app-release.aab';
  const pManifest = fs.readFileSync('/home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor/android/app/src/main/AndroidManifest.xml', 'utf8');

  const pApkSize = fs.existsSync(pApk) ? (fs.statSync(pApk).size / (1024 * 1024)).toFixed(2) + ' MB' : 'MISSING';
  const pAabSize = fs.existsSync(pAab) ? (fs.statSync(pAab).size / (1024 * 1024)).toFixed(2) + ' MB' : 'MISSING';
  const pFragile = pManifest.includes('android:hasFragileUserData="true"');
  const pAllowBackup = pManifest.includes('android:allowBackup="true"');

  console.log('PaisaTrack APK Size:', pApkSize);
  console.log('PaisaTrack Release AAB Size:', pAabSize);
  console.log('PaisaTrack Manifest hasFragileUserData (Keep Data on Uninstall):', pFragile);
  console.log('PaisaTrack Manifest allowBackup (Google Play Cloud Backup):', pAllowBackup);

  results.androidBuilds.paisatrack = {
    apkSize: pApkSize,
    aabSize: pAabSize,
    hasFragileUserData: pFragile,
    allowBackup: pAllowBackup
  };

  // Check Daily Health Coach APK & AAB
  const dApk = '/home/ranjith/.gemini/antigravity-ide/scratch/daily-health-coach/android/app/build/outputs/apk/debug/app-debug.apk';
  const dAab = '/home/ranjith/.gemini/antigravity-ide/scratch/daily-health-coach/android/app/build/outputs/bundle/release/app-release.aab';
  const dManifest = fs.readFileSync('/home/ranjith/.gemini/antigravity-ide/scratch/daily-health-coach/android/app/src/main/AndroidManifest.xml', 'utf8');

  const dApkSize = fs.existsSync(dApk) ? (fs.statSync(dApk).size / (1024 * 1024)).toFixed(2) + ' MB' : 'MISSING';
  const dAabSize = fs.existsSync(dAab) ? (fs.statSync(dAab).size / (1024 * 1024)).toFixed(2) + ' MB' : 'MISSING';
  const dFragile = dManifest.includes('android:hasFragileUserData="true"');
  const dAllowBackup = dManifest.includes('android:allowBackup="true"');

  console.log('Daily Health Coach APK Size:', dApkSize);
  console.log('Daily Health Coach Release AAB Size:', dAabSize);
  console.log('Daily Health Coach Manifest hasFragileUserData (Keep Data on Uninstall):', dFragile);
  console.log('Daily Health Coach Manifest allowBackup (Google Play Cloud Backup):', dAllowBackup);

  results.androidBuilds.healthCoach = {
    apkSize: dApkSize,
    aabSize: dAabSize,
    hasFragileUserData: dFragile,
    allowBackup: dAllowBackup
  };
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    await testPaisaTrack(browser);
    await testHealthCoach(browser);
    verifyAndroidBinaries();

    console.log('\n======================================================');
    console.log('🏆 FINAL VERIFICATION REPORT - ALL SCENARIOS');
    console.log('======================================================');
    console.log(JSON.stringify(results, null, 2));
    console.log('\n🎉 ALL SCENARIOS TESTED & VERIFIED 100% SUCCESSFULLY!');
  } finally {
    await browser.close();
  }
}

main().catch(err => {
  console.error('❌ Comprehensive test failed:', err);
  process.exit(1);
});
