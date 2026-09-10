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

# ====================================================================
# 4. Investments & Portfolio Analytics
# ====================================================================
ASSET_TYPE_META = {
    "mutual_fund": {"label": "Mutual Funds (SIP/Lumpsum)", "color": "#10b981", "icon": "pie-chart"},
    "stocks": {"label": "Stocks & Direct Equities", "color": "#3b82f6", "icon": "trending-up"},
    "fixed_deposit": {"label": "Fixed & Recurring Deposits", "color": "#f59e0b", "icon": "lock"},
    "gold": {"label": "Gold & Sovereign Gold Bonds", "color": "#eab308", "icon": "award"},
    "epf_ppf": {"label": "Provident Funds (EPF/PPF/NPS)", "color": "#8b5cf6", "icon": "shield"},
    "real_estate": {"label": "Real Estate & REITs", "color": "#06b6d4", "icon": "home"},
    "crypto": {"label": "Digital Assets / Crypto", "color": "#ec4899", "icon": "zap"},
    "other": {"label": "Other Alternate Assets", "color": "#64748b", "icon": "tag"}
}

def calculate_investment_summary(cursor: sqlite3.Cursor, profile_id: int) -> Dict[str, Any]:
    """Calculates overall investment portfolio returns, monthly SIPs, and asset allocation breakdown."""
    cursor.execute("""
    SELECT i.*, a.name as linked_account_name
    FROM investments i
    LEFT JOIN accounts a ON i.linked_account_id = a.id
    WHERE i.profile_id = ? AND i.status = 'active'
    ORDER BY i.current_value DESC, i.id DESC
    """, (profile_id,))
    investments = [dict(row) for row in cursor.fetchall()]

    total_invested = sum(i["invested_amount"] for i in investments)
    current_value = sum(i["current_value"] for i in investments)
    total_returns = current_value - total_invested
    returns_pct = (total_returns / total_invested * 100.0) if total_invested > 0 else 0.0

    monthly_sip_total = sum(i["sip_amount"] for i in investments if i.get("sip_enabled") == 1)

    # Asset type distribution
    type_totals: Dict[str, Dict[str, Any]] = {}
    for i in investments:
        atype = i.get("asset_type") or "other"
        meta = ASSET_TYPE_META.get(atype, ASSET_TYPE_META["other"])
        if atype not in type_totals:
            type_totals[atype] = {
                "asset_type": atype,
                "label": meta["label"],
                "color": meta["color"],
                "icon": meta["icon"],
                "count": 0,
                "invested_amount": 0.0,
                "current_value": 0.0,
                "percentage": 0.0
            }
        type_totals[atype]["count"] += 1
        type_totals[atype]["invested_amount"] += i["invested_amount"]
        type_totals[atype]["current_value"] += i["current_value"]

    asset_breakdown = list(type_totals.values())
    for item in asset_breakdown:
        item["invested_amount"] = round(item["invested_amount"], 2)
        item["current_value"] = round(item["current_value"], 2)
        item["percentage"] = round((item["current_value"] / current_value * 100.0), 1) if current_value > 0 else 0.0

    # Sort breakdown descending by current value
    asset_breakdown.sort(key=lambda x: x["current_value"], reverse=True)

    return {
        "profile_id": profile_id,
        "count": len(investments),
        "total_invested": round(total_invested, 2),
        "current_value": round(current_value, 2),
        "total_returns": round(total_returns, 2),
        "returns_percentage": round(returns_pct, 2),
        "monthly_sip_total": round(monthly_sip_total, 2),
        "asset_breakdown": asset_breakdown,
        "investments": investments
    }

# ====================================================================
# 5. Salary-Based Financial Planning & Live Variance Tracker
# ====================================================================
def calculate_salary_plan_analysis(cursor: sqlite3.Cursor, profile_id: int, year: int, month: int) -> Dict[str, Any]:
    """
    Computes user's budget allocation plan from salary (Needs, Wants, Debts, Savings/Emergency, Investments)
    and tracks actual current-month expenditures against the targets with variance and financial wellness score.
    """
    # 1. Fetch or initialize salary plan configuration
    cursor.execute("SELECT * FROM salary_plans WHERE profile_id = ?", (profile_id,))
    plan_row = cursor.fetchone()
    if plan_row:
        plan = dict(plan_row)
    else:
        # Check if user had salary income logged this or last month
        cursor.execute("""
        SELECT COALESCE(SUM(amount), 0.0) as salary_sum FROM transactions
        WHERE profile_id = ? AND type = 'income' AND description LIKE '%salary%'
        """, (profile_id,))
        detected_salary = float(cursor.fetchone()["salary_sum"])
        salary_val = detected_salary if detected_salary > 0 else 75000.0

        cursor.execute("""
        INSERT OR REPLACE INTO salary_plans (profile_id, monthly_salary, rule_type, needs_percent, wants_percent, savings_percent, debts_percent, emergency_fund_target_months)
        VALUES (?, ?, '50_30_20', 50.0, 30.0, 10.0, 10.0, 6)
        """, (profile_id, salary_val))
        plan = {
            "profile_id": profile_id,
            "monthly_salary": salary_val,
            "rule_type": "50_30_20",
            "needs_percent": 50.0,
            "wants_percent": 30.0,
            "savings_percent": 10.0,
            "debts_percent": 10.0,
            "emergency_fund_target_months": 6
        }

    monthly_salary = float(plan["monthly_salary"])
    needs_pct = float(plan["needs_percent"])
    wants_pct = float(plan["wants_percent"])
    savings_pct = float(plan["savings_percent"])
    debts_pct = float(plan["debts_percent"])
    efund_months = int(plan.get("emergency_fund_target_months") or 6)

    # Computed Target Budgets (₹)
    budget_needs = round(monthly_salary * (needs_pct / 100.0), 2)
    budget_wants = round(monthly_salary * (wants_pct / 100.0), 2)
    budget_savings = round(monthly_salary * (savings_pct / 100.0), 2)
    budget_debts = round(monthly_salary * (debts_pct / 100.0), 2)

    # 2. Actual Monthly Spending in Current Month by Classification
    start_date = f"{year:04d}-{month:02d}-01"
    num_days = calendar.monthrange(year, month)[1]
    end_date = f"{year:04d}-{month:02d}-{num_days:02d}"

    # Expenses categorized as 'need'
    cursor.execute("""
    SELECT COALESCE(SUM(t.amount), 0.0) as sum_needs
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.profile_id = ? AND t.type = 'expense'
      AND t.date BETWEEN ? AND ?
      AND (c.classification = 'need' OR c.classification IS NULL)
    """, (profile_id, start_date, end_date))
    actual_needs = float(cursor.fetchone()["sum_needs"])

    # Expenses categorized as 'want'
    cursor.execute("""
    SELECT COALESCE(SUM(t.amount), 0.0) as sum_wants
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.profile_id = ? AND t.type = 'expense'
      AND t.date BETWEEN ? AND ?
      AND c.classification = 'want'
    """, (profile_id, start_date, end_date))
    actual_wants = float(cursor.fetchone()["sum_wants"])

    # Debts paid this month (Loan EMI transactions + Borrow repayments paid)
    cursor.execute("""
    SELECT COALESCE(SUM(t.amount), 0.0) as sum_debt_trans
    FROM transactions t
    LEFT JOIN categories c ON t.category_id = c.id
    WHERE t.profile_id = ? AND t.type = 'expense'
      AND t.date BETWEEN ? AND ?
      AND (t.loan_id IS NOT NULL OR t.borrow_id IS NOT NULL OR c.classification = 'debt')
    """, (profile_id, start_date, end_date))
    actual_debts = float(cursor.fetchone()["sum_debt_trans"])

    # Total active monthly loan EMI obligations
    cursor.execute("""
    SELECT COALESCE(SUM(emi_amount), 0.0) as total_active_emi
    FROM loans WHERE profile_id = ? AND status = 'active'
    """, (profile_id,))
    total_active_emi = float(cursor.fetchone()["total_active_emi"])

    # Investments and savings committed this month
    cursor.execute("""
    SELECT COALESCE(SUM(t.amount), 0.0) as sum_invest_trans
    FROM transactions t
    JOIN categories c ON t.category_id = c.id
    WHERE t.profile_id = ? AND t.type = 'expense'
      AND t.date BETWEEN ? AND ?
      AND c.classification = 'investment'
    """, (profile_id, start_date, end_date))
    actual_invest_trans = float(cursor.fetchone()["sum_invest_trans"])

    cursor.execute("""
    SELECT COALESCE(SUM(sip_amount), 0.0) as monthly_sip
    FROM investments WHERE profile_id = ? AND status = 'active' AND sip_enabled = 1
    """, (profile_id,))
    monthly_sip_commitment = float(cursor.fetchone()["monthly_sip"])
    actual_savings = max(actual_invest_trans, monthly_sip_commitment)

    # 3. Emergency Fund Analysis
    # Essential monthly baseline = actual needs if > 0 else planned needs
    essential_monthly_burn = actual_needs if actual_needs > 0 else budget_needs
    emergency_target_amount = round(essential_monthly_burn * efund_months, 2)

    # Liquid reserves available (bank + cash accounts)
    cursor.execute("""
    SELECT COALESCE(SUM(balance), 0.0) as liquid_total
    FROM accounts WHERE profile_id = ? AND is_active = 1 AND type IN ('bank', 'cash', 'savings', 'wallet')
    """, (profile_id,))
    current_liquid_reserves = max(0.0, float(cursor.fetchone()["liquid_total"]))

    runway_months = round(current_liquid_reserves / essential_monthly_burn, 1) if essential_monthly_burn > 0 else 0.0
    emergency_gap = max(0.0, round(emergency_target_amount - current_liquid_reserves, 2))
    recommended_emergency_sip = round(min(budget_savings, emergency_gap / 12), 2) if emergency_gap > 0 else 0.0

    # 4. Financial Goals Progress
    cursor.execute("""
    SELECT g.*, a.name as linked_account_name, i.name as linked_investment_name
    FROM financial_goals g
    LEFT JOIN accounts a ON g.linked_account_id = a.id
    LEFT JOIN investments i ON g.linked_investment_id = i.id
    WHERE g.profile_id = ?
    ORDER BY CASE g.priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, g.id ASC
    """, (profile_id,))
    goals = [dict(row) for row in cursor.fetchall()]
    total_goals_target = sum(g["target_amount"] for g in goals)
    total_goals_saved = sum(g["current_amount"] for g in goals)
    goals_progress_pct = round((total_goals_saved / total_goals_target * 100.0), 1) if total_goals_target > 0 else 0.0

    # 5. Buckets Comparison & Variance
    buckets = [
        {
            "key": "needs",
            "title": "Essential Needs",
            "icon": "shield-check",
            "color": "#10b981",
            "target_percent": needs_pct,
            "budget": budget_needs,
            "actual": round(actual_needs, 2),
            "remaining": round(budget_needs - actual_needs, 2),
            "percent_used": round((actual_needs / budget_needs * 100.0), 1) if budget_needs > 0 else 0.0,
            "status": "normal" if actual_needs <= budget_needs else "overspent"
        },
        {
            "key": "wants",
            "title": "Lifestyle Wants",
            "icon": "sparkles",
            "color": "#8b5cf6",
            "target_percent": wants_pct,
            "budget": budget_wants,
            "actual": round(actual_wants, 2),
            "remaining": round(budget_wants - actual_wants, 2),
            "percent_used": round((actual_wants / budget_wants * 100.0), 1) if budget_wants > 0 else 0.0,
            "status": "normal" if actual_wants <= budget_wants else "overspent"
        },
        {
            "key": "debts",
            "title": "Debt Clear & EMIs",
            "icon": "landmark",
            "color": "#f97316",
            "target_percent": debts_pct,
            "budget": budget_debts,
            "actual": round(actual_debts, 2),
            "active_emi_obligation": round(total_active_emi, 2),
            "remaining": round(budget_debts - actual_debts, 2),
            "percent_used": round((actual_debts / budget_debts * 100.0), 1) if budget_debts > 0 else 0.0,
            "status": "normal"
        },
        {
            "key": "savings",
            "title": "Investments & Goals",
            "icon": "trending-up",
            "color": "#3b82f6",
            "target_percent": savings_pct,
            "budget": budget_savings,
            "actual": round(actual_savings, 2),
            "monthly_sip": round(monthly_sip_commitment, 2),
            "remaining": round(budget_savings - actual_savings, 2),
            "percent_used": round((actual_savings / budget_savings * 100.0), 1) if budget_savings > 0 else 0.0,
            "status": "achieved" if actual_savings >= budget_savings else "in_progress"
        }
    ]

    # 6. Financial Health Score (0 - 100)
    score = 0
    # Needs control (30 pts max)
    if budget_needs > 0:
        needs_ratio = actual_needs / budget_needs
        score += int(30 * max(0.0, min(1.0, 1.2 - needs_ratio * 0.4)))
    else:
        score += 20

    # Wants discipline (25 pts max)
    if budget_wants > 0:
        wants_ratio = actual_wants / budget_wants
        score += int(25 * max(0.0, min(1.0, 1.1 - wants_ratio * 0.5)))
    else:
        score += 20

    # Emergency fund cushion (20 pts max)
    if runway_months >= 6.0:
        score += 20
    elif runway_months >= 3.0:
        score += int(10 + (runway_months - 3.0) / 3.0 * 10)
    else:
        score += int(max(0, runway_months / 3.0 * 10))

    # Investments and Savings progress (15 pts max)
    if budget_savings > 0:
        savings_ratio = actual_savings / budget_savings
        score += int(15 * min(1.0, savings_ratio))
    else:
        score += 10

    # Debt ratio control (10 pts max)
    if total_active_emi <= budget_debts:
        score += 10
    else:
        score += int(max(0, 10 - ((total_active_emi - budget_debts) / (budget_debts or 1)) * 5))

    health_score = max(10, min(100, score))
    if health_score >= 80:
        health_grade = "Excellent"
        health_color = "#10b981"
    elif health_score >= 65:
        health_grade = "Good"
        health_color = "#3b82f6"
    elif health_score >= 50:
        health_grade = "Moderate"
        health_color = "#f59e0b"
    else:
        health_grade = "Needs Attention"
        health_color = "#ef4444"

    # Actionable smart suggestions
    insights = []
    if runway_months < 3.0:
        insights.append(f"⚠️ Emergency fund runway is {runway_months} months. We recommend allocating ₹{recommended_emergency_sip:,.0f}/mo to reach 3-6 months safety runway.")
    elif runway_months >= 6.0:
        insights.append(f"✅ Solid safety cushion: You have {runway_months} months of essential runway ready!")

    if actual_wants > budget_wants:
        insights.append(f"🔴 Lifestyle wants (₹{actual_wants:,.0f}) exceeded target budget (₹{budget_wants:,.0f}) by ₹{actual_wants - budget_wants:,.0f}.")
    else:
        insights.append(f"💡 You have ₹{max(0.0, budget_wants - actual_wants):,.0f} remaining in this month's wants allowance.")

    if total_active_emi > budget_debts:
        insights.append(f"⚠️ Active loan EMIs (₹{total_active_emi:,.0f}) take up more than your planned {debts_pct}% debt allocation.")

    if actual_savings >= budget_savings and budget_savings > 0:
        insights.append("🎉 Monthly investment target achieved! Your wealth compounding is on track.")

    return {
        "profile_id": profile_id,
        "year": year,
        "month": month,
        "plan": plan,
        "monthly_salary": monthly_salary,
        "health_score": health_score,
        "health_grade": health_grade,
        "health_color": health_color,
        "buckets": buckets,
        "emergency_fund": {
            "target_months": efund_months,
            "monthly_essential_burn": essential_monthly_burn,
            "target_amount": emergency_target_amount,
            "current_liquid_reserves": current_liquid_reserves,
            "runway_months": runway_months,
            "gap": emergency_gap,
            "recommended_monthly_contribution": recommended_emergency_sip
        },
        "goals": {
            "count": len(goals),
            "total_target": round(total_goals_target, 2),
            "total_saved": round(total_goals_saved, 2),
            "progress_percent": goals_progress_pct,
            "items": goals
        },
        "insights": insights
    }

