"""
PaisaTrack - FastAPI Application Main Entrypoint with Multi-Profile Architecture.
Provides RESTful APIs for Profiles, Transactions, Accounts, Cards, Loans,
Friend/Relative Debts, Month-end Carry Forward, Reports, and Settings.
"""
import os
import calendar
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException, Query, Header, Response, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse

from app.database import init_db, get_db_connection, create_default_user_data
from app.models import (
    UserRegister, UserLogin, UserResponse, AuthResponse,
    ProfileCreate, ProfileUpdate,
    TransactionCreate, TransactionUpdate,
    AccountCreate, AccountUpdate, AccountTransferRequest,
    CardCreate, CardUpdate, CardPaymentRequest,
    LoanCreate, LoanUpdate, LoanEMIPaymentRequest,
    BorrowCreate, BorrowUpdate, BorrowRepaymentRequest,
    CategoryCreate, CategoryUpdate,
    CarryoverExecuteRequest, SettingsUpdate
)
from app.calculations import (
    CURRENCY_RATES, format_inr_currency,
    apply_transaction_balance,
    calculate_month_carryover, execute_month_carryover,
    get_month_wise_report, get_day_wise_report
)
from app.seed_data import seed_database, clear_dummy_data
from app.security import hash_password, verify_password, generate_session_token

# Initialize database on startup
init_db()
seed_database(force_reseed=False)

app = FastAPI(
    title="PaisaTrack API",
    description="Expenditure & Personal Finance Monitoring API with Multi-Profile Support for Web & Android",
    version="1.2.0"
)

# Cache-Control Middleware: Never cache /api/ responses in browser cache
@app.middleware("http")
async def add_security_and_cache_headers(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0, private"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
    return response

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Validates Bearer token from Authorization header against user_sessions table.
    If no authorization header is provided, defaults to User 1 (Demo User)
    for seamless backward compatibility with automated tests and legacy calls.
    """
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if authorization and authorization.startswith("Bearer "):
            token = authorization.split("Bearer ", 1)[1].strip()
            cursor.execute("""
            SELECT u.id, u.username, u.email, u.full_name, u.created_at
            FROM user_sessions s
            JOIN users u ON s.user_id = u.id
            WHERE s.token = ? AND (s.expires_at IS NULL OR s.expires_at > CURRENT_TIMESTAMP)
            """, (token,))
            row = cursor.fetchone()
            if row:
                return dict(row)
            raise HTTPException(status_code=401, detail="Invalid or expired authentication session")

        # Fallback to demo user (id 1) if no Authorization header is provided
        cursor.execute("SELECT id, username, email, full_name, created_at FROM users WHERE id = 1")
        demo = cursor.fetchone()
        if demo:
            return dict(demo)

        cursor.execute("SELECT id, username, email, full_name, created_at FROM users ORDER BY id ASC LIMIT 1")
        first = cursor.fetchone()
        if first:
            return dict(first)
        raise HTTPException(status_code=401, detail="Authentication required")

def resolve_profile_id(cursor, profile_id_query: Optional[int] = None, x_profile_id: Optional[str] = None, user_id: Optional[int] = None) -> int:
    """Resolves active profile ID from query param, header, or stored setting, strictly scoped to user_id."""
    if user_id:
        if profile_id_query:
            cursor.execute("SELECT id FROM profiles WHERE id = ? AND user_id = ?", (profile_id_query, user_id))
            row = cursor.fetchone()
            if row:
                return row["id"]
        if x_profile_id and x_profile_id.isdigit():
            cursor.execute("SELECT id FROM profiles WHERE id = ? AND user_id = ?", (int(x_profile_id), user_id))
            row = cursor.fetchone()
            if row:
                return row["id"]

        cursor.execute("SELECT id FROM profiles WHERE user_id = ? ORDER BY is_default DESC, id ASC LIMIT 1", (user_id,))
        row = cursor.fetchone()
        if row:
            return row["id"]

        cursor.execute("SELECT full_name FROM users WHERE id = ?", (user_id,))
        u_row = cursor.fetchone()
        name = u_row["full_name"] if u_row else "User"
        return create_default_user_data(cursor, user_id, name)

    if profile_id_query:
        return profile_id_query
    if x_profile_id and x_profile_id.isdigit():
        return int(x_profile_id)
    cursor.execute("SELECT value FROM settings WHERE key = 'active_profile_id'")
    row = cursor.fetchone()
    if row and row["value"].isdigit():
        return int(row["value"])
    cursor.execute("SELECT id FROM profiles ORDER BY is_default DESC, id ASC LIMIT 1")
    p_row = cursor.fetchone()
    return p_row["id"] if p_row else 1

# ====================================================================
# Authentication & User Management APIs
# ====================================================================
@app.post("/api/auth/register", response_model=AuthResponse)
def register(req: UserRegister):
    username_clean = req.username.strip().lower()
    email_clean = req.email.strip().lower()
    if len(req.password) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters long")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id FROM users WHERE username = ?", (username_clean,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Username is already taken")
        cursor.execute("SELECT id FROM users WHERE email = ?", (email_clean,))
        if cursor.fetchone():
            raise HTTPException(status_code=400, detail="Email is already registered")

        p_hash, p_salt = hash_password(req.password)
        cursor.execute("""
        INSERT INTO users (username, email, password_hash, password_salt, full_name)
        VALUES (?, ?, ?, ?, ?)
        """, (username_clean, email_clean, p_hash, p_salt, req.full_name.strip()))
        new_user_id = cursor.lastrowid

        # Seed default Personal Finances profile, accounts, and categories
        create_default_user_data(cursor, new_user_id, req.full_name.strip())

        token = generate_session_token()
        cursor.execute("""
        INSERT INTO user_sessions (token, user_id, expires_at)
        VALUES (?, ?, datetime('now', '+30 days'))
        """, (token, new_user_id))

        cursor.execute("SELECT id, username, email, full_name, created_at FROM users WHERE id = ?", (new_user_id,))
        user_row = dict(cursor.fetchone())

        return AuthResponse(
            token=token,
            user=UserResponse(**user_row),
            message="Registration successful"
        )

@app.post("/api/auth/login", response_model=AuthResponse)
def login(req: UserLogin):
    ident = req.get_identifier()
    if not ident:
        raise HTTPException(status_code=400, detail="Username or email is required")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = ? OR email = ?", (ident, ident))
        user = cursor.fetchone()
        if not user or not verify_password(req.password, user["password_hash"], user["password_salt"]):
            raise HTTPException(status_code=401, detail="Invalid username/email or password")

        token = generate_session_token()
        cursor.execute("""
        INSERT INTO user_sessions (token, user_id, expires_at)
        VALUES (?, ?, datetime('now', '+30 days'))
        """, (token, user["id"]))

        user_dict = {
            "id": user["id"],
            "username": user["username"],
            "email": user["email"],
            "full_name": user["full_name"],
            "created_at": user["created_at"]
        }

        return AuthResponse(
            token=token,
            user=UserResponse(**user_dict),
            message="Logged in successfully"
        )

@app.get("/api/auth/me")
def get_me(current_user: Dict[str, Any] = Depends(get_current_user)):
    return {
        "status": "authenticated",
        "user": {
            "id": current_user["id"],
            "username": current_user["username"],
            "email": current_user["email"],
            "full_name": current_user["full_name"],
            "created_at": current_user.get("created_at")
        }
    }

@app.post("/api/auth/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        with get_db_connection() as conn:
            cursor = conn.cursor()
            cursor.execute("DELETE FROM user_sessions WHERE token = ?", (token,))
    return {"status": "ok", "message": "Logged out successfully"}

# ====================================================================
# Health & Status
# ====================================================================
@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "PaisaTrack", "version": "1.1.0"}

# ====================================================================
# Profiles CRUD APIs
# ====================================================================
@app.get("/api/profiles")
def get_profiles(current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        u_id = current_user["id"]
        cursor.execute("SELECT * FROM profiles WHERE user_id = ? ORDER BY is_default DESC, id ASC", (u_id,))
        profiles = [dict(row) for row in cursor.fetchall()]
        if not profiles:
            create_default_user_data(cursor, u_id, current_user.get("full_name", "User"))
            cursor.execute("SELECT * FROM profiles WHERE user_id = ? ORDER BY is_default DESC, id ASC", (u_id,))
            profiles = [dict(row) for row in cursor.fetchall()]

        active_id = profiles[0]["id"]
        for p in profiles:
            if p.get("is_default"):
                active_id = p["id"]
                break

        for p in profiles:
            p_id = p["id"]
            # Total net worth in profile
            cursor.execute("SELECT COALESCE(SUM(balance), 0.0) as nw FROM accounts WHERE profile_id = ? AND is_active = 1", (p_id,))
            p["net_worth"] = round(float(cursor.fetchone()["nw"]), 2)

            # Account count
            cursor.execute("SELECT COUNT(*) as cnt FROM accounts WHERE profile_id = ?", (p_id,))
            p["account_count"] = cursor.fetchone()["cnt"]

            # Transaction count
            cursor.execute("SELECT COUNT(*) as cnt FROM transactions WHERE profile_id = ?", (p_id,))
            p["transaction_count"] = cursor.fetchone()["cnt"]

            p["is_active"] = 1 if p_id == active_id else 0

        return {"active_profile_id": active_id, "profiles": profiles}

@app.post("/api/profiles")
def create_profile(req: ProfileCreate, current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        u_id = current_user["id"]
        cursor.execute("""
        INSERT INTO profiles (user_id, name, description, color, icon, currency, is_default)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            u_id, req.name, req.description or "", req.color or "#4f46e5",
            req.icon or "user", req.currency or "INR", req.is_default or 0
        ))
        p_id = cursor.lastrowid

        # Copy default categories if requested
        if req.copy_default_categories:
            cursor.execute("SELECT name, type, icon, color, budget_limit FROM categories WHERE profile_id = (SELECT id FROM profiles WHERE user_id = ? ORDER BY is_default DESC, id ASC LIMIT 1)", (u_id,))
            base_cats = cursor.fetchall()
            for c in base_cats:
                cursor.execute("""
                INSERT OR IGNORE INTO categories (profile_id, name, type, icon, color, is_default, budget_limit)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """, (p_id, c["name"], c["type"], c["icon"], c["color"], c["budget_limit"]))

        # Seed initial cash account for the profile
        cursor.execute("""
        INSERT INTO accounts (profile_id, name, type, institution_name, balance, color)
        VALUES (?, 'Cash & Wallet', 'cash', 'Cash in Hand', 5000.0, '#10b981')
        """, (p_id,))

        cursor.execute("SELECT * FROM profiles WHERE id = ?", (p_id,))
        created = dict(cursor.fetchone())
        return {"success": True, "message": f"Profile '{req.name}' created successfully", "profile": created}

@app.get("/api/profiles/{profile_id}")
def get_profile(profile_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM profiles WHERE id = ? AND user_id = ?", (profile_id, current_user["id"]))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")
        return {"profile": dict(row)}

@app.put("/api/profiles/{profile_id}")
def update_profile(profile_id: int, req: ProfileUpdate, current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM profiles WHERE id = ? AND user_id = ?", (profile_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Profile not found")

        fields = req.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields provided for update")

        set_clauses = [f"{k} = ?" for k in fields.keys()]
        set_clauses.append("updated_at = CURRENT_TIMESTAMP")
        values = list(fields.values()) + [profile_id, current_user["id"]]

        cursor.execute(f"UPDATE profiles SET {', '.join(set_clauses)} WHERE id = ? AND user_id = ?", values)
        cursor.execute("SELECT * FROM profiles WHERE id = ?", (profile_id,))
        row = cursor.fetchone()
        return {"success": True, "message": "Profile updated successfully", "profile": dict(row)}

@app.delete("/api/profiles/{profile_id}")
def delete_profile(profile_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM profiles WHERE id = ? AND user_id = ?", (profile_id, current_user["id"]))
        prof = cursor.fetchone()
        if not prof:
            raise HTTPException(status_code=404, detail="Profile not found")
        if prof["is_default"]:
            raise HTTPException(status_code=400, detail="Cannot delete your primary default profile")

        cursor.execute("SELECT COUNT(*) as cnt FROM profiles WHERE user_id = ?", (current_user["id"],))
        if cursor.fetchone()["cnt"] <= 1:
            raise HTTPException(status_code=400, detail="Cannot delete your only remaining profile")

        # Cascade delete profile and all related items
        cursor.execute("DELETE FROM transactions WHERE profile_id = ?", (profile_id,))
        cursor.execute("DELETE FROM accounts WHERE profile_id = ?", (profile_id,))
        cursor.execute("DELETE FROM cards WHERE profile_id = ?", (profile_id,))
        cursor.execute("DELETE FROM loans WHERE profile_id = ?", (profile_id,))
        cursor.execute("DELETE FROM borrows_lent WHERE profile_id = ?", (profile_id,))
        cursor.execute("DELETE FROM monthly_carryovers WHERE profile_id = ?", (profile_id,))
        cursor.execute("DELETE FROM categories WHERE profile_id = ?", (profile_id,))
        cursor.execute("DELETE FROM profiles WHERE id = ?", (profile_id,))

        return {"success": True, "message": "Profile and all its data deleted successfully"}

@app.post("/api/profiles/{profile_id}/switch")
def switch_active_profile(profile_id: int, current_user: Dict[str, Any] = Depends(get_current_user)):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM profiles WHERE id = ? AND user_id = ?", (profile_id, current_user["id"]))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Profile not found")

        cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_profile_id', ?)", (str(profile_id),))
        return {"success": True, "message": f"Switched to profile: {row['name']}", "active_profile": dict(row)}

# ====================================================================
# Dashboard Overview API (Profile-Isolated)
# ====================================================================
@app.get("/api/dashboard")
def get_dashboard_summary(
    profile_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    today = date.today()
    y = year or today.year
    m = month or today.month

    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])

        # Profile details
        cursor.execute("SELECT * FROM profiles WHERE id = ?", (pid,))
        p_row = cursor.fetchone()
        current_profile = dict(p_row) if p_row else {"id": pid, "name": "Default Profile"}

        # 1. Accounts Total Net Worth in Profile
        cursor.execute("SELECT COALESCE(SUM(balance), 0.0) as total_networth FROM accounts WHERE profile_id = ? AND is_active = 1", (pid,))
        total_networth = float(cursor.fetchone()["total_networth"])

        # 2. Month Carryover Numbers
        carryover_data = calculate_month_carryover(cursor, y, m, pid)

        # 3. Active Bank Accounts
        cursor.execute("SELECT * FROM accounts WHERE profile_id = ? AND is_active = 1 ORDER BY balance DESC", (pid,))
        accounts = [dict(row) for row in cursor.fetchall()]

        # 4. Credit Cards Summary
        cursor.execute("SELECT * FROM cards WHERE profile_id = ? ORDER BY id ASC", (pid,))
        cards = [dict(row) for row in cursor.fetchall()]

        # 5. Active Loans Summary
        cursor.execute("SELECT * FROM loans WHERE profile_id = ? AND status = 'active' ORDER BY emi_due_day ASC", (pid,))
        loans = [dict(row) for row in cursor.fetchall()]
        total_loan_balance = sum(l["current_balance"] for l in loans)

        # 6. Borrows / Lent Summary (Friends & Relatives)
        cursor.execute("SELECT * FROM borrows_lent WHERE profile_id = ? AND status != 'settled' ORDER BY due_date ASC", (pid,))
        debts = [dict(row) for row in cursor.fetchall()]
        total_borrowed_payable = sum(d["balance_remaining"] for d in debts if d["direction"] == "borrowed")
        total_lent_receivable = sum(d["balance_remaining"] for d in debts if d["direction"] == "lent")

        # 7. Recent Transactions (last 8)
        cursor.execute("""
        SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
               a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.profile_id = ?
        ORDER BY t.date DESC, t.id DESC
        LIMIT 8
        """, (pid,))
        recent_transactions = [dict(row) for row in cursor.fetchall()]

        # 8. User Settings
        cursor.execute("SELECT key, value FROM settings")
        settings = {row["key"]: row["value"] for row in cursor.fetchall()}

        return {
            "profile": current_profile,
            "selected_period": {"year": y, "month": m, "month_name": calendar.month_name[m]},
            "total_networth": round(total_networth, 2),
            "carryover": carryover_data,
            "total_loan_balance": round(total_loan_balance, 2),
            "total_borrowed_payable": round(total_borrowed_payable, 2),
            "total_lent_receivable": round(total_lent_receivable, 2),
            "accounts": accounts,
            "cards": cards,
            "loans": loans,
            "debts": debts,
            "recent_transactions": recent_transactions,
            "settings": settings
        }

# ====================================================================
# Transactions CRUD APIs (Profile-Isolated)
# ====================================================================
@app.get("/api/transactions")
def get_transactions(
    profile_id: Optional[int] = None,
    type: Optional[str] = None,
    category_id: Optional[int] = None,
    account_id: Optional[int] = None,
    month: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    search: Optional[str] = None,
    limit: int = 150,
    offset: int = 0,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])

        query = """
        SELECT t.*, c.name as category_name, c.icon as category_icon, c.color as category_color,
               a.name as account_name, a2.name as destination_account_name,
               card.card_name, l.title as loan_title, b.person_name as debt_person_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        LEFT JOIN accounts a2 ON t.destination_account_id = a2.id
        LEFT JOIN cards card ON t.card_id = card.id
        LEFT JOIN loans l ON t.loan_id = l.id
        LEFT JOIN borrows_lent b ON t.borrow_id = b.id
        WHERE t.profile_id = ?
        """
        params = [pid]

        if type:
            query += " AND t.type = ?"
            params.append(type)
        if category_id:
            query += " AND t.category_id = ?"
            params.append(category_id)
        if account_id:
            query += " AND (t.account_id = ? OR t.destination_account_id = ?)"
            params.extend([account_id, account_id])
        if month:
            query += " AND strftime('%Y-%m', t.date) = ?"
            params.append(month)
        if start_date:
            query += " AND t.date >= ?"
            params.append(start_date)
        if end_date:
            query += " AND t.date <= ?"
            params.append(end_date)
        if search:
            query += " AND (t.description LIKE ? OR t.tags LIKE ? OR c.name LIKE ?)"
            term = f"%{search}%"
            params.extend([term, term, term])

        query += " ORDER BY t.date DESC, t.id DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        cursor.execute(query, params)
        transactions = [dict(row) for row in cursor.fetchall()]

        total_income = sum(t["amount"] for t in transactions if t["type"] == "income")
        total_expense = sum(t["amount"] for t in transactions if t["type"] == "expense")

        return {
            "profile_id": pid,
            "count": len(transactions),
            "total_income": round(total_income, 2),
            "total_expense": round(total_expense, 2),
            "net": round(total_income - total_expense, 2),
            "transactions": transactions
        }

@app.post("/api/transactions")
def create_transaction(
    trans: TransactionCreate,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = trans.profile_id or resolve_profile_id(cursor, None, x_profile_id, current_user["id"])

        # Verify profile belongs to user
        cursor.execute("SELECT id FROM profiles WHERE id = ? AND user_id = ?", (pid, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Profile access denied")

        cursor.execute("""
        INSERT INTO transactions (
            profile_id, date, time, type, amount, category_id, account_id, destination_account_id,
            card_id, loan_id, borrow_id, payment_mode, description, tags, is_cleared
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, trans.date, trans.time or "12:00:00", trans.type, trans.amount,
            trans.category_id, trans.account_id, trans.destination_account_id,
            trans.card_id, trans.loan_id, trans.borrow_id, trans.payment_mode or "upi",
            trans.description or "", trans.tags or "", trans.is_cleared or 1
        ))
        trans_id = cursor.lastrowid

        apply_transaction_balance(cursor, trans.model_dump(), reverse=False)

        cursor.execute("SELECT * FROM transactions WHERE id = ?", (trans_id,))
        created = dict(cursor.fetchone())
        return {"success": True, "message": "Transaction logged successfully", "transaction": created}

@app.put("/api/transactions/{trans_id}")
def update_transaction(
    trans_id: int,
    trans_update: TransactionUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT t.* FROM transactions t
        JOIN profiles p ON t.profile_id = p.id
        WHERE t.id = ? AND p.user_id = ?
        """, (trans_id, current_user["id"]))
        old_trans = cursor.fetchone()
        if not old_trans:
            raise HTTPException(status_code=404, detail="Transaction not found or access denied")

        old_dict = dict(old_trans)
        apply_transaction_balance(cursor, old_dict, reverse=True)

        update_data = trans_update.model_dump(exclude_unset=True)
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clauses = []
        values = []
        for k, v in update_data.items():
            set_clauses.append(f"{k} = ?")
            values.append(v)
        set_clauses.append("updated_at = CURRENT_TIMESTAMP")
        values.append(trans_id)

        cursor.execute(f"UPDATE transactions SET {', '.join(set_clauses)} WHERE id = ?", values)

        cursor.execute("SELECT * FROM transactions WHERE id = ?", (trans_id,))
        new_trans = dict(cursor.fetchone())
        apply_transaction_balance(cursor, new_trans, reverse=False)

        return {"success": True, "message": "Transaction modified successfully", "transaction": new_trans}

@app.delete("/api/transactions/{trans_id}")
def delete_transaction(
    trans_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT t.* FROM transactions t
        JOIN profiles p ON t.profile_id = p.id
        WHERE t.id = ? AND p.user_id = ?
        """, (trans_id, current_user["id"]))
        trans = cursor.fetchone()
        if not trans:
            raise HTTPException(status_code=404, detail="Transaction not found or access denied")

        apply_transaction_balance(cursor, dict(trans), reverse=True)
        cursor.execute("DELETE FROM transactions WHERE id = ?", (trans_id,))
        return {"success": True, "message": "Transaction deleted successfully"}

# ====================================================================
# Accounts & Transfers APIs (Profile-Isolated)
# ====================================================================
@app.get("/api/accounts")
def get_accounts(
    profile_id: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        cursor.execute("SELECT * FROM accounts WHERE profile_id = ? ORDER BY is_active DESC, balance DESC", (pid,))
        accounts = [dict(row) for row in cursor.fetchall()]
        return {"profile_id": pid, "accounts": accounts}

@app.post("/api/accounts")
def create_account(
    account: AccountCreate,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = account.profile_id or resolve_profile_id(cursor, None, x_profile_id, current_user["id"])
        cursor.execute("SELECT id FROM profiles WHERE id = ? AND user_id = ?", (pid, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=403, detail="Profile access denied")

        cursor.execute("""
        INSERT INTO accounts (profile_id, name, type, institution_name, account_number_mask, balance, currency, color, is_active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, account.name, account.type, account.institution_name or "",
            account.account_number_mask or "", account.balance, account.currency or "INR",
            account.color or "#2563eb", account.is_active or 1
        ))
        acc_id = cursor.lastrowid
        cursor.execute("SELECT * FROM accounts WHERE id = ?", (acc_id,))
        return {"success": True, "account": dict(cursor.fetchone())}

@app.put("/api/accounts/{account_id}")
def update_account(
    account_id: int,
    update_data: AccountUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT a.* FROM accounts a
        JOIN profiles p ON a.profile_id = p.id
        WHERE a.id = ? AND p.user_id = ?
        """, (account_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Account not found or access denied")

        fields = update_data.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields provided for update")

        set_clauses = [f"{k} = ?" for k in fields.keys()]
        set_clauses.append("updated_at = CURRENT_TIMESTAMP")
        values = list(fields.values()) + [account_id]

        cursor.execute(f"UPDATE accounts SET {', '.join(set_clauses)} WHERE id = ?", values)
        cursor.execute("SELECT * FROM accounts WHERE id = ?", (account_id,))
        row = cursor.fetchone()
        return {"success": True, "account": dict(row)}

@app.delete("/api/accounts/{account_id}")
def delete_account(
    account_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT a.* FROM accounts a
        JOIN profiles p ON a.profile_id = p.id
        WHERE a.id = ? AND p.user_id = ?
        """, (account_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Account not found or access denied")

        cursor.execute("SELECT COUNT(*) as cnt FROM transactions WHERE account_id = ? OR destination_account_id = ?", (account_id, account_id))
        if cursor.fetchone()["cnt"] > 0:
            cursor.execute("UPDATE accounts SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (account_id,))
            return {"success": True, "message": "Account deactivated (preserved history for existing transactions)"}
        cursor.execute("DELETE FROM accounts WHERE id = ?", (account_id,))
        return {"success": True, "message": "Account deleted permanently"}

@app.post("/api/accounts/transfer")
def transfer_between_accounts(
    req: AccountTransferRequest,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    if req.from_account_id == req.to_account_id:
        raise HTTPException(status_code=400, detail="Source and destination accounts must be different")

    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, req.profile_id, x_profile_id, current_user["id"])

        cursor.execute("SELECT balance, name FROM accounts WHERE id = ? AND profile_id = ?", (req.from_account_id, pid))
        src = cursor.fetchone()
        if not src:
            raise HTTPException(status_code=404, detail="Source account not found in current profile")

        cursor.execute("SELECT name FROM accounts WHERE id = ? AND profile_id = ?", (req.to_account_id, pid))
        dest = cursor.fetchone()
        if not dest:
            raise HTTPException(status_code=404, detail="Destination account not found in current profile")

        cursor.execute("""
        INSERT INTO transactions (
            profile_id, date, time, type, amount, account_id, destination_account_id,
            payment_mode, description, tags
        ) VALUES (?, ?, '12:00:00', 'transfer', ?, ?, ?, 'netbanking', ?, '#transfer')
        """, (
            pid, req.date, req.amount, req.from_account_id, req.to_account_id,
            f"Transfer from {src['name']} to {dest['name']}: {req.notes}"
        ))

        cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.amount, req.from_account_id))
        cursor.execute("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.amount, req.to_account_id))

        return {"success": True, "message": f"Successfully transferred ₹{req.amount:,.2f} from {src['name']} to {dest['name']}"}

# ====================================================================
# Cards APIs (Profile-Isolated)
# ====================================================================
@app.get("/api/cards")
def get_cards(
    profile_id: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        cursor.execute("""
        SELECT 
            c.*, 
            a.name as linked_account_name,
            p.card_name as parent_card_name,
            p.card_last4 as parent_card_last4,
            CASE 
                WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.available_limit 
                ELSE c.available_limit 
            END as available_limit,
            CASE 
                WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.credit_limit 
                ELSE c.credit_limit 
            END as credit_limit,
            COALESCE(c.billing_start_day, CASE WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.billing_start_day ELSE 24 END) as billing_start_day,
            COALESCE(c.billing_day, CASE WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.billing_day ELSE 22 END) as billing_day,
            COALESCE(c.due_day, CASE WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.due_day ELSE 11 END) as due_day,
            (SELECT COUNT(*) FROM cards child WHERE child.parent_card_id = c.id) as addon_count
        FROM cards c
        LEFT JOIN accounts a ON c.account_id = a.id
        LEFT JOIN cards p ON c.parent_card_id = p.id
        WHERE c.profile_id = ?
        ORDER BY (c.parent_card_id IS NOT NULL) ASC, c.id ASC
        """, (pid,))
        cards = [dict(row) for row in cursor.fetchall()]
        return {"profile_id": pid, "cards": cards}

def get_safe_date(year: int, month: int, day: int) -> date:
    while month > 12:
        month -= 12
        year += 1
    while month < 1:
        month += 12
        year -= 1
    max_days = calendar.monthrange(year, month)[1]
    return date(year, month, min(max(1, int(day)), max_days))

def compute_due_date(stmt_date: date, due_day: int) -> date:
    if due_day > stmt_date.day and (due_day - stmt_date.day) >= 10:
        return get_safe_date(stmt_date.year, stmt_date.month, due_day)
    else:
        return get_safe_date(stmt_date.year, stmt_date.month + 1, due_day)

def build_single_cycle(start_year: int, start_month: int, start_day: int, statement_day: int, due_day: int) -> dict:
    start_date = get_safe_date(start_year, start_month, start_day)
    if start_day > statement_day:
        stmt_date = get_safe_date(start_year, start_month + 1, statement_day)
    else:
        stmt_date = get_safe_date(start_year, start_month, statement_day)
    due_date = compute_due_date(stmt_date, due_day)
    return {
        "start_date": start_date.strftime("%Y-%m-%d"),
        "end_date": stmt_date.strftime("%Y-%m-%d"),
        "statement_date": stmt_date.strftime("%Y-%m-%d"),
        "due_date": due_date.strftime("%Y-%m-%d"),
        "start_date_obj": start_date,
        "stmt_date_obj": stmt_date,
        "due_date_obj": due_date
    }

def calculate_card_billing_cycles_info(cursor, card: dict, ref_date_str: Optional[str] = None) -> dict:
    if ref_date_str:
        try:
            ref_dt = datetime.strptime(ref_date_str, "%Y-%m-%d").date()
        except Exception:
            ref_dt = date.today()
    else:
        ref_dt = date.today()

    start_day = int(card.get("billing_start_day") or 24)
    statement_day = int(card.get("billing_day") or 22)
    due_day = int(card.get("due_day") or 11)

    # Determine current cycle start month and year
    if start_day > statement_day:
        if ref_dt.day <= statement_day:
            cur_start_month = ref_dt.month - 1
            cur_start_year = ref_dt.year
        else:
            cur_start_month = ref_dt.month
            cur_start_year = ref_dt.year
    else:
        if ref_dt.day < start_day:
            cur_start_month = ref_dt.month - 1
            cur_start_year = ref_dt.year
        else:
            cur_start_month = ref_dt.month
            cur_start_year = ref_dt.year

    prev_c_dates = build_single_cycle(cur_start_year, cur_start_month - 1, start_day, statement_day, due_day)
    curr_c_dates = build_single_cycle(cur_start_year, cur_start_month, start_day, statement_day, due_day)
    next_c_dates = build_single_cycle(cur_start_year, cur_start_month + 1, start_day, statement_day, due_day)

    def populate_cycle_data(c_dates: dict, cycle_type: str) -> dict:
        start_str = c_dates["start_date"]
        end_str = c_dates["end_date"]
        stmt_str = c_dates["statement_date"]
        due_str = c_dates["due_date"]
        stmt_obj = c_dates["stmt_date_obj"]
        due_obj = c_dates["due_date_obj"]

        # Fetch card's expense transactions in this cycle
        cursor.execute("""
        SELECT t.id, t.date, t.time, t.amount, t.description, t.tags, t.payment_mode,
               c.name as category_name, c.icon as category_icon, c.color as category_color
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE t.card_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
        ORDER BY t.date DESC, t.id DESC
        """, (card["id"], start_str, end_str))
        txs = [dict(r) for r in cursor.fetchall()]

        billed_amount = sum(float(t["amount"]) for t in txs)

        # Check for bill payments
        cursor.execute("""
        SELECT SUM(amount) as paid_total
        FROM transactions
        WHERE card_id = ? AND type = 'expense' AND tags LIKE '%#ccbill%' AND date >= ?
        """, (card["id"], stmt_str))
        p_row = cursor.fetchone()
        paid_amount = float(p_row["paid_total"] or 0.0) if p_row else 0.0

        net_due = max(0.0, billed_amount - paid_amount)

        days_to_stmt = (stmt_obj - ref_dt).days
        days_to_due = (due_obj - ref_dt).days
        free_credit_days = (due_obj - c_dates["start_date_obj"]).days

        if cycle_type == "previous":
            name = "Previous Month Bill"
            if net_due <= 0.01:
                status = "PAID"
                status_label = "Settled / Paid"
                status_color = "#10b981"
            elif ref_dt > due_obj:
                status = "OVERDUE"
                status_label = f"Overdue by {abs(days_to_due)} days"
                status_color = "#f43f5e"
            else:
                status = "DUE"
                status_label = f"Due in {days_to_due} days" if days_to_due > 0 else "Due Today"
                status_color = "#f59e0b"
        elif cycle_type == "current":
            name = "Current Active Cycle"
            if ref_dt <= stmt_obj:
                status = "ACTIVE_UNBILLED"
                status_label = f"Unbilled • Bill in {days_to_stmt}d" if days_to_stmt > 0 else "Billing Today"
                status_color = "#38bdf8"
            else:
                status = "STATEMENT_READY"
                status_label = f"Statement Generated • Due in {days_to_due}d"
                status_color = "#fbbf24"
        else:
            name = "Next Month Cycle"
            status = "UPCOMING"
            status_label = "Upcoming Cycle"
            status_color = "#94a3b8"

        start_formatted = datetime.strptime(start_str, "%Y-%m-%d").strftime("%d %b %Y")
        end_formatted = datetime.strptime(end_str, "%Y-%m-%d").strftime("%d %b %Y")
        stmt_formatted = datetime.strptime(stmt_str, "%Y-%m-%d").strftime("%d %b %Y")
        due_formatted = datetime.strptime(due_str, "%Y-%m-%d").strftime("%d %b %Y")

        return {
            "name": name,
            "cycle_type": cycle_type,
            "cycle_range": f"{start_formatted} to {end_formatted}",
            "start_date": start_str,
            "end_date": end_str,
            "statement_date": stmt_str,
            "statement_date_formatted": stmt_formatted,
            "due_date": due_str,
            "due_date_formatted": due_formatted,
            "billed_amount": round(billed_amount, 2),
            "paid_amount": round(paid_amount, 2),
            "net_due_amount": round(net_due, 2),
            "days_to_statement": days_to_stmt,
            "days_to_due": days_to_due,
            "interest_free_days": free_credit_days,
            "status": status,
            "status_label": status_label,
            "status_color": status_color,
            "transaction_count": len(txs),
            "transactions": txs
        }

    return {
        "card_id": card["id"],
        "card_name": card["card_name"],
        "card_network": card.get("card_network", "visa"),
        "card_last4": card.get("card_last4", "0000"),
        "card_type": card.get("card_type", "credit"),
        "is_addon": card.get("is_addon", 0),
        "parent_card_id": card.get("parent_card_id"),
        "parent_card_name": card.get("parent_card_name"),
        "credit_limit": float(card.get("credit_limit") or 0.0),
        "available_limit": float(card.get("available_limit") or 0.0),
        "sub_limit": float(card.get("sub_limit") or 0.0),
        "billing_start_day": start_day,
        "billing_day": statement_day,
        "due_day": due_day,
        "ref_date": ref_dt.strftime("%Y-%m-%d"),
        "previous_cycle": populate_cycle_data(prev_c_dates, "previous"),
        "current_cycle": populate_cycle_data(curr_c_dates, "current"),
        "next_cycle": populate_cycle_data(next_c_dates, "next")
    }

@app.get("/api/cards/{card_id}/billing-cycles")
def get_card_billing_cycles(
    card_id: int,
    ref_date: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT c.*, p.card_name as parent_card_name, p.card_last4 as parent_card_last4,
               CASE WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.credit_limit ELSE c.credit_limit END as credit_limit,
               CASE WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.available_limit ELSE c.available_limit END as available_limit,
               COALESCE(c.billing_start_day, CASE WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.billing_start_day ELSE 24 END) as billing_start_day,
               COALESCE(c.billing_day, CASE WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.billing_day ELSE 22 END) as billing_day,
               COALESCE(c.due_day, CASE WHEN c.is_addon = 1 AND p.id IS NOT NULL THEN p.due_day ELSE 11 END) as due_day
        FROM cards c
        JOIN profiles prof ON c.profile_id = prof.id
        LEFT JOIN cards p ON c.parent_card_id = p.id
        WHERE c.id = ? AND prof.user_id = ?
        """, (card_id, current_user["id"]))
        card = cursor.fetchone()
        if not card:
            raise HTTPException(status_code=404, detail="Card not found or access denied")
        
        cycles_data = calculate_card_billing_cycles_info(cursor, dict(card), ref_date)
        return cycles_data

@app.post("/api/cards")
def create_card(
    card: CardCreate,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, card.profile_id, x_profile_id, current_user["id"])
        
        credit_limit = card.credit_limit or 0.0
        avail = card.available_limit if card.available_limit is not None else credit_limit
        billing_start_day = card.billing_start_day if card.billing_start_day is not None else 24
        billing_day = card.billing_day if card.billing_day is not None else 22
        due_day = card.due_day if card.due_day is not None else 11
        parent_id = card.parent_card_id
        is_addon = 1 if (card.is_addon or parent_id) else 0

        # If this is an Add-on card linked to a primary card, inherit parent's shared credit limits
        if parent_id:
            cursor.execute("SELECT credit_limit, available_limit, billing_start_day, billing_day, due_day FROM cards WHERE id = ? AND profile_id = ?", (parent_id, pid))
            parent = cursor.fetchone()
            if parent:
                credit_limit = float(parent["credit_limit"] or 0.0)
                avail = float(parent["available_limit"] or 0.0)
                # Only inherit billing cycle days if not explicitly provided
                if card.billing_start_day is None and parent["billing_start_day"]:
                    billing_start_day = int(parent["billing_start_day"])
                if card.billing_day is None and parent["billing_day"]:
                    billing_day = int(parent["billing_day"])
                if card.due_day is None and parent["due_day"]:
                    due_day = int(parent["due_day"])

        cursor.execute("""
        INSERT INTO cards (
            profile_id, account_id, parent_card_id, is_addon, sub_limit, card_name, card_type, card_network, card_last4,
            credit_limit, available_limit, billing_start_day, billing_day, due_day, color
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, card.account_id, parent_id, is_addon, card.sub_limit or 0.0,
            card.card_name, card.card_type, card.card_network or "visa",
            card.card_last4 or "0000", credit_limit, avail,
            billing_start_day, billing_day, due_day, card.color or "#4f46e5"
        ))
        card_id = cursor.lastrowid
        cursor.execute("SELECT * FROM cards WHERE id = ?", (card_id,))
        return {"success": True, "card": dict(cursor.fetchone())}

@app.put("/api/cards/{card_id}")
def update_card(
    card_id: int,
    update_data: CardUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT c.* FROM cards c
        JOIN profiles p ON c.profile_id = p.id
        WHERE c.id = ? AND p.user_id = ?
        """, (card_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Card not found or access denied")

        fields = update_data.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        # If parent_card_id is set, ensure is_addon is 1
        if "parent_card_id" in fields and fields["parent_card_id"]:
            fields["is_addon"] = 1
            # Inherit parent's limit pool
            cursor.execute("SELECT credit_limit, available_limit FROM cards WHERE id = ?", (fields["parent_card_id"],))
            p = cursor.fetchone()
            if p:
                fields["credit_limit"] = p["credit_limit"]
                fields["available_limit"] = p["available_limit"]

        set_clauses = [f"{k} = ?" for k in fields.keys()]
        set_clauses.append("updated_at = CURRENT_TIMESTAMP")
        values = list(fields.values()) + [card_id]

        cursor.execute(f"UPDATE cards SET {', '.join(set_clauses)} WHERE id = ?", values)

        # If this was a primary card and limit or available limit was changed, sync to child add-ons
        if "credit_limit" in fields or "available_limit" in fields:
            cursor.execute("SELECT credit_limit, available_limit FROM cards WHERE id = ?", (card_id,))
            updated_p = cursor.fetchone()
            if updated_p:
                cursor.execute("""
                UPDATE cards 
                SET credit_limit = ?, available_limit = ?, updated_at = CURRENT_TIMESTAMP 
                WHERE parent_card_id = ?
                """, (updated_p["credit_limit"], updated_p["available_limit"], card_id))

        cursor.execute("SELECT * FROM cards WHERE id = ?", (card_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Card not found")
        return {"success": True, "card": dict(row)}

@app.delete("/api/cards/{card_id}")
def delete_card(
    card_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT c.* FROM cards c
        JOIN profiles p ON c.profile_id = p.id
        WHERE c.id = ? AND p.user_id = ?
        """, (card_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Card not found or access denied")

        # If any add-on cards point to this card, detach them
        cursor.execute("UPDATE cards SET parent_card_id = NULL, is_addon = 0 WHERE parent_card_id = ?", (card_id,))
        cursor.execute("DELETE FROM cards WHERE id = ?", (card_id,))
        return {"success": True, "message": "Card deleted successfully"}

@app.post("/api/cards/pay")
def pay_credit_card_bill(
    req: CardPaymentRequest,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, req.profile_id, x_profile_id, current_user["id"])

        cursor.execute("SELECT * FROM cards WHERE id = ? AND profile_id = ?", (req.card_id, pid))
        card = cursor.fetchone()
        if not card:
            raise HTTPException(status_code=404, detail="Card not found in active profile")

        cursor.execute("SELECT name FROM accounts WHERE id = ? AND profile_id = ?", (req.from_account_id, pid))
        account = cursor.fetchone()
        if not account:
            raise HTTPException(status_code=404, detail="Account not found in active profile")

        # Deduct payment amount from paying bank account
        cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.amount, req.from_account_id))

        # Target master primary card (if this is an add-on, master is parent_card_id)
        primary_id = card["parent_card_id"] if (card["is_addon"] == 1 and card["parent_card_id"]) else card["id"]
        cursor.execute("SELECT * FROM cards WHERE id = ?", (primary_id,))
        master = cursor.fetchone()
        if not master:
            master = card
            primary_id = card["id"]

        new_avail = min(master["credit_limit"], (master["available_limit"] or 0.0) + req.amount)
        cursor.execute("UPDATE cards SET available_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_avail, primary_id))
        # Synchronize restored available limit to all child add-on cards
        cursor.execute("UPDATE cards SET available_limit = ?, updated_at = CURRENT_TIMESTAMP WHERE parent_card_id = ?", (new_avail, primary_id))

        cursor.execute("""
        INSERT INTO transactions (
            profile_id, date, time, type, amount, account_id, card_id, payment_mode, description, tags
        ) VALUES (?, ?, '12:00:00', 'expense', ?, ?, ?, 'netbanking', ?, '#ccbill,#payment')
        """, (
            pid, req.date, req.amount, req.from_account_id, req.card_id,
            f"Bill payment for {card['card_name']} from {account['name']}: {req.notes}"
        ))

        return {"success": True, "message": f"Paid ₹{req.amount:,.2f} towards {card['card_name']} bill successfully"}

# ====================================================================
# Loans & EMI APIs (Profile-Isolated)
# ====================================================================
@app.get("/api/loans")
def get_loans(
    profile_id: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        cursor.execute("SELECT * FROM loans WHERE profile_id = ? ORDER BY status ASC, emi_due_day ASC", (pid,))
        loans = [dict(row) for row in cursor.fetchall()]
        return {"profile_id": pid, "loans": loans}

@app.post("/api/loans")
def create_loan(
    loan: LoanCreate,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, loan.profile_id, x_profile_id, current_user["id"])
        cursor.execute("""
        INSERT INTO loans (
            profile_id, title, loan_type, lender_name, principal_amount, current_balance,
            interest_rate, tenure_months, emi_amount, emi_due_day, start_date, end_date, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, loan.title, loan.loan_type, loan.lender_name or "",
            loan.principal_amount, loan.current_balance, loan.interest_rate or 0.0,
            loan.tenure_months or 12, loan.emi_amount, loan.emi_due_day or 5,
            loan.start_date or date.today().isoformat(), loan.end_date or "", loan.notes or ""
        ))
        loan_id = cursor.lastrowid
        cursor.execute("SELECT * FROM loans WHERE id = ?", (loan_id,))
        return {"success": True, "loan": dict(cursor.fetchone())}

@app.put("/api/loans/{loan_id}")
def update_loan(
    loan_id: int,
    update_data: LoanUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT l.* FROM loans l
        JOIN profiles p ON l.profile_id = p.id
        WHERE l.id = ? AND p.user_id = ?
        """, (loan_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Loan not found or access denied")

        fields = update_data.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        set_clauses = [f"{k} = ?" for k in fields.keys()]
        set_clauses.append("updated_at = CURRENT_TIMESTAMP")
        values = list(fields.values()) + [loan_id]

        cursor.execute(f"UPDATE loans SET {', '.join(set_clauses)} WHERE id = ?", values)
        cursor.execute("SELECT * FROM loans WHERE id = ?", (loan_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Loan not found")
        return {"success": True, "loan": dict(row)}

@app.delete("/api/loans/{loan_id}")
def delete_loan(
    loan_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT l.* FROM loans l
        JOIN profiles p ON l.profile_id = p.id
        WHERE l.id = ? AND p.user_id = ?
        """, (loan_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Loan not found or access denied")

        cursor.execute("DELETE FROM loans WHERE id = ?", (loan_id,))
        return {"success": True, "message": "Loan deleted successfully"}

@app.post("/api/loans/pay-emi")
def pay_loan_emi(
    req: LoanEMIPaymentRequest,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, req.profile_id, x_profile_id, current_user["id"])

        cursor.execute("SELECT * FROM loans WHERE id = ? AND profile_id = ?", (req.loan_id, pid))
        loan = cursor.fetchone()
        if not loan:
            raise HTTPException(status_code=404, detail="Loan not found in active profile")

        cursor.execute("SELECT name FROM accounts WHERE id = ? AND profile_id = ?", (req.from_account_id, pid))
        acc = cursor.fetchone()
        if not acc:
            raise HTTPException(status_code=404, detail="Account not found in active profile")

        cursor.execute("SELECT id FROM categories WHERE profile_id = ? AND name LIKE '%Loan EMI%' LIMIT 1", (pid,))
        cat = cursor.fetchone()
        cat_id = cat["id"] if cat else None

        cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.amount, req.from_account_id))

        new_balance = max(0.0, loan["current_balance"] - req.amount)
        new_status = "closed" if new_balance <= 0.01 else "active"
        cursor.execute("UPDATE loans SET current_balance = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_balance, new_status, req.loan_id))

        cursor.execute("""
        INSERT INTO transactions (
            profile_id, date, time, type, amount, category_id, account_id, loan_id,
            payment_mode, description, tags
        ) VALUES (?, ?, '12:00:00', 'expense', ?, ?, ?, ?, 'netbanking', ?, '#emi,#loan')
        """, (
            pid, req.date, req.amount, cat_id, req.from_account_id, req.loan_id,
            f"Monthly EMI payment for {loan['title']}: {req.notes}"
        ))

        return {"success": True, "message": f"Paid EMI of ₹{req.amount:,.2f} for {loan['title']}. Remaining balance: ₹{new_balance:,.2f}"}

# ====================================================================
# Borrows & Lent (Friends & Relatives) APIs (Profile-Isolated)
# ====================================================================
@app.get("/api/borrows")
def get_borrows(
    profile_id: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        cursor.execute("""
            SELECT b.*, a.name as account_name, a.type as account_type
            FROM borrows_lent b
            LEFT JOIN accounts a ON b.account_id = a.id
            WHERE b.profile_id = ?
            ORDER BY b.status ASC, b.due_date ASC
        """, (pid,))
        debts = [dict(row) for row in cursor.fetchall()]

        borrowed = [d for d in debts if d["direction"] == "borrowed"]
        lent = [d for d in debts if d["direction"] == "lent"]

        return {
            "profile_id": pid,
            "borrowed_list": borrowed,
            "lent_list": lent,
            "total_borrowed_remaining": round(sum(d["balance_remaining"] for d in borrowed if d["status"] != "settled"), 2),
            "total_lent_remaining": round(sum(d["balance_remaining"] for d in lent if d["status"] != "settled"), 2)
        }

@app.post("/api/borrows")
def create_borrow(
    borrow: BorrowCreate,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, borrow.profile_id, x_profile_id, current_user["id"])
        bal = borrow.balance_remaining if borrow.balance_remaining is not None else borrow.principal_amount
        status = "active" if bal > 0 else "settled"

        cursor.execute("""
        INSERT INTO borrows_lent (
            profile_id, person_name, relationship, direction, principal_amount, balance_remaining,
            transaction_date, due_date, account_id, payment_mode, status, phone, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            pid, borrow.person_name, borrow.relationship or "friend", borrow.direction,
            borrow.principal_amount, bal, borrow.transaction_date,
            borrow.due_date or "", borrow.account_id, borrow.payment_mode or "upi",
            status, borrow.phone or "", borrow.notes or ""
        ))
        b_id = cursor.lastrowid
        created_trans_id = None

        # If an account_id is selected, automatically update account balance and log to main transactions history
        if borrow.account_id:
            if borrow.direction == "borrowed":
                # User received borrowed funds into their bank account / wallet
                cursor.execute("""
                UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                """, (borrow.principal_amount, borrow.account_id))

                # Find or assign income category
                cursor.execute("""
                SELECT id FROM categories
                WHERE profile_id = ? AND type = 'income' AND (name LIKE '%Borrow%' OR name LIKE '%Debt%' OR name LIKE '%Other%')
                ORDER BY CASE WHEN name LIKE '%Borrow%' THEN 1 WHEN name LIKE '%Debt%' THEN 2 ELSE 3 END
                LIMIT 1
                """, (pid,))
                cat = cursor.fetchone()
                cat_id = cat["id"] if cat else None

                cursor.execute("""
                INSERT INTO transactions (
                    profile_id, date, time, type, amount, category_id, account_id, borrow_id,
                    payment_mode, description, tags
                ) VALUES (?, ?, '12:00:00', 'income', ?, ?, ?, ?, ?, ?, '#borrowed,#friendborrow,#debtinflow')
                """, (
                    pid, borrow.transaction_date, borrow.principal_amount, cat_id, borrow.account_id, b_id,
                    borrow.payment_mode or "upi",
                    f"Borrowed from {borrow.person_name} ({borrow.relationship or 'friend'}): {borrow.notes or ''}".strip(": ")
                ))
                created_trans_id = cursor.lastrowid

            elif borrow.direction == "lent":
                # User lent money to friend/relative out of their bank account / wallet
                cursor.execute("""
                UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                """, (borrow.principal_amount, borrow.account_id))

                # Find or assign expense category
                cursor.execute("""
                SELECT id FROM categories
                WHERE profile_id = ? AND type = 'expense' AND (name LIKE '%Lent%' OR name LIKE '%Debt%' OR name LIKE '%Misc%')
                ORDER BY CASE WHEN name LIKE '%Lent%' THEN 1 WHEN name LIKE '%Debt%' THEN 2 ELSE 3 END
                LIMIT 1
                """, (pid,))
                cat = cursor.fetchone()
                cat_id = cat["id"] if cat else None

                cursor.execute("""
                INSERT INTO transactions (
                    profile_id, date, time, type, amount, category_id, account_id, borrow_id,
                    payment_mode, description, tags
                ) VALUES (?, ?, '12:00:00', 'expense', ?, ?, ?, ?, ?, ?, '#lent,#frienddebt,#loanout')
                """, (
                    pid, borrow.transaction_date, borrow.principal_amount, cat_id, borrow.account_id, b_id,
                    borrow.payment_mode or "upi",
                    f"Money lent to {borrow.person_name} ({borrow.relationship or 'friend'}): {borrow.notes or ''}".strip(": ")
                ))
                created_trans_id = cursor.lastrowid

            if created_trans_id:
                cursor.execute("UPDATE borrows_lent SET transaction_id = ? WHERE id = ?", (created_trans_id, b_id))

        cursor.execute("""
            SELECT b.*, a.name as account_name, a.type as account_type
            FROM borrows_lent b
            LEFT JOIN accounts a ON b.account_id = a.id
            WHERE b.id = ?
        """, (b_id,))
        return {"success": True, "borrow": dict(cursor.fetchone())}

@app.put("/api/borrows/{borrow_id}")
def update_borrow(
    borrow_id: int,
    update_data: BorrowUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT b.* FROM borrows_lent b
        JOIN profiles p ON b.profile_id = p.id
        WHERE b.id = ? AND p.user_id = ?
        """, (borrow_id, current_user["id"]))
        existing = cursor.fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Debt record not found or access denied")

        fields = update_data.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields to update")

        # Check if account_id or principal_amount changed
        old_acc = existing["account_id"]
        new_acc = fields.get("account_id", old_acc)
        old_amt = existing["principal_amount"]
        new_amt = fields.get("principal_amount", old_amt)
        old_dir = existing["direction"]
        new_dir = fields.get("direction", old_dir)

        # If account or amount changed, adjust accounts accordingly
        if (old_acc or new_acc) and (old_acc != new_acc or old_amt != new_amt or old_dir != new_dir):
            if old_acc:
                if old_dir == "borrowed":
                    cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (old_amt, old_acc))
                elif old_dir == "lent":
                    cursor.execute("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (old_amt, old_acc))
            if new_acc:
                if new_dir == "borrowed":
                    cursor.execute("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_amt, new_acc))
                elif new_dir == "lent":
                    cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_amt, new_acc))

        set_clauses = [f"{k} = ?" for k in fields.keys()]
        set_clauses.append("updated_at = CURRENT_TIMESTAMP")
        values = list(fields.values()) + [borrow_id]

        cursor.execute(f"UPDATE borrows_lent SET {', '.join(set_clauses)} WHERE id = ?", values)

        # Update linked transaction if exists
        trans_id = existing["transaction_id"]
        if trans_id:
            person = fields.get("person_name", existing["person_name"])
            rel = fields.get("relationship", existing["relationship"])
            notes = fields.get("notes", existing["notes"])
            trans_date = fields.get("transaction_date", existing["transaction_date"])
            mode = fields.get("payment_mode", existing["payment_mode"] or "upi")
            desc = f"Borrowed from {person} ({rel}): {notes}" if new_dir == "borrowed" else f"Money lent to {person} ({rel}): {notes}"
            ttype = "income" if new_dir == "borrowed" else "expense"
            cursor.execute("""
            UPDATE transactions
            SET date = ?, amount = ?, account_id = ?, payment_mode = ?, description = ?, type = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (trans_date, new_amt, new_acc, mode, desc.strip(": "), ttype, trans_id))

        cursor.execute("""
            SELECT b.*, a.name as account_name, a.type as account_type
            FROM borrows_lent b
            LEFT JOIN accounts a ON b.account_id = a.id
            WHERE b.id = ?
        """, (borrow_id,))
        row = cursor.fetchone()
        return {"success": True, "borrow": dict(row)}

@app.delete("/api/borrows/{borrow_id}")
def delete_borrow(
    borrow_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT b.* FROM borrows_lent b
        JOIN profiles p ON b.profile_id = p.id
        WHERE b.id = ? AND p.user_id = ?
        """, (borrow_id, current_user["id"]))
        debt = cursor.fetchone()
        if not debt:
            raise HTTPException(status_code=404, detail="Debt record not found or access denied")

        # 1. Reverse initial disbursement/receipt if it affected an account
        if debt["account_id"] and debt["principal_amount"]:
            if debt["direction"] == "borrowed":
                cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                               (debt["principal_amount"], debt["account_id"]))
            elif debt["direction"] == "lent":
                cursor.execute("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                               (debt["principal_amount"], debt["account_id"]))

        # 2. Reverse any repayment transactions if they were made
        cursor.execute("SELECT * FROM borrow_payments WHERE borrow_id = ?", (borrow_id,))
        payments = cursor.fetchall()
        for p in payments:
            if p["account_id"]:
                if debt["direction"] == "borrowed":
                    cursor.execute("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                                   (p["amount"], p["account_id"]))
                elif debt["direction"] == "lent":
                    cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
                                   (p["amount"], p["account_id"]))

        # 3. Delete related transactions
        cursor.execute("DELETE FROM transactions WHERE borrow_id = ?", (borrow_id,))
        if debt["transaction_id"]:
            cursor.execute("DELETE FROM transactions WHERE id = ?", (debt["transaction_id"],))

        # 4. Delete payments and borrow record
        cursor.execute("DELETE FROM borrow_payments WHERE borrow_id = ?", (borrow_id,))
        cursor.execute("DELETE FROM borrows_lent WHERE id = ?", (borrow_id,))
        return {"success": True, "message": "Debt record and linked transactions removed, balance restored"}

@app.post("/api/borrows/repay")
def repay_borrow(
    req: BorrowRepaymentRequest,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, req.profile_id, x_profile_id, current_user["id"])

        cursor.execute("SELECT * FROM borrows_lent WHERE id = ? AND profile_id = ?", (req.borrow_id, pid))
        debt = cursor.fetchone()
        if not debt:
            raise HTTPException(status_code=404, detail="Debt record not found in active profile")

        direction = debt["direction"]
        new_balance = max(0.0, debt["balance_remaining"] - req.amount)
        new_status = "settled" if new_balance <= 0.01 else "partial"

        cursor.execute("""
        INSERT INTO borrow_payments (borrow_id, amount, payment_date, account_id, payment_mode, notes)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (req.borrow_id, req.amount, req.payment_date, req.account_id, req.payment_mode or "upi", req.notes or ""))

        cursor.execute("UPDATE borrows_lent SET balance_remaining = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (new_balance, new_status, req.borrow_id))

        if direction == "borrowed":
            cursor.execute("SELECT id FROM categories WHERE profile_id = ? AND name LIKE '%Debt%' LIMIT 1", (pid,))
            cat = cursor.fetchone()
            cat_id = cat["id"] if cat else None

            if req.account_id:
                cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.amount, req.account_id))

            cursor.execute("""
            INSERT INTO transactions (
                profile_id, date, time, type, amount, category_id, account_id, borrow_id,
                payment_mode, description, tags
            ) VALUES (?, ?, '12:00:00', 'expense', ?, ?, ?, ?, ?, ?, '#debtpayment')
            """, (
                pid, req.payment_date, req.amount, cat_id, req.account_id, req.borrow_id,
                req.payment_mode or "upi", f"Repaid debt to {debt['person_name']}: {req.notes}"
            ))
        else:
            cursor.execute("SELECT id FROM categories WHERE profile_id = ? AND name LIKE '%Repayment%' LIMIT 1", (pid,))
            cat = cursor.fetchone()
            cat_id = cat["id"] if cat else None

            if req.account_id:
                cursor.execute("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (req.amount, req.account_id))

            cursor.execute("""
            INSERT INTO transactions (
                profile_id, date, time, type, amount, category_id, account_id, borrow_id,
                payment_mode, description, tags
            ) VALUES (?, ?, '12:00:00', 'income', ?, ?, ?, ?, ?, ?, '#debtcollected')
            """, (
                pid, req.payment_date, req.amount, cat_id, req.account_id, req.borrow_id,
                req.payment_mode or "upi", f"Debt repayment received from {debt['person_name']}: {req.notes}"
            ))

        return {
            "success": True,
            "message": f"Recorded payment of ₹{req.amount:,.2f}. Remaining balance: ₹{new_balance:,.2f} ({new_status})",
            "balance_remaining": round(new_balance, 2),
            "status": new_status
        }

# ====================================================================
# Month-end Carry Forward APIs (Profile-Isolated)
# ====================================================================
@app.get("/api/carryover")
def get_carryover_status(
    profile_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    today = date.today()
    y = year or today.year
    m = month or today.month

    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        calc = calculate_month_carryover(cursor, y, m, pid)
        return calc

@app.post("/api/carryover/execute")
def trigger_month_carryover(
    req: CarryoverExecuteRequest,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, req.profile_id, x_profile_id, current_user["id"])
        result = execute_month_carryover(cursor, req.year, req.month, req.carry_forward_amount, req.notes or "", pid)
        return {
            "success": True,
            "message": f"Carried forward ₹{result['carried_forward_amount']:,.2f} from {result['month_name']} {result['year']} to next month!",
            "result": result
        }

@app.get("/api/carryover/history")
def get_carryover_history(
    profile_id: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        cursor.execute("SELECT * FROM monthly_carryovers WHERE profile_id = ? ORDER BY year DESC, month DESC", (pid,))
        history = [dict(row) for row in cursor.fetchall()]
        for h in history:
            h["month_name"] = calendar.month_name[h["month"]]
        return {"profile_id": pid, "history": history}

# ====================================================================
# Reports & Analytics APIs (Profile-Isolated)
# ====================================================================
@app.get("/api/reports/month-wise")
def report_month_wise(
    profile_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    today = date.today()
    y = year or today.year
    m = month or today.month

    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        report = get_month_wise_report(cursor, y, m, pid)
        return report

@app.get("/api/reports/day-wise")
def report_day_wise(
    profile_id: Optional[int] = None,
    year: Optional[int] = None,
    month: Optional[int] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    today = date.today()
    y = year or today.year
    m = month or today.month

    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        report = get_day_wise_report(cursor, y, m, pid)
        return report

@app.get("/api/reports/export")
def export_data(
    profile_id: Optional[int] = None,
    format: str = "json",
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])

        cursor.execute("SELECT * FROM transactions WHERE profile_id = ? ORDER BY date ASC", (pid,))
        transactions = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT * FROM accounts WHERE profile_id = ?", (pid,))
        accounts = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT * FROM cards WHERE profile_id = ?", (pid,))
        cards = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT * FROM loans WHERE profile_id = ?", (pid,))
        loans = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT * FROM borrows_lent WHERE profile_id = ?", (pid,))
        debts = [dict(r) for r in cursor.fetchall()]
        cursor.execute("SELECT * FROM monthly_carryovers WHERE profile_id = ?", (pid,))
        carryovers = [dict(r) for r in cursor.fetchall()]

        data = {
            "profile_id": pid,
            "exported_at": datetime.now().isoformat(),
            "transactions": transactions,
            "accounts": accounts,
            "cards": cards,
            "loans": loans,
            "debts": debts,
            "carryovers": carryovers
        }

        if format == "csv":
            import csv
            import io
            output = io.StringIO()
            writer = csv.writer(output)
            writer.writerow(["ID", "Date", "Type", "Amount", "Account", "Payment Mode", "Description", "Tags"])
            for t in transactions:
                writer.writerow([t["id"], t["date"], t["type"], t["amount"], t["account_id"], t["payment_mode"], t["description"], t["tags"]])
            return Response(content=output.getvalue(), media_type="text/csv", headers={"Content-Disposition": f"attachment; filename=paisatrack_export_p{pid}.csv"})

        return JSONResponse(content=data)

# ====================================================================
# Categories & Settings APIs
# ====================================================================
@app.get("/api/categories")
def get_categories(
    profile_id: Optional[int] = None,
    type: Optional[str] = None,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, profile_id, x_profile_id, current_user["id"])
        if type:
            cursor.execute("SELECT * FROM categories WHERE profile_id = ? AND type = ? ORDER BY name ASC", (pid, type))
        else:
            cursor.execute("SELECT * FROM categories WHERE profile_id = ? ORDER BY type DESC, name ASC", (pid,))
        return {"profile_id": pid, "categories": [dict(row) for row in cursor.fetchall()]}

@app.post("/api/categories")
def create_category(
    cat: CategoryCreate,
    x_profile_id: Optional[str] = Header(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        pid = resolve_profile_id(cursor, cat.profile_id, x_profile_id, current_user["id"])
        cursor.execute("""
        INSERT INTO categories (profile_id, name, type, icon, color, budget_limit)
        VALUES (?, ?, ?, ?, ?, ?)
        """, (pid, cat.name, cat.type, cat.icon or "tag", cat.color or "#64748b", cat.budget_limit or 0.0))
        cat_id = cursor.lastrowid
        cursor.execute("SELECT * FROM categories WHERE id = ?", (cat_id,))
        return {"success": True, "category": dict(cursor.fetchone())}

@app.put("/api/categories/{category_id}")
def update_category(
    category_id: int,
    cat: CategoryUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT c.* FROM categories c
        JOIN profiles p ON c.profile_id = p.id
        WHERE c.id = ? AND p.user_id = ?
        """, (category_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Category not found or access denied")

        fields = cat.model_dump(exclude_unset=True)
        if not fields:
            raise HTTPException(status_code=400, detail="No fields provided")
        set_clauses = [f"{k} = ?" for k in fields.keys()]
        values = list(fields.values()) + [category_id]
        cursor.execute(f"UPDATE categories SET {', '.join(set_clauses)} WHERE id = ?", values)
        cursor.execute("SELECT * FROM categories WHERE id = ?", (category_id,))
        row = cursor.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Category not found")
        return {"success": True, "category": dict(row)}

@app.delete("/api/categories/{category_id}")
def delete_category(
    category_id: int,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
        SELECT c.* FROM categories c
        JOIN profiles p ON c.profile_id = p.id
        WHERE c.id = ? AND p.user_id = ?
        """, (category_id, current_user["id"]))
        if not cursor.fetchone():
            raise HTTPException(status_code=404, detail="Category not found or access denied")

        cursor.execute("DELETE FROM categories WHERE id = ?", (category_id,))
        return {"success": True, "message": "Category deleted successfully"}

@app.get("/api/settings")
def get_settings():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT key, value FROM settings")
        settings_dict = {row["key"]: row["value"] for row in cursor.fetchall()}
        return {
            "settings": settings_dict,
            "available_currencies": CURRENCY_RATES
        }

@app.post("/api/settings")
def update_settings(settings_update: SettingsUpdate):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        if settings_update.currency_code and settings_update.currency_code in CURRENCY_RATES:
            code = settings_update.currency_code
            meta = CURRENCY_RATES[code]
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency_code', ?)", (code,))
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency_symbol', ?)", (meta["symbol"],))
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency_name', ?)", (meta["name"],))
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('locale', ?)", (meta["locale"],))

        if settings_update.theme:
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('theme', ?)", (settings_update.theme,))

        if settings_update.active_profile_id:
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('active_profile_id', ?)", (str(settings_update.active_profile_id),))

        if settings_update.carryover_mode:
            cursor.execute("INSERT OR REPLACE INTO settings (key, value) VALUES ('carryover_mode', ?)", (settings_update.carryover_mode,))

        return {"success": True, "message": "Settings updated successfully"}

@app.post("/api/reset-demo")
def reset_demo_data():
    seed_database(force_reseed=True)
    return {"success": True, "message": "Sample dummy financial dataset loaded successfully! (Profiles, Cards, Accounts, Loans & Transactions restored)"}

@app.post("/api/clear-demo")
def remove_demo_data():
    clear_dummy_data()
    return {"success": True, "message": "All dummy data removed successfully! You now have a clean slate with ₹0 balance."}

@app.get("/api/data-status")
def get_data_status():
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT COUNT(*) as trans_count FROM transactions")
        tc = cursor.fetchone()["trans_count"]
        cursor.execute("SELECT COUNT(*) as cards_count FROM cards")
        cc = cursor.fetchone()["cards_count"]
        cursor.execute("SELECT COUNT(*) as loans_count FROM loans")
        lc = cursor.fetchone()["loans_count"]
        cursor.execute("SELECT COUNT(*) as debts_count FROM borrows_lent")
        dc = cursor.fetchone()["debts_count"]
        cursor.execute("SELECT COUNT(*) as accounts_count FROM accounts")
        ac = cursor.fetchone()["accounts_count"]

        # If transaction count > 2 or cards > 1 or loans > 0, it has demo data
        has_dummy = bool(tc > 2 or cc > 1 or lc > 0 or dc > 0)
        return {
            "has_dummy_data": has_dummy,
            "transaction_count": tc,
            "account_count": ac,
            "card_count": cc,
            "loan_count": lc,
            "debt_count": dc
        }

# ====================================================================
# Static Files & Mobile Shell Mount
# ====================================================================
static_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")

@app.get("/")
def serve_index():
    index_path = os.path.join(static_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "PaisaTrack API is running. Build frontend in static/"}
