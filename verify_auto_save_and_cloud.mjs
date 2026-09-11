import puppeteer from 'puppeteer';

async function testPaisaTrack(browser) {
  console.log('\n--- Testing PaisaTrack (http://localhost:8000) ---');
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });

  // 1. Direct REST API test
  const postRes = await page.evaluate(async () => {
    const res = await fetch('http://localhost:8000/api/cloud-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'PaisaTrack',
        package_id: 'com.paisatrack.app',
        data: { test_key: 'test_val' }
      })
    });
    return { ok: res.ok, status: res.status, json: await res.json() };
  });
  console.log('REST POST /api/cloud-backup:', postRes);
  if (!postRes.ok) throw new Error('POST /api/cloud-backup failed');

  const getRes = await page.evaluate(async () => {
    const res = await fetch('http://localhost:8000/api/cloud-backup');
    return { ok: res.ok, status: res.status, json: await res.json() };
  });
  console.log('REST GET /api/cloud-backup:', getRes.ok ? 'SUCCESS' : 'FAILED');
  if (!getRes.ok || getRes.json.app !== 'PaisaTrack') throw new Error('GET /api/cloud-backup failed');

  // 2. UI Test

  // Check terms modal accept
  const termsModal = await page.$('#modalTermsConsent');
  if (termsModal) {
    const isVisible = await page.evaluate(el => el && el.style.display !== 'none', termsModal);
    if (isVisible) {
      await page.click('#termsAgreeCheckbox');
      await page.click('#btnAcceptTerms');
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Navigate to Settings
  await page.evaluate(() => {
    window.location.hash = '#settings';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await new Promise(r => setTimeout(r, 600));

  // Verify Auto-Save Badge in Settings
  const badgeText = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('.badge-emerald'));
    return badges.map(b => b.textContent).find(t => t.includes('Auto-Save Active'));
  });
  console.log('Auto-Save Badge Text:', badgeText);
  if (!badgeText) throw new Error('Auto-Save Active badge not found in Settings');

  // Verify Cloud Config Modal
  await page.evaluate(() => {
    document.getElementById('btnOpenCloudConfig')?.click();
  });
  await new Promise(r => setTimeout(r, 300));

  await page.evaluate(() => {
    const mode = document.getElementById('cloudConfigMode');
    mode.value = 'custom';
    mode.dispatchEvent(new Event('change'));
    document.getElementById('btnUseCurrentServerUrl')?.click();
  });

  const customUrl = await page.$eval('#cloudConfigUrl', el => el.value);
  console.log('Populated Cloud URL:', customUrl);
  if (!customUrl.includes('/api/cloud-backup')) throw new Error('Quick fill URL failed');

  // Verify localStorage interceptor triggers auto-save
  const autoSaveTriggered = await page.evaluate(() => {
    let triggered = false;
    const oldTrigger = window.BackupManager.triggerAutoSave;
    window.BackupManager.triggerAutoSave = function() {
      triggered = true;
      oldTrigger.apply(this, arguments);
    };
    localStorage.setItem('paisa_test_autosave', JSON.stringify({ ts: Date.now() }));
    return triggered;
  });
  console.log('localStorage.setItem Interceptor Triggered AutoSave:', autoSaveTriggered);
  if (!autoSaveTriggered) throw new Error('Auto-save interceptor was not called on localStorage.setItem');

  await page.close();
  console.log('✅ PaisaTrack Verified Successfully!');
}

async function testHealthCoach(browser) {
  console.log('\n--- Testing Daily Health Coach (http://localhost:8001) ---');
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:8001', { waitUntil: 'networkidle0' });

  // 1. Direct REST API test
  const postRes = await page.evaluate(async () => {
    const res = await fetch('http://localhost:8001/api/cloud-backup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app: 'DailyHealthCoach',
        package_id: 'com.dailyhealthcoach.app',
        data: { dhc_water_logs_v1: [1, 2, 3] }
      })
    });
    return { ok: res.ok, status: res.status, json: await res.json() };
  });
  console.log('REST POST /api/cloud-backup:', postRes);
  if (!postRes.ok) throw new Error('POST /api/cloud-backup failed');

  const getRes = await page.evaluate(async () => {
    const res = await fetch('http://localhost:8001/api/cloud-backup');
    return { ok: res.ok, status: res.status, json: await res.json() };
  });
  console.log('REST GET /api/cloud-backup:', getRes.ok ? 'SUCCESS' : 'FAILED');
  if (!getRes.ok || getRes.json.app !== 'DailyHealthCoach') throw new Error('GET /api/cloud-backup failed');

  // 2. UI Test

  // Terms modal
  const termsModal = await page.$('#modalTermsConsent');
  if (termsModal) {
    const isVisible = await page.evaluate(el => el && el.style.display !== 'none', termsModal);
    if (isVisible) {
      await page.click('#termsAgreeCheckbox');
      await page.click('#btnAcceptTerms');
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Open Backup Modal
  await page.evaluate(() => {
    window.BackupManager?.openBackupModal();
  });
  await new Promise(r => setTimeout(r, 400));

  // Verify Auto-Save Badge
  const badgeText = await page.evaluate(() => {
    const badges = Array.from(document.querySelectorAll('.badge-emerald'));
    return badges.map(b => b.textContent).find(t => t.includes('Auto-Save Active'));
  });
  console.log('Auto-Save Badge Text:', badgeText);
  if (!badgeText) throw new Error('Auto-Save Active badge not found in Daily Health Coach');

  // Verify Cloud Config Modal
  await page.evaluate(() => {
    document.getElementById('btnOpenCloudConfig')?.click();
  });
  await new Promise(r => setTimeout(r, 300));

  await page.evaluate(() => {
    const mode = document.getElementById('cloudConfigMode');
    mode.value = 'custom';
    mode.dispatchEvent(new Event('change'));
    document.getElementById('btnUseCurrentServerUrl')?.click();
  });

  const customUrl = await page.$eval('#cloudConfigUrl', el => el.value);
  console.log('Populated Cloud URL:', customUrl);
  if (!customUrl.includes('/api/cloud-backup')) throw new Error('Quick fill URL failed');

  // Verify localStorage interceptor
  const autoSaveTriggered = await page.evaluate(() => {
    let triggered = false;
    const oldTrigger = window.BackupManager.triggerAutoSave;
    window.BackupManager.triggerAutoSave = function() {
      triggered = true;
      oldTrigger.apply(this, arguments);
    };
    localStorage.setItem('dhc_test_autosave', JSON.stringify({ ts: Date.now() }));
    return triggered;
  });
  console.log('localStorage.setItem Interceptor Triggered AutoSave:', autoSaveTriggered);
  if (!autoSaveTriggered) throw new Error('Auto-save interceptor was not called on localStorage.setItem');

  await page.close();
  console.log('✅ Daily Health Coach Verified Successfully!');
}

async function run() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    await testPaisaTrack(browser);
    await testHealthCoach(browser);
    console.log('\n🎉 ALL AUTO-SAVE AND CLOUD BACKUP TESTS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
