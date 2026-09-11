"""
Realistic Indian seed dataset for PaisaTrack with Multi-Profile support.
Pre-populates Profile 1 (Personal Finances) and Profile 2 (Business & Consulting)
with distinct Banks, Credit Cards, Loans, Friends/Relatives Debts,
Transactions across days, and Month-End Rollovers.
"""
from datetime import datetime, date
from app.database import get_db_connection, init_db

def clear_dummy_data() -> None:
    """
    Clears all dummy financial data (transactions, accounts, cards, loans, debts, carryovers).
    Keeps default categories and initializes clean starter 0-balance accounts
    in Profile 1 so the user can begin logging real finances with a clean slate.
    """
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()
        print("Clearing all dummy financial records for demo user...")
        cursor.execute("DELETE FROM transactions WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM accounts WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM cards WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM loans WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM borrows_lent WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM monthly_carryovers WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM investments WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM financial_goals WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM salary_plans WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")

        # Keep Profile 1
        cursor.execute("SELECT id FROM profiles WHERE id = 1")
        if not cursor.fetchone():
            cursor.execute("""
            INSERT INTO profiles (id, user_id, name, description, color, icon, currency, is_default)
            VALUES (1, 1, 'Personal Finances', 'Personal household, salary, family expenses & savings', '#4f46e5', 'user', 'INR', 1)
            """)

        # Starter clean accounts with ₹0 balance
        cursor.execute("""
        INSERT INTO accounts (id, profile_id, name, type, institution_name, account_number_mask, balance, color) VALUES
            (1, 1, 'Primary Bank Account', 'bank', 'My Bank', '•••• 0000', 0.00, '#004c8f'),
            (2, 1, 'Cash Wallet', 'cash', 'Cash in Hand', 'N/A', 0.00, '#10b981');
        """)

        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_profile_id', '1')")
        print("Dummy financial records removed. Clean slate initialized.")


def seed_database(force_reseed: bool = False) -> None:
    init_db()
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # Check if already seeded
        cursor.execute("SELECT COUNT(*) as count FROM accounts WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        if cursor.fetchone()["count"] > 0 and not force_reseed:
            print("Database already contains financial records. Skipping reseed.")
            return

        print("Seeding fresh multi-profile financial records for demo user...")

        cursor.execute("DELETE FROM transactions WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM accounts WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM cards WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM loans WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM borrows_lent WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM monthly_carryovers WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM investments WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM salary_plans WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")
        cursor.execute("DELETE FROM financial_goals WHERE profile_id IN (SELECT id FROM profiles WHERE user_id = 1)")

        # 0. Ensure 2 Profiles exist
        cursor.execute("SELECT id FROM profiles WHERE id = 1")
        if not cursor.fetchone():
            cursor.execute("""
            INSERT INTO profiles (id, name, description, color, icon, currency, is_default)
            VALUES (1, 'Personal Finances', 'Personal household, salary, family expenses & savings', '#4f46e5', 'user', 'INR', 1)
            """)

        cursor.execute("SELECT id FROM profiles WHERE id = 2")
        if not cursor.fetchone():
            cursor.execute("""
            INSERT INTO profiles (id, name, description, color, icon, currency, is_default)
            VALUES (2, 'Business & Consulting', 'Software agency, office bills, client retainers & invoices', '#10b981', 'briefcase', 'INR', 0)
            """)

        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_profile_id', '1')")

        # ========================================================
        # PROFILE 1: PERSONAL FINANCES
        # ========================================================
        cursor.execute("""
        INSERT INTO accounts (id, profile_id, name, type, institution_name, account_number_mask, balance, color) VALUES
            (1, 1, 'HDFC Salary Account', 'bank', 'HDFC Bank', '•••• 8921', 145000.00, '#004c8f'),
            (2, 1, 'SBI Savings Account', 'savings', 'State Bank of India', '•••• 4321', 48500.00, '#2b78e4'),
            (3, 1, 'ICICI Emergency Fund', 'bank', 'ICICI Bank', '•••• 1109', 85000.00, '#c8102e'),
            (4, 1, 'Cash & Wallet', 'cash', 'Cash in Hand', 'N/A', 6800.00, '#10b981');
        """)

        cursor.execute("""
        INSERT INTO cards (id, profile_id, account_id, parent_card_id, is_addon, sub_limit, card_name, card_type, card_network, card_last4, credit_limit, available_limit, billing_start_day, billing_day, due_day, color) VALUES
            (1, 1, 1, NULL, 0, 0.0, 'HDFC Regalia Gold (Primary)', 'credit', 'visa', '4401', 250000.00, 218450.00, 24, 22, 11, '#1e293b'),
            (2, 1, NULL, NULL, 0, 0.0, 'ICICI Amazon Pay (Standalone)', 'credit', 'visa', '7890', 150000.00, 138200.00, 15, 12, 2, '#d97706'),
            (3, 1, 2, NULL, 0, 0.0, 'SBI RuPay Global Debit', 'debit', 'rupay', '3312', 0.0, 0.0, 1, 1, 1, '#2563eb'),
            (4, 1, 1, 1, 1, 40000.00, 'HDFC Regalia Add-on (Family)', 'credit', 'visa', '8820', 250000.00, 218450.00, 15, 14, 4, '#312e81');
        """)

        cursor.execute("""
        INSERT INTO loans (id, profile_id, title, loan_type, lender_name, principal_amount, current_balance, interest_rate, tenure_months, emi_amount, emi_due_day, start_date, notes) VALUES
            (1, 1, 'HDFC Car Loan (Creta)', 'car', 'HDFC Bank', 650000.00, 385000.00, 8.75, 60, 14250.00, 10, '2024-05-10', 'Auto-debit from HDFC account'),
            (2, 1, 'SBI Home Loan', 'home', 'State Bank of India', 4500000.00, 3820000.00, 8.50, 240, 38900.00, 5, '2023-01-05', 'Joint home loan with tax rebate');
        """)

        cursor.execute("""
        INSERT INTO borrows_lent (id, profile_id, person_name, relationship, direction, principal_amount, balance_remaining, transaction_date, due_date, account_id, payment_mode, status, phone, notes) VALUES
            (1, 1, 'Rajesh (Cousin)', 'relative', 'borrowed', 35000.00, 15000.00, '2026-07-10', '2026-10-15', 1, 'upi', 'partial', '+91 98765 43210', 'Borrowed for emergency repairs, partially repaid ₹20k'),
            (2, 1, 'Uncle Sharma', 'relative', 'borrowed', 20000.00, 20000.00, '2026-08-01', '2026-11-01', 1, 'bank_transfer', 'active', '+91 98111 22334', 'Short-term family loan for festival'),
            (3, 1, 'Amit (Colleague)', 'friend', 'lent', 15000.00, 5000.00, '2026-08-15', '2026-09-30', 2, 'upi', 'partial', '+91 98450 12345', 'Lent for weekend trip, returned ₹10k'),
            (4, 1, 'Pooja (Sister)', 'family', 'lent', 10000.00, 10000.00, '2026-08-25', '2026-10-31', 1, 'upi', 'active', '+91 98999 88776', 'Lent for laptop accessories');
        """)

        # Fetch Category Map
        cursor.execute("SELECT id, name FROM categories WHERE profile_id = 1")
        cat_map = {row["name"]: row["id"] for row in cursor.fetchall()}

        today = date.today()
        curr_year = today.year
        curr_month = today.month
        prev_month = 12 if curr_month == 1 else curr_month - 1
        prev_year = curr_year - 1 if curr_month == 1 else curr_year
        m_str = f"{curr_year:04d}-{curr_month:02d}"

        # Previous month carryover for Profile 1
        prev_date_str = f"{prev_year:04d}-{prev_month:02d}-28"
        cursor.execute("""
        INSERT OR REPLACE INTO monthly_carryovers (
            profile_id, year, month, opening_balance, total_income, total_expense,
            total_loan_emi, total_debt_paid, closing_balance,
            carried_forward_amount, status, notes, closed_at
        ) VALUES (1, ?, ?, 180000.00, 195000.00, 115000.00, 53150.00, 10000.00, 260000.00, 260000.00, 'carried_forward', 'Rolled over to next month successfully', ?)
        """, (prev_year, prev_month, prev_date_str))

        p1_trans = [
            (1, f"{m_str}-01", "09:30:00", "income", 165000.00, cat_map.get("Monthly Salary", 14), 1, None, None, None, None, "netbanking", "Tech Mahindra Monthly Salary Credited", "#salary,#career"),
            (1, f"{m_str}-02", "11:00:00", "expense", 28000.00, cat_map.get("Housing & Rent", 3), 1, None, None, None, None, "netbanking", "Apartment Rent Payment for this month", "#rent,#home"),
            (1, f"{m_str}-03", "18:45:00", "expense", 2850.00, cat_map.get("Groceries & Supplies", 1), 1, None, None, None, None, "upi", "Blinkit Weekly Grocery Order", "#groceries,#vegetables"),
            (1, f"{m_str}-05", "08:00:00", "expense", 38900.00, cat_map.get("Loan EMI & Interest", 10), 2, None, None, 2, None, "netbanking", "SBI Home Loan Monthly EMI Auto-debit", "#emi,#homeloan"),
            (1, f"{m_str}-06", "20:30:00", "expense", 1420.00, cat_map.get("Food & Dining", 2), 1, None, None, None, None, "upi", "Dinner with Family - Swiggy Gourmet", "#food,#dinner"),
            (1, f"{m_str}-08", "10:15:00", "expense", 3500.00, cat_map.get("Transportation & Fuel", 5), 1, None, None, None, None, "upi", "Indian Oil Full Tank Petrol for Creta", "#fuel,#car"),
            (1, f"{m_str}-09", "16:00:00", "expense", 1680.00, cat_map.get("Groceries & Supplies", 1), 1, None, None, None, None, "upi", "Zepto Dairy & Household Goods", "#groceries"),
            (1, f"{m_str}-10", "08:30:00", "expense", 14250.00, cat_map.get("Loan EMI & Interest", 10), 1, None, None, 1, None, "netbanking", "HDFC Car Loan Monthly EMI Auto-debit", "#emi,#carloan"),
            (1, f"{m_str}-11", "14:20:00", "expense", 4850.00, cat_map.get("Utilities (Gas, Water, Power)", 4), 1, None, None, None, None, "upi", "Electricity Bill + Airtel Fiber Broadband", "#bills,#utilities"),
            (1, f"{m_str}-12", "19:00:00", "expense", 10000.00, cat_map.get("Friends & Relatives Debt Pay", 11), 1, None, None, None, 1, "upi", "Repaid partial debt to Cousin Rajesh via GooglePay", "#debtpay,#family"),
            (1, f"{m_str}-13", "15:45:00", "income", 35000.00, cat_map.get("Freelance & Consulting", 15), 1, None, None, None, None, "netbanking", "Client Payment for Mobile App Consultation", "#freelance,#income"),
            (1, f"{m_str}-14", "21:10:00", "expense", 4999.00, cat_map.get("Shopping & Clothing", 6), 1, None, 2, None, None, "card", "Noise Cancelling Headphones - Amazon Pay Card", "#shopping,#gadgets"),
            (1, f"{m_str}-15", "17:30:00", "income", 5000.00, cat_map.get("Friend/Relative Repayment", 19), 1, None, None, None, 3, "upi", "Amit returned partial trip money via PhonePe", "#repayment,#friend"),
            # Credit Card Transactions for Billing Cycles (Primary Card 1 & Add-on Card 4)
            (1, f"{prev_year:04d}-{prev_month:02d}-26", "14:20:00", "expense", 6500.00, cat_map.get("Shopping & Clothing", 6), 1, None, 1, None, None, "card", "Zara Men's Formal Wear - HDFC Regalia Primary", "#shopping,#card"),
            (1, f"{m_str}-04", "16:45:00", "expense", 7700.00, cat_map.get("Shopping & Clothing", 6), 1, None, 1, None, None, "card", "Croma Electronics Gadget - HDFC Regalia Primary", "#gadgets,#card"),
            (1, f"{prev_year:04d}-{prev_month:02d}-20", "11:30:00", "expense", 4200.00, cat_map.get("Groceries & Supplies", 1), 1, None, 4, None, None, "card", "Nature's Basket Gourmet Groceries - Add-on Card", "#groceries,#addon"),
            (1, f"{m_str}-16", "19:15:00", "expense", 3800.00, cat_map.get("Shopping & Clothing", 6), 1, None, 4, None, None, "card", "Decathlon Sports Gear - Add-on Card", "#sports,#addon")
        ]

        cursor.executemany("""
        INSERT INTO transactions (
            profile_id, date, time, type, amount, category_id, account_id, destination_account_id,
            card_id, loan_id, borrow_id, payment_mode, description, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, p1_trans)

        # Profile 1 Investments
        cursor.execute("""
        INSERT INTO investments (id, profile_id, name, asset_type, platform, folio_or_account_number, invested_amount, current_value, sip_enabled, sip_amount, sip_day, linked_account_id, start_date, notes) VALUES
            (1, 1, 'Parag Parikh Flexi Cap Fund', 'mutual_fund', 'Groww', '120485/91', 120000.00, 148500.00, 1, 10000.00, 5, 1, '2023-04-10', 'Long term equity wealth compounding'),
            (2, 1, 'UTI Nifty 50 Index Fund', 'mutual_fund', 'Zerodha Coin', '881920/44', 80000.00, 96000.00, 1, 5000.00, 10, 1, '2023-06-15', 'Low cost passive index fund'),
            (3, 1, 'Tata Motors & Infosys Equity', 'stocks', 'Zerodha Kite', 'DMAT-90124', 65000.00, 78500.00, 0, 0.0, 5, 1, '2023-08-01', 'Direct Indian equities'),
            (4, 1, 'SBI 1-Year Cumulative Fixed Deposit', 'fixed_deposit', 'SBI NetBanking', 'FD-401928', 100000.00, 107100.00, 0, 0.0, 1, 2, '2023-11-01', 'Guaranteed debt return safety'),
            (5, 1, 'Sovereign Gold Bond 2023-24', 'gold', 'RBI Retail Direct', 'SGB-2023-IV', 50000.00, 62400.00, 0, 0.0, 1, 1, '2023-09-20', 'Gold hedge + 2.5% p.a. interest'),
            (6, 1, 'EPF & VPF Retirement Corpus', 'epf_ppf', 'EPFO Portal', 'UAN-10029182', 240000.00, 278000.00, 1, 6000.00, 1, 1, '2022-01-01', 'Provident fund retirement nest egg');
        """)

        # Profile 1 Salary Budget Plan (50/30/20 Rule based on ₹1,25,000 monthly take-home)
        cursor.execute("""
        INSERT OR REPLACE INTO salary_plans (
            profile_id, monthly_salary, rule_type, needs_percent, wants_percent,
            savings_percent, debts_percent, emergency_fund_target_months, notes
        ) VALUES (1, 125000.00, '50_30_20', 50.0, 30.0, 10.0, 10.0, 6, 'Standard disciplined wealth building budget');
        """)

        # Profile 1 Financial Goals
        cursor.execute("""
        INSERT INTO financial_goals (id, profile_id, title, category, target_amount, current_amount, target_date, monthly_contribution, priority, linked_investment_id, linked_account_id, notes) VALUES
            (1, 1, '6-Month Emergency Safety Cushion', 'emergency_fund', 300000.00, 185000.00, '2026-12', 15000.00, 'high', 4, 1, 'Liquid fortress in SBI FD & Savings'),
            (2, 1, 'New Electric Car (Tata Curvv EV)', 'vehicle', 350000.00, 120000.00, '2027-06', 15000.00, 'medium', 1, 1, 'Down payment fund for electric SUV'),
            (3, 1, 'Japan Autumn Vacation with Family', 'vacation', 200000.00, 65000.00, '2027-10', 10000.00, 'low', 2, 1, 'Tokyo & Kyoto 10-day trip');
        """)

        # ========================================================
        # PROFILE 2: BUSINESS & CONSULTING
        # ========================================================
        cursor.execute("""
        INSERT INTO accounts (id, profile_id, name, type, institution_name, account_number_mask, balance, color) VALUES
            (5, 2, 'ICICI Business Current A/c', 'bank', 'ICICI Bank', '•••• 5542', 320000.00, '#0284c7'),
            (6, 2, 'Axis GST & Tax Reserve', 'savings', 'Axis Bank', '•••• 9918', 75000.00, '#7c3aed'),
            (7, 2, 'Office Petty Cash', 'cash', 'Office Locker', 'N/A', 12500.00, '#10b981');
        """)

        cursor.execute("""
        INSERT INTO cards (id, profile_id, account_id, card_name, card_type, card_network, card_last4, credit_limit, available_limit, billing_start_day, billing_day, due_day, color) VALUES
            (5, 2, 5, 'HDFC Corporate Commercial Card', 'credit', 'mastercard', '9012', 500000.00, 465000.00, 20, 18, 8, '#0f172a');
        """)

        cursor.execute("""
        INSERT INTO loans (id, profile_id, title, loan_type, lender_name, principal_amount, current_balance, interest_rate, tenure_months, emi_amount, emi_due_day, start_date, notes) VALUES
            (3, 2, 'MSME Server & Hardware Loan', 'personal', 'SIDBI Bank', 800000.00, 480000.00, 9.25, 48, 18500.00, 7, '2024-01-15', 'Subsidized MSME hardware loan');
        """)

        cursor.execute("""
        INSERT INTO borrows_lent (id, profile_id, person_name, relationship, direction, principal_amount, balance_remaining, transaction_date, due_date, account_id, payment_mode, status, phone, notes) VALUES
            (5, 2, 'Sharma Tech Vendors', 'colleague', 'borrowed', 50000.00, 50000.00, '2026-08-20', '2026-10-15', 5, 'bank_transfer', 'active', '+91 99880 11223', 'Advance credit for cloud licenses'),
            (6, 2, 'Nexus Infotech Client', 'colleague', 'lent', 65000.00, 65000.00, '2026-08-25', '2026-09-30', 5, 'bank_transfer', 'active', '+91 99112 33445', 'Pending milestone invoice receivable');
        """)

        # Previous month carryover for Profile 2
        cursor.execute("""
        INSERT OR REPLACE INTO monthly_carryovers (
            profile_id, year, month, opening_balance, total_income, total_expense,
            total_loan_emi, total_debt_paid, closing_balance,
            carried_forward_amount, status, notes, closed_at
        ) VALUES (2, ?, ?, 240000.00, 310000.00, 195000.00, 18500.00, 0.0, 355000.00, 355000.00, 'carried_forward', 'Business surplus rolled over', ?)
        """, (prev_year, prev_month, prev_date_str))

        p2_trans = [
            (2, f"{m_str}-02", "10:00:00", "income", 225000.00, cat_map.get("Freelance & Consulting", 15), 5, None, None, None, None, "netbanking", "Fintech SaaS Client Monthly Retainer Received", "#retainer,#client"),
            (2, f"{m_str}-03", "12:30:00", "expense", 35000.00, cat_map.get("Housing & Rent", 3), 5, None, None, None, None, "netbanking", "WeWork 4-Desk Dedicated Office Suite Rent", "#office,#wework"),
            (2, f"{m_str}-05", "15:00:00", "expense", 14800.00, cat_map.get("Utilities (Gas, Water, Power)", 4), 5, None, 5, None, None, "card", "AWS Cloud Infrastructure & Database Hosting", "#aws,#cloud"),
            (2, f"{m_str}-07", "09:00:00", "expense", 18500.00, cat_map.get("Loan EMI & Interest", 10), 5, None, None, 3, None, "netbanking", "MSME Hardware Loan Monthly EMI", "#emi,#businessloan"),
            (2, f"{m_str}-08", "16:40:00", "expense", 60000.00, cat_map.get("Freelance & Consulting", 15), 5, None, None, None, None, "netbanking", "Junior Developers & UI Contractor Monthly Stipends", "#team,#payroll"),
            (2, f"{m_str}-11", "13:20:00", "expense", 3200.00, cat_map.get("Food & Dining", 2), 7, None, None, None, None, "cash", "Client Business Lunch & Refreshments", "#client,#lunch"),
            (2, f"{m_str}-14", "11:15:00", "income", 85000.00, cat_map.get("Freelance & Consulting", 15), 5, None, None, None, None, "netbanking", "E-commerce Website Milestone 2 Delivery Credit", "#client,#project")
        ]

        cursor.executemany("""
        INSERT INTO transactions (
            profile_id, date, time, type, amount, category_id, account_id, destination_account_id,
            card_id, loan_id, borrow_id, payment_mode, description, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, p2_trans)

        print("Seeded Multi-Profile financial datasets successfully!")

if __name__ == "__main__":
    seed_database(force_reseed=True)
