"""
Calculations module: Account balance updates, Month-end Carry Forward engine,
Month-wise and Day-wise analytics aggregations, and Multi-Profile data isolation.
"""
import sqlite3
from typing import Dict, Any, List, Optional
from datetime import datetime, date
import calendar

# Standard currency exchange rates against INR (Base currency)
CURRENCY_RATES = {
    "INR": {"rate": 1.0, "symbol": "₹", "name": "Indian Rupee", "locale": "en-IN"},
    "USD": {"rate": 0.012, "symbol": "$", "name": "US Dollar", "locale": "en-US"},
    "EUR": {"rate": 0.011, "symbol": "€", "name": "Euro", "locale": "de-DE"},
    "GBP": {"rate": 0.0095, "symbol": "£", "name": "British Pound", "locale": "en-GB"},
    "AED": {"rate": 0.044, "symbol": "AED", "name": "UAE Dirham", "locale": "en-AE"},
    "SGD": {"rate": 0.016, "symbol": "S$", "name": "Singapore Dollar", "locale": "en-SG"},
    "CAD": {"rate": 0.016, "symbol": "C$", "name": "Canadian Dollar", "locale": "en-CA"},
    "AUD": {"rate": 0.018, "symbol": "A$", "name": "Australian Dollar", "locale": "en-AU"}
}

def format_inr_currency(amount: float) -> str:
    """Format amount using standard Indian numbering system (Lakhs and Crores)."""
    if amount is None:
        return "₹0.00"
    is_negative = amount < 0
    amount = abs(amount)
    dollars = int(amount)
    cents = int(round((amount - dollars) * 100))
    s = str(dollars)
    if len(s) <= 3:
        res = s
    else:
        res = s[-3:]
        s = s[:-3]
        while len(s) > 2:
            res = s[-2:] + "," + res
            s = s[:-2]
        if s:
            res = s + "," + res
    res = f"{res}.{cents:02d}"
    return f"-₹{res}" if is_negative else f"₹{res}"

def sync_card_limits(cursor: sqlite3.Cursor, card_id: int, delta_amount: float) -> None:
    """
    Adjusts credit card available limit and synchronizes between Primary card and all linked Add-on cards.
    delta_amount: positive when spending (reduces available limit), negative when refunding/paying (increases limit).
    """
    cursor.execute("SELECT id, parent_card_id, is_addon, credit_limit, available_limit FROM cards WHERE id = ?", (card_id,))
    row = cursor.fetchone()
    if not row:
        return

    # If this is an add-on card, the master pool belongs to the parent card
    if row["is_addon"] == 1 and row["parent_card_id"]:
        primary_id = row["parent_card_id"]
    else:
        primary_id = row["id"]

    # Adjust master primary card available limit
    cursor.execute("""
    UPDATE cards 
    SET available_limit = available_limit - ?, updated_at = CURRENT_TIMESTAMP 
    WHERE id = ?
    """, (delta_amount, primary_id))

    # Fetch newly updated master available limit & credit limit
    cursor.execute("SELECT credit_limit, available_limit FROM cards WHERE id = ?", (primary_id,))
    primary_row = cursor.fetchone()
    if primary_row:
        new_avail = primary_row["available_limit"]
        limit = primary_row["credit_limit"]
        # Sync all child add-on cards to the exact same shared available limit and credit limit
        cursor.execute("""
        UPDATE cards 
        SET available_limit = ?, credit_limit = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE parent_card_id = ?
        """, (new_avail, limit, primary_id))

# ====================================================================
# Balance Adjustment Helpers
# ====================================================================
def apply_transaction_balance(cursor: sqlite3.Cursor, trans: Dict[str, Any], reverse: bool = False) -> None:
    """
    Applies or reverses the balance impact of a transaction across accounts, cards, loans, and debts.
    """
    factor = -1 if reverse else 1
    t_type = trans.get("type")
    amount = float(trans.get("amount", 0.0))
    acc_id = trans.get("account_id")
    dest_acc_id = trans.get("destination_account_id")
    card_id = trans.get("card_id")
    loan_id = trans.get("loan_id")
    borrow_id = trans.get("borrow_id")

    if t_type == "expense":
        # Deduct from account
        if acc_id:
            cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (factor * amount, acc_id))
        # If card is credit card, adjust available limit and sync across shared Add-on cards
        if card_id:
            sync_card_limits(cursor, card_id, factor * amount)
        # If paying towards loan EMI, reduce loan balance
        if loan_id:
            cursor.execute("UPDATE loans SET current_balance = MAX(0.0, current_balance - ?), updated_at = CURRENT_TIMESTAMP WHERE id = ?", (factor * amount, loan_id))
        # If repaying borrowed debt to friend/relative, reduce debt balance
        if borrow_id:
            cursor.execute("""
            UPDATE borrows_lent
            SET balance_remaining = MAX(0.0, balance_remaining - ?),
                status = CASE WHEN MAX(0.0, balance_remaining - ?) <= 0.01 THEN 'settled' ELSE 'partial' END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (factor * amount, factor * amount, borrow_id))

    elif t_type == "income":
        # Add to account
        if acc_id:
            cursor.execute("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (factor * amount, acc_id))
        # If card refund/cashback credited back to credit card
        if card_id:
            sync_card_limits(cursor, card_id, -factor * amount)
        # If this is repayment from a friend/relative (you lent to them), reduce their debt balance
        if borrow_id:
            cursor.execute("""
            UPDATE borrows_lent
            SET balance_remaining = MAX(0.0, balance_remaining - ?),
                status = CASE WHEN MAX(0.0, balance_remaining - ?) <= 0.01 THEN 'settled' ELSE 'partial' END,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
            """, (factor * amount, factor * amount, borrow_id))

    elif t_type == "transfer":
        # Deduct from source account, add to destination account
        if acc_id:
            cursor.execute("UPDATE accounts SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (factor * amount, acc_id))
        if dest_acc_id:
            cursor.execute("UPDATE accounts SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (factor * amount, dest_acc_id))


# ====================================================================
# Month-end Carry Forward Engine (Profile-Isolated)
# ====================================================================
def calculate_month_carryover(cursor: sqlite3.Cursor, year: int, month: int, profile_id: int = 1) -> Dict[str, Any]:
    """
    Calculates the financial standing and carry forward numbers for a specific month and profile.
    Opening Balance + Incomes - Expenses = Net Savings -> Closing Balance
    """
    month_str = f"{year:04d}-{month:02d}"

    # 1. Determine Opening Balance:
    prev_year = year if month > 1 else year - 1
    prev_month = month - 1 if month > 1 else 12

    cursor.execute("""
    SELECT carried_forward_amount FROM monthly_carryovers
    WHERE profile_id = ? AND year = ? AND month = ?
    """, (profile_id, prev_year, prev_month))
    prev_row = cursor.fetchone()

    if prev_row and prev_row["carried_forward_amount"] is not None:
        opening_balance = float(prev_row["carried_forward_amount"])
    else:
        # Sum of active accounts in this profile
        cursor.execute("SELECT COALESCE(SUM(balance), 0.0) as total_bal FROM accounts WHERE profile_id = ? AND is_active = 1", (profile_id,))
        acc_bal = float(cursor.fetchone()["total_bal"])
        opening_balance = acc_bal

    # 2. Total Incomes in this month for profile
    cursor.execute("""
    SELECT COALESCE(SUM(amount), 0.0) as total
    FROM transactions
    WHERE profile_id = ? AND type = 'income' AND strftime('%Y-%m', date) = ?
    """, (profile_id, month_str))
    total_income = float(cursor.fetchone()["total"])

    # 3. Total Expenses in this month for profile
    cursor.execute("""
    SELECT COALESCE(SUM(amount), 0.0) as total
    FROM transactions
    WHERE profile_id = ? AND type = 'expense' AND strftime('%Y-%m', date) = ?
    """, (profile_id, month_str))
    total_expense = float(cursor.fetchone()["total"])

    # 4. Total Loan EMIs paid in this month
    cursor.execute("""
    SELECT COALESCE(SUM(amount), 0.0) as total
    FROM transactions
    WHERE profile_id = ? AND type = 'expense' AND loan_id IS NOT NULL AND strftime('%Y-%m', date) = ?
    """, (profile_id, month_str))
    total_loan_emi = float(cursor.fetchone()["total"])

    # 5. Total Debt Repayments paid in this month
    cursor.execute("""
    SELECT COALESCE(SUM(amount), 0.0) as total
    FROM transactions
    WHERE profile_id = ? AND type = 'expense' AND borrow_id IS NOT NULL AND strftime('%Y-%m', date) = ?
    """, (profile_id, month_str))
    total_debt_paid = float(cursor.fetchone()["total"])

    # Net calculations
    net_savings = total_income - total_expense
    closing_balance = opening_balance + net_savings
    savings_rate = (net_savings / total_income * 100.0) if total_income > 0 else 0.0

    # Check existing carryover record
    cursor.execute("""
    SELECT * FROM monthly_carryovers WHERE profile_id = ? AND year = ? AND month = ?
    """, (profile_id, year, month))
    existing_record = cursor.fetchone()

    status = existing_record["status"] if existing_record else "open"
    carried_forward_amount = existing_record["carried_forward_amount"] if existing_record else closing_balance

    return {
        "profile_id": profile_id,
        "year": year,
        "month": month,
        "month_name": calendar.month_name[month],
        "month_str": month_str,
        "opening_balance": round(opening_balance, 2),
        "total_income": round(total_income, 2),
        "total_expense": round(total_expense, 2),
        "total_loan_emi": round(total_loan_emi, 2),
        "total_debt_paid": round(total_debt_paid, 2),
        "net_savings": round(net_savings, 2),
        "savings_rate_percent": round(savings_rate, 1),
        "closing_balance": round(closing_balance, 2),
        "carried_forward_amount": round(carried_forward_amount, 2),
        "status": status,
        "notes": existing_record["notes"] if existing_record else "",
        "closed_at": existing_record["closed_at"] if existing_record else None
    }


def execute_month_carryover(cursor: sqlite3.Cursor, year: int, month: int, carry_forward_amount: Optional[float] = None, notes: str = "", profile_id: int = 1) -> Dict[str, Any]:
    """
    Finalizes the month end for a specific profile and carries forward closing balance to next month.
    """
    summary = calculate_month_carryover(cursor, year, month, profile_id)
    amount_to_carry = carry_forward_amount if carry_forward_amount is not None else summary["closing_balance"]

    now_str = datetime.now().isoformat()

    cursor.execute("""
    INSERT INTO monthly_carryovers (
        profile_id, year, month, opening_balance, total_income, total_expense,
        total_loan_emi, total_debt_paid, closing_balance,
        carried_forward_amount, status, notes, closed_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'carried_forward', ?, ?)
    ON CONFLICT(profile_id, year, month) DO UPDATE SET
        opening_balance = excluded.opening_balance,
        total_income = excluded.total_income,
        total_expense = excluded.total_expense,
        total_loan_emi = excluded.total_loan_emi,
        total_debt_paid = excluded.total_debt_paid,
        closing_balance = excluded.closing_balance,
        carried_forward_amount = excluded.carried_forward_amount,
        status = 'carried_forward',
        notes = excluded.notes,
        closed_at = excluded.closed_at
    """, (
        profile_id, year, month, summary["opening_balance"], summary["total_income"], summary["total_expense"],
        summary["total_loan_emi"], summary["total_debt_paid"], summary["closing_balance"],
        amount_to_carry, notes or "Month-end net balance rolled over", now_str
    ))

    # Prepare next month's opening balance record
    next_year = year if month < 12 else year + 1
    next_month = month + 1 if month < 12 else 1

    cursor.execute("""
    INSERT INTO monthly_carryovers (
        profile_id, year, month, opening_balance, total_income, total_expense,
        total_loan_emi, total_debt_paid, closing_balance,
        carried_forward_amount, status, notes
    ) VALUES (?, ?, ?, ?, 0.0, 0.0, 0.0, 0.0, ?, ?, 'open', 'Carried forward from previous month')
    ON CONFLICT(profile_id, year, month) DO UPDATE SET
        opening_balance = excluded.opening_balance
    """, (profile_id, next_year, next_month, amount_to_carry, amount_to_carry, amount_to_carry))

    return calculate_month_carryover(cursor, year, month, profile_id)


# ====================================================================
# Month-wise Analytics Aggregations (Profile-Isolated)
# ====================================================================
def get_month_wise_report(cursor: sqlite3.Cursor, year: int, month: int, profile_id: int = 1) -> Dict[str, Any]:
    """
    Generates full month-wise report isolated per profile.
    """
    month_str = f"{year:04d}-{month:02d}"
    carryover_info = calculate_month_carryover(cursor, year, month, profile_id)

    # 1. Category breakdown (Expenses)
    cursor.execute("""
    SELECT
        c.id as category_id,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color,
        c.budget_limit,
        COALESCE(SUM(t.amount), 0.0) as total_amount,
        COUNT(t.id) as transaction_count
    FROM categories c
    JOIN transactions t ON c.id = t.category_id
        AND t.profile_id = ?
        AND t.type = 'expense'
        AND strftime('%Y-%m', t.date) = ?
    WHERE c.type = 'expense' AND (c.profile_id = ? OR c.profile_id = 1)
    GROUP BY c.id
    HAVING total_amount > 0
    ORDER BY total_amount DESC
    """, (profile_id, month_str, profile_id))
    expense_categories = [dict(row) for row in cursor.fetchall()]

    total_expense = carryover_info["total_expense"]
    for cat in expense_categories:
        cat["percentage"] = round((cat["total_amount"] / total_expense * 100.0), 1) if total_expense > 0 else 0.0
        cat["budget_used_percent"] = round((cat["total_amount"] / cat["budget_limit"] * 100.0), 1) if cat["budget_limit"] > 0 else 0.0

    # 2. Category breakdown (Incomes)
    cursor.execute("""
    SELECT
        c.id as category_id,
        c.name as category_name,
        c.icon as category_icon,
        c.color as category_color,
        COALESCE(SUM(t.amount), 0.0) as total_amount,
        COUNT(t.id) as transaction_count
    FROM categories c
    JOIN transactions t ON c.id = t.category_id
        AND t.profile_id = ?
        AND t.type = 'income'
        AND strftime('%Y-%m', t.date) = ?
    WHERE c.type = 'income' AND (c.profile_id = ? OR c.profile_id = 1)
    GROUP BY c.id
    HAVING total_amount > 0
    ORDER BY total_amount DESC
    """, (profile_id, month_str, profile_id))
    income_categories = [dict(row) for row in cursor.fetchall()]

    # 3. Last 6 Months Trends (Income vs Expense)
    trends = []
    current_dt = date(year, month, 1)
    for i in range(5, -1, -1):
        m = ((current_dt.month - 1 - i) % 12) + 1
        y = current_dt.year + ((current_dt.month - 1 - i) // 12)
        m_str = f"{y:04d}-{m:02d}"

        cursor.execute("""
        SELECT
            COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0.0) as inc,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0.0) as exp
        FROM transactions
        WHERE profile_id = ? AND strftime('%Y-%m', date) = ?
        """, (profile_id, m_str))
        row = cursor.fetchone()
        inc = float(row["inc"])
        exp = float(row["exp"])
        trends.append({
            "year": y,
            "month": m,
            "month_label": f"{calendar.month_abbr[m]} '{str(y)[-2:]}",
            "income": round(inc, 2),
            "expense": round(exp, 2),
            "net": round(inc - exp, 2)
        })

    return {
        "summary": carryover_info,
        "expense_categories": expense_categories,
        "income_categories": income_categories,
        "monthly_trends": trends
    }


# ====================================================================
# Day-wise Analytics Aggregations (Profile-Isolated)
# ====================================================================
def get_day_wise_report(cursor: sqlite3.Cursor, year: int, month: int, profile_id: int = 1) -> Dict[str, Any]:
    """
    Generates day-wise report for the requested month and profile.
    """
    month_str = f"{year:04d}-{month:02d}"
    num_days = calendar.monthrange(year, month)[1]

    cursor.execute("""
    SELECT
        date,
        COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0.0) as daily_expense,
        COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0.0) as daily_income,
        COUNT(id) as transaction_count
    FROM transactions
    WHERE profile_id = ? AND strftime('%Y-%m', date) = ?
    GROUP BY date
    """, (profile_id, month_str))
    db_days = {row["date"]: dict(row) for row in cursor.fetchall()}

    days_list = []
    total_month_expense = 0.0
    total_month_income = 0.0
    active_days_count = 0
    peak_expense = 0.0
    peak_date = None

    for day in range(1, num_days + 1):
        d_str = f"{year:04d}-{month:02d}-{day:02d}"
        weekday = calendar.day_abbr[date(year, month, day).weekday()]
        entry = db_days.get(d_str, {"daily_expense": 0.0, "daily_income": 0.0, "transaction_count": 0})
        exp = float(entry["daily_expense"])
        inc = float(entry["daily_income"])
        cnt = int(entry["transaction_count"])

        if exp > peak_expense:
            peak_expense = exp
            peak_date = d_str

        total_month_expense += exp
        total_month_income += inc
        if exp > 0 or inc > 0:
            active_days_count += 1

        days_list.append({
            "date": d_str,
            "day": day,
            "weekday": weekday,
            "expense": round(exp, 2),
            "income": round(inc, 2),
            "net": round(inc - exp, 2),
            "transaction_count": cnt
        })

    avg_daily_expense = (total_month_expense / num_days) if num_days > 0 else 0.0

    peak_day_transactions = []
    if peak_date:
        cursor.execute("""
        SELECT t.*, c.name as category_name, c.color as category_color, a.name as account_name
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        LEFT JOIN accounts a ON t.account_id = a.id
        WHERE t.profile_id = ? AND t.date = ? AND t.type = 'expense'
        ORDER BY t.amount DESC
        LIMIT 5
        """, (profile_id, peak_date))
        peak_day_transactions = [dict(row) for row in cursor.fetchall()]

    return {
        "profile_id": profile_id,
        "year": year,
        "month": month,
        "month_name": calendar.month_name[month],
        "total_days": num_days,
        "active_days": active_days_count,
        "total_expense": round(total_month_expense, 2),
        "total_income": round(total_month_income, 2),
        "average_daily_expense": round(avg_daily_expense, 2),
        "peak_day": {
            "date": peak_date,
            "expense": round(peak_expense, 2),
            "top_transactions": peak_day_transactions
        },
        "days": days_list
    }
