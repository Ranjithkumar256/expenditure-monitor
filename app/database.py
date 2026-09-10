"""
Database module for PaisaTrack - SQLite initialization, migrations, connection management,
and Multi-Profile data isolation.
"""
import os
import sqlite3
from contextlib import contextmanager
from typing import Generator

from app.security import hash_password

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "finance.db"))

@contextmanager
def get_db_connection() -> Generator[sqlite3.Connection, None, None]:
    """Context manager for SQLite database connection with row factory and foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH, timeout=20.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()

def _ensure_column_exists(cursor: sqlite3.Cursor, table_name: str, column_name: str, column_def: str) -> None:
    """Helper to ensure a column exists on an existing SQLite table, adding it if missing."""
    cursor.execute(f"PRAGMA table_info({table_name});")
    columns = [row["name"] for row in cursor.fetchall()]
    if column_name not in columns:
        cursor.execute(f"ALTER TABLE {table_name} ADD COLUMN {column_name} {column_def};")

def init_db() -> None:
    """Initialize database tables with complete schemas and multi-profile support."""
    with get_db_connection() as conn:
        cursor = conn.cursor()

        # -1. Users Table (Authentication & Multi-Tenant Data Isolation)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            password_salt TEXT NOT NULL,
            full_name TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # -1.1 User Sessions Table
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS user_sessions (
            token TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            expires_at TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)

        # Seed Default Demo User if none exists
        cursor.execute("SELECT COUNT(*) as count FROM users")
        if cursor.fetchone()["count"] == 0:
            demo_hash, demo_salt = hash_password("demo123")
            cursor.execute("""
            INSERT INTO users (id, username, email, password_hash, password_salt, full_name)
            VALUES (1, 'demo', 'demo@paisatrack.com', ?, ?, 'Demo User')
            """, (demo_hash, demo_salt))

            # Seed default demo session token
            cursor.execute("""
            INSERT OR REPLACE INTO user_sessions (token, user_id, expires_at)
            VALUES ('demo-session-token-999', 1, datetime('now', '+365 days'))
            """)

        # 0. Profiles Table (Multi-Profile financial isolation)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            description TEXT DEFAULT '',
            color TEXT DEFAULT '#4f46e5',
            icon TEXT DEFAULT 'user',
            currency TEXT DEFAULT 'INR',
            is_default INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """)

        _ensure_column_exists(cursor, "profiles", "user_id", "INTEGER DEFAULT 1")
        cursor.execute("UPDATE profiles SET user_id = 1 WHERE user_id IS NULL OR user_id = 0")

        # Seed Default Profiles if none exist
        cursor.execute("SELECT COUNT(*) as count FROM profiles")
        if cursor.fetchone()["count"] == 0:
            cursor.execute("""
            INSERT INTO profiles (user_id, name, description, color, icon, currency, is_default) VALUES
                (1, 'Personal Finances', 'Household, salary, family expenses and savings', '#4f46e5', 'user', 'INR', 1),
                (1, 'Business & Consulting', 'Freelance, office expenses, client receivables', '#10b981', 'briefcase', 'INR', 0);
            """)

        # 1. Accounts (Banks, Cash, Wallets)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            type TEXT NOT NULL DEFAULT 'bank', -- 'bank', 'cash', 'wallet', 'savings'
            institution_name TEXT,             -- e.g. 'HDFC Bank', 'State Bank of India'
            account_number_mask TEXT,          -- e.g. '•••• 4321'
            balance REAL NOT NULL DEFAULT 0.0,
            currency TEXT NOT NULL DEFAULT 'INR',
            color TEXT DEFAULT '#2563eb',
            is_active INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );
        """)

        # 2. Cards (Credit & Debit, Primary & Add-on / Shared Limit)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS cards (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL DEFAULT 1,
            account_id INTEGER,
            parent_card_id INTEGER DEFAULT NULL, -- Linked primary card if this is an Add-on card
            is_addon INTEGER DEFAULT 0,          -- 0 = Primary/Independent, 1 = Add-on / Supplementary
            sub_limit REAL DEFAULT 0.0,          -- Optional monthly spend cap for add-on card
            card_name TEXT NOT NULL,             -- e.g. 'HDFC Regalia Gold', 'ICICI Amazon Pay'
            card_type TEXT NOT NULL DEFAULT 'credit', -- 'credit', 'debit'
            card_network TEXT DEFAULT 'visa',    -- 'visa', 'mastercard', 'rupay', 'amex'
            card_last4 TEXT DEFAULT '0000',
            credit_limit REAL DEFAULT 0.0,
            available_limit REAL DEFAULT 0.0,
            billing_start_day INTEGER DEFAULT 24, -- Day of month cycle starts (1-31)
            billing_day INTEGER DEFAULT 22,       -- Day of month statement is generated / cycle ends (1-31)
            due_day INTEGER DEFAULT 11,          -- Day of month payment is due (1-31)
            color TEXT DEFAULT '#4f46e5',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
            FOREIGN KEY (parent_card_id) REFERENCES cards(id) ON DELETE SET NULL
        );
        """)

        # 3. Loans (Home, Car, Personal, Education)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS loans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL DEFAULT 1,
            title TEXT NOT NULL,               -- e.g. 'Car Loan (HDFC)', 'Home Loan (SBI)'
            loan_type TEXT NOT NULL DEFAULT 'personal', -- 'home', 'car', 'personal', 'education', 'gold', 'other'
            lender_name TEXT,
            principal_amount REAL NOT NULL DEFAULT 0.0,
            current_balance REAL NOT NULL DEFAULT 0.0,
            interest_rate REAL DEFAULT 0.0,    -- % per annum
            tenure_months INTEGER DEFAULT 12,
            emi_amount REAL NOT NULL DEFAULT 0.0,
            emi_due_day INTEGER DEFAULT 5,     -- Day of month EMI is deducted
            start_date TEXT,                   -- YYYY-MM-DD
            end_date TEXT,
            notes TEXT,
            status TEXT DEFAULT 'active',      -- 'active', 'closed'
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );
        """)

        # 4. Borrows / Debts (Friends & Relatives)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS borrows_lent (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL DEFAULT 1,
            person_name TEXT NOT NULL,         -- e.g. 'Rajesh (Cousin)', 'Amit (Colleague)'
            relationship TEXT DEFAULT 'friend',-- 'friend', 'relative', 'family', 'colleague', 'other'
            direction TEXT NOT NULL,           -- 'borrowed' (Payable / You owe them), 'lent' (Receivable / They owe you)
            principal_amount REAL NOT NULL DEFAULT 0.0,
            balance_remaining REAL NOT NULL DEFAULT 0.0,
            transaction_date TEXT NOT NULL,    -- YYYY-MM-DD
            due_date TEXT,                     -- YYYY-MM-DD
            account_id INTEGER,                -- Received into (borrowed) or Lent from (lent)
            payment_mode TEXT DEFAULT 'upi',   -- 'upi', 'bank_transfer', 'cash', 'cheque'
            transaction_id INTEGER,            -- Associated transaction in transactions table
            status TEXT NOT NULL DEFAULT 'active', -- 'active', 'settled', 'partial'
            phone TEXT,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
            FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
        );
        """)

        _ensure_column_exists(cursor, "borrows_lent", "account_id", "INTEGER REFERENCES accounts(id) ON DELETE SET NULL")
        _ensure_column_exists(cursor, "borrows_lent", "payment_mode", "TEXT DEFAULT 'upi'")
        _ensure_column_exists(cursor, "borrows_lent", "transaction_id", "INTEGER REFERENCES transactions(id) ON DELETE SET NULL")

        # 5. Borrow Repayment History
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS borrow_payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            borrow_id INTEGER NOT NULL,
            amount REAL NOT NULL,
            payment_date TEXT NOT NULL,
            account_id INTEGER,
            payment_mode TEXT DEFAULT 'upi',   -- 'upi', 'cash', 'bank_transfer'
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (borrow_id) REFERENCES borrows_lent(id) ON DELETE CASCADE,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
        );
        """)

        # 6. Categories (Income & Expense)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            type TEXT NOT NULL,                -- 'expense', 'income'
            icon TEXT DEFAULT 'tag',
            color TEXT DEFAULT '#64748b',
            is_default INTEGER DEFAULT 0,
            budget_limit REAL DEFAULT 0.0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );
        """)

        # 7. Transactions
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,                -- YYYY-MM-DD
            time TEXT DEFAULT '12:00:00',
            type TEXT NOT NULL,                -- 'expense', 'income', 'transfer'
            amount REAL NOT NULL,
            category_id INTEGER,
            account_id INTEGER,                -- Primary / Source Account
            destination_account_id INTEGER,    -- Destination Account for transfers
            card_id INTEGER,                   -- Optional: Used credit/debit card
            loan_id INTEGER,                   -- Optional: Paid towards loan EMI
            borrow_id INTEGER,                 -- Optional: Paid towards friend/relative debt
            payment_mode TEXT DEFAULT 'upi',   -- 'upi', 'card', 'netbanking', 'cash', 'cheque'
            description TEXT,
            tags TEXT,                         -- Comma separated tags e.g. '#dinner,#weekend'
            is_cleared INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
            FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
            FOREIGN KEY (destination_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
            FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE SET NULL,
            FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE SET NULL,
            FOREIGN KEY (borrow_id) REFERENCES borrows_lent(id) ON DELETE SET NULL
        );
        """)

        # 8. Monthly Carryovers (Month-end carry forward engine)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS monthly_carryovers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL DEFAULT 1,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,            -- 1 to 12
            opening_balance REAL NOT NULL DEFAULT 0.0,
            total_income REAL NOT NULL DEFAULT 0.0,
            total_expense REAL NOT NULL DEFAULT 0.0,
            total_loan_emi REAL NOT NULL DEFAULT 0.0,
            total_debt_paid REAL NOT NULL DEFAULT 0.0,
            closing_balance REAL NOT NULL DEFAULT 0.0,
            carried_forward_amount REAL NOT NULL DEFAULT 0.0,
            status TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed', 'carried_forward'
            notes TEXT,
            closed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            UNIQUE(profile_id, year, month)
        );
        """)

        # 9. App & User Settings
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        """)

        # 10. Investments Portfolio (Mutual Funds, Stocks, FDs, Gold, PPF/EPF, Real Estate, Crypto)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS investments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            asset_type TEXT NOT NULL DEFAULT 'mutual_fund', -- 'mutual_fund', 'stocks', 'fixed_deposit', 'gold', 'epf_ppf', 'real_estate', 'crypto', 'other'
            platform TEXT,                                 -- 'Zerodha', 'Groww', 'Kuvera', 'SBI', 'HDFC'
            folio_or_account_number TEXT,
            invested_amount REAL NOT NULL DEFAULT 0.0,
            current_value REAL NOT NULL DEFAULT 0.0,
            allocation_category TEXT DEFAULT 'wealth',     -- 'wealth', 'retirement', 'emergency', 'tax_saving', 'future_goal'
            sip_enabled INTEGER DEFAULT 0,                 -- 1 = Monthly SIP, 0 = Lumpsum
            sip_amount REAL DEFAULT 0.0,
            sip_day INTEGER DEFAULT 5,                     -- Day of month SIP is deducted
            linked_account_id INTEGER,                     -- Bank account linked for SIP
            start_date TEXT,                               -- YYYY-MM-DD
            maturity_date TEXT,                            -- YYYY-MM-DD (FDs, Bonds, PPF)
            status TEXT DEFAULT 'active',                  -- 'active', 'redeemed'
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            FOREIGN KEY (linked_account_id) REFERENCES accounts(id) ON DELETE SET NULL
        );
        """)

        # 11. Salary Plans & Budget Allocation (Needs, Wants, Debts, Savings/Emergency, Investments)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS salary_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL UNIQUE,
            monthly_salary REAL NOT NULL DEFAULT 0.0,
            rule_type TEXT DEFAULT '50_30_20',             -- '50_30_20', '60_20_20', 'debt_focus', 'custom'
            needs_percent REAL DEFAULT 50.0,
            wants_percent REAL DEFAULT 30.0,
            savings_percent REAL DEFAULT 10.0,
            debts_percent REAL DEFAULT 10.0,
            emergency_fund_target_months INTEGER DEFAULT 6,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
        );
        """)

        # 12. Financial Goals Tracker (Emergency Fund, House Down Payment, Car, Vacation, Retirement)
        cursor.execute("""
        CREATE TABLE IF NOT EXISTS financial_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            profile_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT 'wealth',       -- 'emergency_fund', 'home', 'vehicle', 'retirement', 'education', 'vacation', 'wealth'
            target_amount REAL NOT NULL,
            current_amount REAL NOT NULL DEFAULT 0.0,
            target_date TEXT,                              -- YYYY-MM-DD
            monthly_contribution REAL DEFAULT 0.0,
            priority TEXT DEFAULT 'medium',                -- 'high', 'medium', 'low'
            status TEXT DEFAULT 'in_progress',             -- 'in_progress', 'achieved', 'paused'
            linked_investment_id INTEGER,
            linked_account_id INTEGER,
            notes TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE,
            FOREIGN KEY (linked_investment_id) REFERENCES investments(id) ON DELETE SET NULL,
            FOREIGN KEY (linked_account_id) REFERENCES accounts(id) ON DELETE SET NULL
        );
        """)

        # Run safe migrations to add profile_id to existing tables if needed
        for tbl in ["accounts", "cards", "loans", "borrows_lent", "categories", "transactions", "monthly_carryovers", "investments", "salary_plans", "financial_goals"]:
            _ensure_column_exists(cursor, tbl, "profile_id", "INTEGER NOT NULL DEFAULT 1")

        # Run safe migrations for Add-on / Shared Limit Credit Cards & Custom Billing Cycles
        _ensure_column_exists(cursor, "cards", "parent_card_id", "INTEGER DEFAULT NULL")
        _ensure_column_exists(cursor, "cards", "is_addon", "INTEGER DEFAULT 0")
        _ensure_column_exists(cursor, "cards", "sub_limit", "REAL DEFAULT 0.0")
        _ensure_column_exists(cursor, "cards", "billing_start_day", "INTEGER DEFAULT 24")

        # Category classification migration: 'need', 'want', 'debt', 'investment'
        _ensure_column_exists(cursor, "categories", "classification", "TEXT DEFAULT 'need'")

        # Update category classifications for existing records
        cursor.execute("UPDATE categories SET classification = 'want' WHERE name IN ('Food & Dining', 'Shopping & Clothing', 'Entertainment & OTT', 'Client Entertainment', 'Miscellaneous & Others')")
        cursor.execute("UPDATE categories SET classification = 'debt' WHERE name IN ('Loan EMI & Interest', 'Friends & Relatives Debt Pay', 'Money Lent to Friends/Relatives')")
        cursor.execute("UPDATE categories SET classification = 'investment' WHERE name IN ('Investments & Dividends')")

        # Default Settings
        cursor.execute("""
        INSERT OR IGNORE INTO settings (key, value) VALUES
            ('currency_code', 'INR'),
            ('currency_symbol', '₹'),
            ('currency_name', 'Indian Rupee'),
            ('locale', 'en-IN'),
            ('theme', 'dark'),
            ('active_profile_id', '1'),
            ('carryover_mode', 'manual');
        """)

        # Default Categories Seed for Profile 1 and 2
        default_categories = [
            # Expense Categories - Needs
            ('Groceries & Supplies', 'expense', 'shopping-cart', '#10b981', 1, 15000.0, 'need'),
            ('Housing & Rent', 'expense', 'home', '#6366f1', 1, 25000.0, 'need'),
            ('Utilities (Gas, Water, Power)', 'expense', 'zap', '#06b6d4', 1, 6000.0, 'need'),
            ('Transportation & Fuel', 'expense', 'car', '#ec4899', 1, 8000.0, 'need'),
            ('Health & Medical', 'expense', 'heart-pulse', '#ef4444', 1, 5000.0, 'need'),
            ('Education & Courses', 'expense', 'book-open', '#14b8a6', 1, 8000.0, 'need'),
            ('Personal Care & Grooming', 'expense', 'sparkles', '#a855f7', 1, 3000.0, 'need'),
            ('Office & Coworking Rent', 'expense', 'building', '#6366f1', 1, 35000.0, 'need'),
            ('Cloud & Software Subscriptions', 'expense', 'cloud', '#06b6d4', 1, 20000.0, 'need'),
            ('Team Stipends & Wages', 'expense', 'briefcase', '#10b981', 1, 60000.0, 'need'),
            # Expense Categories - Wants
            ('Food & Dining', 'expense', 'utensils', '#f59e0b', 1, 10000.0, 'want'),
            ('Shopping & Clothing', 'expense', 'shopping-bag', '#8b5cf6', 1, 10000.0, 'want'),
            ('Entertainment & OTT', 'expense', 'film', '#3b82f6', 1, 4000.0, 'want'),
            ('Client Entertainment', 'expense', 'coffee', '#f59e0b', 1, 10000.0, 'want'),
            ('Miscellaneous & Others', 'expense', 'tag', '#64748b', 1, 5000.0, 'want'),
            # Expense Categories - Debts
            ('Loan EMI & Interest', 'expense', 'landmark', '#f97316', 1, 15000.0, 'debt'),
            ('Friends & Relatives Debt Pay', 'expense', 'users', '#e11d48', 1, 10000.0, 'debt'),
            ('Money Lent to Friends/Relatives', 'expense', 'users', '#e11d48', 1, 10000.0, 'debt'),
            # Income & Investment Categories
            ('Monthly Salary', 'income', 'briefcase', '#10b981', 1, 0.0, 'need'),
            ('Freelance & Consulting', 'income', 'laptop', '#3b82f6', 1, 0.0, 'need'),
            ('Client Retainers & Projects', 'income', 'award', '#10b981', 1, 0.0, 'need'),
            ('Investments & Dividends', 'income', 'trending-up', '#8b5cf6', 1, 0.0, 'investment'),
            ('Rental Income', 'income', 'key', '#f59e0b', 1, 0.0, 'need'),
            ('Cashbacks & Refunds', 'income', 'gift', '#06b6d4', 1, 0.0, 'need'),
            ('Friend/Relative Repayment', 'income', 'user-check', '#14b8a6', 1, 0.0, 'debt'),
            ('Borrowed from Friends/Relatives', 'income', 'users', '#f59e0b', 1, 0.0, 'debt'),
            ('Other Income', 'income', 'plus-circle', '#64748b', 1, 0.0, 'need')
        ]

        # Ensure categories for profile 1
        for c in default_categories:
            cursor.execute("""
            INSERT OR IGNORE INTO categories (profile_id, name, type, icon, color, is_default, budget_limit, classification)
            SELECT 1, ?, ?, ?, ?, ?, ?, ? WHERE NOT EXISTS (
                SELECT 1 FROM categories WHERE profile_id = 1 AND name = ? AND type = ?
            );
            """, (c[0], c[1], c[2], c[3], c[4], c[5], c[6], c[0], c[1]))

        # Create indexes for blazing-fast queries
        cursor.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_carryover_prof_ym ON monthly_carryovers(profile_id, year, month);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_profile ON transactions(profile_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_date ON transactions(date);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_type ON transactions(type);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_cat ON transactions(category_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_trans_acc ON transactions(account_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_acc_profile ON accounts(profile_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_borrow_profile ON borrows_lent(profile_id, direction, status);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_investments_profile ON investments(profile_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_salary_plans_profile ON salary_plans(profile_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_goals_profile ON financial_goals(profile_id);")

def create_default_user_data(cursor: sqlite3.Cursor, user_id: int, full_name: str) -> int:
    """
    Creates a fresh, default 'Personal Finances' profile, standard accounts,
    and default categories for a newly registered user. Returns the profile_id.
    """
    cursor.execute("""
    INSERT INTO profiles (user_id, name, description, color, icon, currency, is_default)
    VALUES (?, 'Personal Finances', ?, '#4f46e5', 'user', 'INR', 1)
    """, (user_id, f"{full_name}'s household and personal finances"))
    new_profile_id = cursor.lastrowid

    # Starter clean accounts with ₹0 balance
    cursor.execute("""
    INSERT INTO accounts (profile_id, name, type, institution_name, account_number_mask, balance, color) VALUES
        (?, 'Primary Bank Account', 'bank', 'My Bank', '•••• 0000', 0.00, '#004c8f'),
        (?, 'Cash Wallet', 'cash', 'Cash in Hand', 'N/A', 0.00, '#10b981');
    """, (new_profile_id, new_profile_id))

    # Standard starter categories with Need/Want/Debt/Investment classification
    default_cats = [
        ('Groceries & Supplies', 'expense', 'shopping-cart', '#10b981', 1, 15000.0, 'need'),
        ('Food & Dining', 'expense', 'utensils', '#f59e0b', 1, 10000.0, 'want'),
        ('Housing & Rent', 'expense', 'home', '#6366f1', 1, 25000.0, 'need'),
        ('Utilities (Gas, Water, Power)', 'expense', 'zap', '#06b6d4', 1, 6000.0, 'need'),
        ('Transportation & Fuel', 'expense', 'car', '#ec4899', 1, 8000.0, 'need'),
        ('Shopping & Clothing', 'expense', 'shopping-bag', '#8b5cf6', 1, 10000.0, 'want'),
        ('Health & Medical', 'expense', 'heart-pulse', '#ef4444', 1, 5000.0, 'need'),
        ('Entertainment & OTT', 'expense', 'film', '#3b82f6', 1, 4000.0, 'want'),
        ('Education & Courses', 'expense', 'book-open', '#14b8a6', 1, 8000.0, 'need'),
        ('Loan EMI & Interest', 'expense', 'landmark', '#f97316', 1, 15000.0, 'debt'),
        ('Friends & Relatives Debt Pay', 'expense', 'users', '#e11d48', 1, 10000.0, 'debt'),
        ('Money Lent to Friends/Relatives', 'expense', 'users', '#e11d48', 1, 10000.0, 'debt'),
        ('Personal Care & Grooming', 'expense', 'sparkles', '#a855f7', 1, 3000.0, 'need'),
        ('Miscellaneous & Others', 'expense', 'tag', '#64748b', 1, 5000.0, 'want'),
        ('Monthly Salary', 'income', 'briefcase', '#10b981', 1, 0.0, 'need'),
        ('Freelance & Consulting', 'income', 'laptop', '#3b82f6', 1, 0.0, 'need'),
        ('Investments & Dividends', 'income', 'trending-up', '#8b5cf6', 1, 0.0, 'investment'),
        ('Rental Income', 'income', 'key', '#f59e0b', 1, 0.0, 'need'),
        ('Cashbacks & Refunds', 'income', 'gift', '#06b6d4', 1, 0.0, 'need'),
        ('Friend/Relative Repayment', 'income', 'user-check', '#14b8a6', 1, 0.0, 'debt'),
        ('Borrowed from Friends/Relatives', 'income', 'users', '#f59e0b', 1, 0.0, 'debt'),
        ('Other Income', 'income', 'plus-circle', '#64748b', 1, 0.0, 'need')
    ]
    for c in default_cats:
        cursor.execute("""
        INSERT INTO categories (profile_id, name, type, icon, color, is_default, budget_limit, classification)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """, (new_profile_id, c[0], c[1], c[2], c[3], c[4], c[5], c[6]))

    # Starter Salary Plan (50/30/20 standard guideline)
    cursor.execute("""
    INSERT INTO salary_plans (profile_id, monthly_salary, rule_type, needs_percent, wants_percent, savings_percent, debts_percent, emergency_fund_target_months)
    VALUES (?, 75000.0, '50_30_20', 50.0, 30.0, 10.0, 10.0, 6)
    """, (new_profile_id,))

    # Starter Essential Goal: 6-Month Emergency Fund
    cursor.execute("""
    INSERT INTO financial_goals (profile_id, title, category, target_amount, current_amount, monthly_contribution, priority, status)
    VALUES (?, 'Emergency Fund (6 Months)', 'emergency_fund', 200000.0, 0.0, 10000.0, 'high', 'in_progress')
    """, (new_profile_id,))

    return new_profile_id

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully with Multi-Profile support at:", DB_PATH)
