# 💰 PaisaTrack - Expenditure & Personal Finance Monitor

> **All-in-one personal finance, expenditure, banks, cards, loans, friend/relative debts monitoring application for Web and all Android mobile screen resolutions.**

Built with **FastAPI**, **SQLite**, **Vanilla CSS & modern JavaScript**, **Progressive Web App (PWA)** architecture, and **Capacitor Android** native readiness.

---

## 🚀 Quick Launch

### 1. Launch Web & Android Server
```bash
cd /home/ranjith/.gemini/antigravity-ide/scratch/expenditure-monitor
python3 run.py
```
- **Web Application URL**: [http://localhost:8000](http://localhost:8000)
- **Interactive Swagger API Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 📱 Android Mobile Compatibility

PaisaTrack is designed from the ground up to support **every Android mobile screen resolution** (320px compact, 360x640, 390x844, 412x915 Samsung Galaxy/Pixel, foldables, and tablets):

1. **Native-feeling Mobile App Shell**:
   - Bottom navigation bar: `Home`, `History`, `(+) Quick FAB`, `Rollover`, `Reports`.
   - Slide-out mobile navigation drawer with access to all 7 financial centers.
   - Notch and safe-area inset handling (`env(safe-area-inset-bottom)`).
   - Haptic vibration feedback on tap.
   - Touch targets $\ge 48\text{px}$.

2. **1-Tap PWA Installation**:
   - Open [http://localhost:8000](http://localhost:8000) in Chrome on your Android mobile.
   - Tap **"Add to Home Screen"** or **"Install App"** to run standalone full-screen without URL bars.

3. **Capacitor Native Android APK**:
   ```bash
   npm run cap:add   # Adds Android native platform
   npm run cap:sync  # Syncs web assets to native Android project
   npm run cap:open  # Opens project in Android Studio to build .apk
   ```

---

## 🌟 Key Features

### 1. Expenditure & Income Monitoring
- Categorize spending into Groceries, Food/Dining, Rent, Utilities, Fuel/Travel, Shopping, Medical, Entertainment, and custom categories.
- Record income from Salary, Consulting/Freelance, Investments, Rental, and Debt returns.
- Filter by date range, category, bank account, payment mode (UPI, NetBanking, Card, Cash).
- Full manual **Add, Edit/Modify, and Delete** with automatic balance rollback.

### 2. Banks & Cards
- **Multiple Bank Accounts**: HDFC Salary, SBI Savings, ICICI Emergency, and Cash wallets with real-time balances.
- **Inter-Account Transfers**: 1-click transfer between bank accounts.
- **Credit & Debit Cards**: Track total limits, available limits, utilization %, billing cycles, due dates, and 1-click bill payments.

### 3. Loans & EMI Schedules
- Home Loans, Car Loans, Personal Loans, Education Loans.
- Track principal amount, current remaining balance, interest rate, monthly EMI, and due day.
- **1-Click EMI Payment**: Deducts from bank, reduces loan balance, and records transaction.

### 4. Friends & Relatives Borrows (Debts)
- **Borrowed from** (Payable - money you owe): Track person, relationship, amount, due date, partial repayments.
- **Lent to** (Receivable - money friends/relatives owe you): Track repayments collected.
- **1-Click Settlement / Repay Flow**: Settle full or partial amounts via UPI/Cash/Bank transfer.

### 5. Month-End Carry Forward System
- Automatic & transparent rollover:
  $$\text{Closing Balance} = \text{Opening Balance} + \text{Incomes} - \text{Expenses} - \text{Loan EMIs} - \text{Debts Repaid}$$
- **Rollover Center**: Carries forward net surplus into the next month's starting ledger.
- Historical Month-End Ledger tracking every month's opening, inflow, outflow, and carried-over balance.

### 6. Month-Wise & Day-Wise Reports & Charts
- **Month-Wise Report**:
  - Inflow vs Outflow KPI cards and Savings Rate %.
  - Donut Chart of Category Distribution.
  - 6-Month Income vs Expense comparison trend bars.
  - Category budget utilization table.
- **Day-Wise Report**:
  - Average daily spend rate.
  - **Peak Spending Day Identification** (highlighted in golden amber).
  - Day-by-day expenditure timeline bar chart across all days of the month.
  - Itemized daily ledger.
  - Export data to **CSV** or **JSON**.

### 7. Primary Indian Currency & Multi-Currency Switcher
- **Default Currency**: **Indian Rupee (₹ INR)** with standard Indian numbering format (Lakhs & Crores e.g., `₹ 1,50,000.00`).
- **Optional Currencies**: Instant switch to USD ($), EUR (€), GBP (£), AED (د.إ), SGD (S$), CAD ($), AUD ($). All values update in real time across all views!

---

## 🧪 Testing & Verification

### Automated Backend Tests (Pytest)
```bash
./venv/bin/pytest tests/ -v
```
*11 test cases validating transactions CRUD, account transfers, credit card payments, loan EMIs, borrow repayments, carry forward calculations, month-wise and day-wise reporting aggregations, and currency switches.*

### End-to-End Browser & Mobile Verification (Puppeteer)
```bash
node verify_app.mjs
```
*Tests Desktop Viewport (1440x900), Android Mobile Viewport (412x915), modal interactions, currency switcher, and captures high-resolution screenshots.*
