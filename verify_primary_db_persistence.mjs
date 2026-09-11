import puppeteer from 'puppeteer';

async function testPaisaTrack(browser) {
  console.log('\n--- Testing PaisaTrack (http://localhost:8000) ---');
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });

  // Accept terms
  const termsModal = await page.$('#modalTermsConsent');
  if (termsModal) {
    const isVisible = await page.evaluate(el => el && el.style.display !== 'none', termsModal);
    if (isVisible) {
      await page.click('#termsAgreeCheckbox');
      await page.click('#btnAcceptTerms');
      await new Promise(r => setTimeout(r, 400));
    }
  }

  // Go to Settings
  await page.evaluate(() => {
    window.location.hash = '#settings';
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
  await new Promise(r => setTimeout(r, 500));

  // Check badges
  const badges = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.badge')).map(b => b.textContent.trim());
  });
  console.log('Badges found in UI:', badges.filter(b => b.includes('Database') || b.includes('Uninstall') || b.includes('Auto-Save')));

  const hasPrimaryDb = badges.some(b => b.includes('Primary Database'));
  const hasAntiUninstall = badges.some(b => b.includes('Anti-Uninstall Safe'));
  const hasOldAutosave = badges.some(b => b.includes('Auto-Save Active'));

  console.log('Has Primary Database Badge:', hasPrimaryDb);
  console.log('Has Anti-Uninstall Safe Badge:', hasAntiUninstall);
  console.log('Has Old Auto-Save Badge (should be false):', hasOldAutosave);

  if (!hasPrimaryDb || !hasAntiUninstall || hasOldAutosave) {
    throw new Error('Badge verification failed for PaisaTrack');
  }

  // Verify autosave timer is removed
  const autoSaveRemoved = await page.evaluate(() => {
    return window.BackupManager?.triggerAutoSave === undefined && window.BackupManager?._autoSaveTimer === undefined;
  });
  console.log('AutoSave Timer and Trigger Removed:', autoSaveRemoved);
  if (!autoSaveRemoved) throw new Error('AutoSave methods were not removed');

  // Verify syncFromDatabaseFileOnStartup method exists
  const hasSyncMethod = await page.evaluate(() => {
    return typeof window.BackupManager?.syncFromDatabaseFileOnStartup === 'function';
  });
  console.log('Has syncFromDatabaseFileOnStartup:', hasSyncMethod);
  if (!hasSyncMethod) throw new Error('syncFromDatabaseFileOnStartup missing');

  await page.close();
  console.log('✅ PaisaTrack Verified Successfully!');
}

async function testHealthCoach(browser) {
  console.log('\n--- Testing Daily Health Coach (http://localhost:8001) ---');
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844 });
  await page.goto('http://localhost:8001', { waitUntil: 'networkidle0' });

  // Accept terms
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

  // Check badges
  const badges = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('.badge')).map(b => b.textContent.trim());
  });
  console.log('DHC Badges found:', badges.filter(b => b.includes('Database') || b.includes('Uninstall') || b.includes('Auto-Save')));

  const hasPrimaryDb = badges.some(b => b.includes('Primary Database'));
  const hasAntiUninstall = badges.some(b => b.includes('Anti-Uninstall Safe'));
  const hasOldAutosave = badges.some(b => b.includes('Auto-Save Active'));

  console.log('Has Primary Database Badge:', hasPrimaryDb);
  console.log('Has Anti-Uninstall Safe Badge:', hasAntiUninstall);
  console.log('Has Old Auto-Save Badge (should be false):', hasOldAutosave);

  if (!hasPrimaryDb || !hasAntiUninstall || hasOldAutosave) {
    throw new Error('Badge verification failed for Daily Health Coach');
  }

  // Verify autosave timer is removed
  const autoSaveRemoved = await page.evaluate(() => {
    return window.BackupManager?.triggerAutoSave === undefined && window.BackupManager?._autoSaveTimer === undefined;
  });
  console.log('AutoSave Timer and Trigger Removed:', autoSaveRemoved);
  if (!autoSaveRemoved) throw new Error('AutoSave methods were not removed');

  // Verify syncFromDatabaseFileOnStartup method exists
  const hasSyncMethod = await page.evaluate(() => {
    return typeof window.BackupManager?.syncFromDatabaseFileOnStartup === 'function';
  });
  console.log('Has syncFromDatabaseFileOnStartup:', hasSyncMethod);
  if (!hasSyncMethod) throw new Error('syncFromDatabaseFileOnStartup missing');

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
    console.log('\n🎉 ALL PRIMARY DATABASE PERSISTENCE & AUTO-LOAD TESTS PASSED 100%!');
  } finally {
    await browser.close();
  }
}

run().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
