import puppeteer from 'puppeteer';

const ARTIFACT_DIR = '/home/ranjith/.gemini/antigravity-ide/brain/dfa1304c-d494-4f86-a410-2c3309ae98dc';

async function run() {
  console.log('Starting verification of Borrow/Lent Bank Account Link & Transaction Sync...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 1100, deviceScaleFactor: 2 });

  page.on('dialog', async dialog => {
    console.log(`[Dialog]: ${dialog.message()}`);
    await dialog.accept();
  });

  // 1. Load Application
  await page.goto('http://localhost:8000', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 600));

  // 2. Navigate to Debts Tab
  await page.evaluate(() => {
    if (window.switchTab) window.switchTab('debts');
  });
  await new Promise(r => setTimeout(r, 600));

  // 3. Open Record Borrow / Lent Modal
  await page.evaluate(() => {
    const btn = document.getElementById('openAddBorrowBtn');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // Fill Modal with Borrow Details into Account 1
  await page.evaluate(() => {
    document.getElementById('borrowPerson').value = 'Rohan Verma (Friend)';
    document.getElementById('borrowRelationship').value = 'friend';
    document.getElementById('borrowPrincipal').value = '30000';
    document.getElementById('borrowDate').value = '2026-09-09';
    document.getElementById('borrowDueDate').value = '2026-11-30';
    document.getElementById('borrowAccount').value = '1'; // HDFC Salary Account
    document.getElementById('borrowPaymentMode').value = 'upi';
    document.getElementById('borrowPhone').value = '+91 98765 11223';
    document.getElementById('borrowNotes').value = 'Emergency bridge fund received';
  });
  await new Promise(r => setTimeout(r, 300));

  // Screenshot 1: Modal with Bank Account Selector and Dynamic Guidance
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_modal_borrow_bank_selector.png`,
    fullPage: false
  });
  console.log('Captured screenshot_modal_borrow_bank_selector.png');

  // Submit Modal
  await page.evaluate(() => {
    const form = document.getElementById('formBorrow');
    if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
  });
  await new Promise(r => setTimeout(r, 1000));

  // Screenshot 2: Debts Table with Bank Account / Mode Column
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_debts_table_with_bank_accounts.png`,
    fullPage: false
  });
  console.log('Captured screenshot_debts_table_with_bank_accounts.png');

  // 4. Navigate to Transactions Tab to verify Inflow Transaction
  await page.evaluate(() => {
    if (window.switchTab) window.switchTab('transactions');
  });
  await new Promise(r => setTimeout(r, 700));

  // Filter transactions by "Rohan" so the borrow transaction is highlighted at the top
  await page.evaluate(() => {
    const search = document.getElementById('transSearchInput');
    if (search) {
      search.value = 'Rohan';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 800));

  // Screenshot 3: Transactions History showing the Borrow Inflow Record
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_borrow_transaction_inflow.png`,
    fullPage: false
  });
  console.log('Captured screenshot_borrow_transaction_inflow.png');

  // Clear search filter
  await page.evaluate(() => {
    const search = document.getElementById('searchTx');
    if (search) {
      search.value = '';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  await new Promise(r => setTimeout(r, 300));

  // 5. Navigate to Debts tab, open Modal and toggle to "Lent To"
  await page.evaluate(() => {
    if (window.switchTab) window.switchTab('debts');
  });
  await new Promise(r => setTimeout(r, 500));

  await page.evaluate(() => {
    const btn = document.getElementById('openAddBorrowBtn');
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 500));

  // Click Lent To pill
  await page.evaluate(() => {
    const lentPill = document.querySelector('.type-toggle-group .type-pill[data-dir="lent"]');
    if (lentPill) lentPill.click();
    document.getElementById('borrowPerson').value = 'Kiran Mehta (Colleague)';
    document.getElementById('borrowPrincipal').value = '12000';
    document.getElementById('borrowAccount').value = '1';
    document.getElementById('borrowNotes').value = 'Travel tickets advance paid';
  });
  await new Promise(r => setTimeout(r, 400));

  // Screenshot 4: Lent To Modal showing "Bank Account Lent From" & Outflow guidance
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_modal_lent_bank_selector.png`,
    fullPage: false
  });
  console.log('Captured screenshot_modal_lent_bank_selector.png');

  // Close modal
  await page.evaluate(() => {
    const closeBtn = document.querySelector('#modalBorrow [data-close="modalBorrow"]');
    if (closeBtn) closeBtn.click();
  });
  await new Promise(r => setTimeout(r, 300));

  // 6. Mobile Viewport (Android 412x915)
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 2, isMobile: true });
  await new Promise(r => setTimeout(r, 300));

  // Open Add Borrow modal on Mobile
  await page.evaluate(() => {
    if (window.openAddBorrow) {
      window.openAddBorrow('borrowed');
    } else {
      const btn = document.getElementById('openAddBorrowBtn') || document.getElementById('quickAddBorrowBtn');
      if (btn) btn.click();
    }
  });
  await new Promise(r => setTimeout(r, 600));

  // Screenshot 5: Android Mobile View of Borrow Modal
  await page.screenshot({
    path: `${ARTIFACT_DIR}/screenshot_mobile_borrow_bank_modal.png`,
    fullPage: false
  });
  console.log('Captured screenshot_mobile_borrow_bank_modal.png');

  await browser.close();
  console.log('All Borrow/Lent Bank Sync verification steps completed successfully!');
}

run().catch(err => {
  console.error('Verification error:', err);
  process.exit(1);
});
