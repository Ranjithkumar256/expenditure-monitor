"""
Test suite for PaisaTrack personal finance and expenditure monitor.
"""
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.seed_data import seed_database

@pytest.fixture(scope="module", autouse=True)
def setup_test_db():
    seed_database(force_reseed=True)

client = TestClient(app)

def test_health():
    res = client.get("/api/health")
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "ok"
    assert data["app"] == "PaisaTrack"

def test_dashboard_summary():
    res = client.get("/api/dashboard")
    assert res.status_code == 200
    data = res.json()
    assert "total_networth" in data
    assert "carryover" in data
    assert "accounts" in data
    assert len(data["accounts"]) >= 3
    assert len(data["recent_transactions"]) > 0

def test_transactions_crud():
    # 1. Fetch valid category
    res_cat = client.get("/api/categories?type=expense")
    assert res_cat.status_code == 200
    cat_id = res_cat.json()["categories"][0]["id"]

    # 2. Create an expense
    payload = {
        "date": "2026-09-21",
        "type": "expense",
        "amount": 2500.0,
        "account_id": 1, # HDFC Account
        "category_id": cat_id,
        "payment_mode": "upi",
        "description": "Test Grocery Order",
        "tags": "#test,#groceries"
    }
    res = client.post("/api/transactions", json=payload)
    assert res.status_code == 200
    created = res.json()["transaction"]
    trans_id = created["id"]
    assert created["amount"] == 2500.0

    # 2. Fetch transactions list
    res = client.get("/api/transactions?search=Test Grocery")
    assert res.status_code == 200
    data = res.json()
    assert data["count"] >= 1

    # 3. Update the expense
    res = client.put(f"/api/transactions/{trans_id}", json={"amount": 2800.0, "description": "Updated Grocery Order"})
    assert res.status_code == 200
    updated = res.json()["transaction"]
    assert updated["amount"] == 2800.0
    assert updated["description"] == "Updated Grocery Order"

    # 4. Delete the expense
    res = client.delete(f"/api/transactions/{trans_id}")
    assert res.status_code == 200
    assert res.json()["success"] is True

def test_account_transfer():
    # Transfer ₹5,000 from HDFC (1) to SBI (2)
    res = client.get("/api/accounts")
    accounts_before = {a["id"]: a["balance"] for a in res.json()["accounts"]}

    payload = {
        "from_account_id": 1,
        "to_account_id": 2,
        "amount": 5000.0,
        "date": "2026-09-22",
        "notes": "Emergency buffer transfer"
    }
    res = client.post("/api/accounts/transfer", json=payload)
    assert res.status_code == 200

    res = client.get("/api/accounts")
    accounts_after = {a["id"]: a["balance"] for a in res.json()["accounts"]}

    assert accounts_after[1] == accounts_before[1] - 5000.0
    assert accounts_after[2] == accounts_before[2] + 5000.0

def test_credit_card_payment():
    payload = {
        "card_id": 1, # HDFC Regalia
        "from_account_id": 1, # HDFC Account
        "amount": 10000.0,
        "date": "2026-09-23",
        "notes": "Monthly card settlement"
    }
    res = client.post("/api/cards/pay", json=payload)
    assert res.status_code == 200
    assert res.json()["success"] is True

def test_loan_emi_payment():
    # Fetch car loan initial balance
    res = client.get("/api/loans")
    loans = res.json()["loans"]
    car_loan = next(l for l in loans if l["id"] == 1)
    initial_bal = car_loan["current_balance"]

    payload = {
        "loan_id": 1,
        "from_account_id": 1,
        "amount": 14250.0,
        "date": "2026-09-24",
        "notes": "Regular monthly EMI"
    }
    res = client.post("/api/loans/pay-emi", json=payload)
    assert res.status_code == 200
    assert res.json()["success"] is True

    res = client.get("/api/loans")
    updated_car_loan = next(l for l in res.json()["loans"] if l["id"] == 1)
    assert updated_car_loan["current_balance"] == initial_bal - 14250.0

def test_borrow_repay():
    # Repay Cousin Rajesh
    res = client.get("/api/borrows")
    rajesh_debt = next(d for d in res.json()["borrowed_list"] if d["id"] == 1)
    bal_before = rajesh_debt["balance_remaining"]

    payload = {
        "borrow_id": 1,
        "amount": 5000.0,
        "payment_date": "2026-09-25",
        "account_id": 1,
        "payment_mode": "upi",
        "notes": "UPI repayment"
    }
    res = client.post("/api/borrows/repay", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["balance_remaining"] == bal_before - 5000.0

def test_month_carryover_engine():
    # Check carryover calculations for current month (9/2026)
    res = client.get("/api/carryover?year=2026&month=9")
    assert res.status_code == 200
    carry = res.json()
    assert carry["year"] == 2026
    assert carry["month"] == 9
    assert "opening_balance" in carry
    assert "total_income" in carry
    assert "total_expense" in carry
    assert "net_savings" in carry
    assert "closing_balance" in carry

    # Execute carryover for month 9
    exec_payload = {
        "year": 2026,
        "month": 9,
        "notes": "Month closed and carried forward"
    }
    res = client.post("/api/carryover/execute", json=exec_payload)
    assert res.status_code == 200
    assert res.json()["success"] is True

    # Next month (10/2026) opening balance should match carried_forward_amount
    res_next = client.get("/api/carryover?year=2026&month=10")
    assert res_next.status_code == 200
    next_carry = res_next.json()
    assert next_carry["opening_balance"] == res.json()["result"]["carried_forward_amount"]

def test_month_wise_report():
    res = client.get("/api/reports/month-wise?year=2026&month=9")
    assert res.status_code == 200
    report = res.json()
    assert "summary" in report
    assert "expense_categories" in report
    assert "monthly_trends" in report
    assert len(report["monthly_trends"]) == 6

def test_day_wise_report():
    res = client.get("/api/reports/day-wise?year=2026&month=9")
    assert res.status_code == 200
    report = res.json()
    assert "days" in report
    assert report["total_days"] == 30
    assert len(report["days"]) == 30
    assert "peak_day" in report
    assert "average_daily_expense" in report

def test_settings_and_currencies():
    res = client.get("/api/settings")
    assert res.status_code == 200
    data = res.json()
    assert "INR" in data["available_currencies"]
    assert "USD" in data["available_currencies"]
    assert "EUR" in data["available_currencies"]

    # Switch to USD
    res = client.post("/api/settings", json={"currency_code": "USD"})
    assert res.status_code == 200

    res = client.get("/api/settings")
    assert res.json()["settings"]["currency_code"] == "USD"

    # Switch back to INR default
    client.post("/api/settings", json={"currency_code": "INR"})


def test_profiles_crud():
    # 1. Get initial profiles list
    res = client.get("/api/profiles")
    assert res.status_code == 200
    data = res.json()
    assert "profiles" in data
    assert len(data["profiles"]) >= 2
    p1 = next((p for p in data["profiles"] if p["id"] == 1), None)
    p2 = next((p for p in data["profiles"] if p["id"] == 2), None)
    assert p1 is not None
    assert p2 is not None
    assert p1["name"] == "Personal Finances"
    assert p2["name"] == "Business & Consulting"

    # 2. Add a new profile (Profile 3)
    new_profile_payload = {
        "name": "Family Vacation & Trips",
        "description": "Travel and holiday savings & expenses",
        "color": "#06b6d4",
        "icon": "plane",
        "currency_code": "INR"
    }
    res = client.post("/api/profiles", json=new_profile_payload)
    assert res.status_code == 200
    created = res.json()["profile"]
    prof_id = created["id"]
    assert created["name"] == "Family Vacation & Trips"
    assert created["icon"] == "plane"

    # 3. Fetch specific profile
    res = client.get(f"/api/profiles/{prof_id}")
    assert res.status_code == 200
    assert res.json()["profile"]["id"] == prof_id

    # 4. Modify/Edit the profile
    update_payload = {
        "name": "Holiday & Leisure",
        "description": "Updated holiday budget",
        "color": "#8b5cf6"
    }
    res = client.put(f"/api/profiles/{prof_id}", json=update_payload)
    assert res.status_code == 200
    updated = res.json()["profile"]
    assert updated["name"] == "Holiday & Leisure"
    assert updated["color"] == "#8b5cf6"

    # 5. Switch active profile
    res = client.post(f"/api/profiles/{prof_id}/switch")
    assert res.status_code == 200
    assert res.json()["active_profile"]["id"] == prof_id

    # Switch back to Profile 1
    res = client.post("/api/profiles/1/switch")
    assert res.status_code == 200
    assert res.json()["active_profile"]["id"] == 1

    # 6. Delete the created profile
    res = client.delete(f"/api/profiles/{prof_id}")
    assert res.status_code == 200
    assert res.json()["success"] is True

    # Cannot delete profile 1
    res = client.delete("/api/profiles/1")
    assert res.status_code == 400


def test_multi_profile_data_isolation():
    # Profile 1 has HDFC & SBI accounts, Profile 2 has ICICI Business & GST Buffer
    res_p1 = client.get("/api/dashboard?profile_id=1")
    assert res_p1.status_code == 200
    p1_dash = res_p1.json()
    p1_acc_names = [a["name"] for a in p1_dash["accounts"]]
    assert any("HDFC" in name for name in p1_acc_names)
    assert not any("ICICI Business" in name for name in p1_acc_names)

    res_p2 = client.get("/api/dashboard?profile_id=2")
    assert res_p2.status_code == 200
    p2_dash = res_p2.json()
    p2_acc_names = [a["name"] for a in p2_dash["accounts"]]
    assert any("ICICI Business" in name for name in p2_acc_names)
    assert not any("HDFC" in name for name in p2_acc_names)

    # Net worths are isolated
    assert p1_dash["total_networth"] != p2_dash["total_networth"]

    # Transactions are isolated
    p1_tx = client.get("/api/transactions?profile_id=1").json()
    p2_tx = client.get("/api/transactions?profile_id=2").json()
    p1_tx_desc = [t["description"] for t in p1_tx["transactions"]]
    p2_tx_desc = [t["description"] for t in p2_tx["transactions"]]
    assert any("Salary" in d or "Groceries" in d for d in p1_tx_desc)
    assert any("Invoice" in d or "SaaS" in d for d in p2_tx_desc)
    assert not any("Salary" in d for d in p2_tx_desc)


def test_addon_card_lifecycle_and_shared_limit_sync():
    # 1. Create a Primary Credit Card
    primary_payload = {
        "card_name": "Axis Magnus Primary",
        "card_type": "credit",
        "card_network": "mastercard",
        "card_last4": "5521",
        "credit_limit": 200000.0,
        "available_limit": 200000.0,
        "billing_day": 23,
        "due_day": 12,
        "color": "#9333ea"
    }
    res_p = client.post("/api/cards", json=primary_payload)
    assert res_p.status_code == 200
    primary_card = res_p.json()["card"]
    p_id = primary_card["id"]
    assert primary_card["credit_limit"] == 200000.0
    assert primary_card["billing_day"] == 23
    assert primary_card["due_day"] == 12

    # 2. Create an Add-on Credit Card linked to the primary card
    addon_payload = {
        "card_name": "Axis Magnus Add-on (Family)",
        "card_type": "credit",
        "card_network": "mastercard",
        "card_last4": "9933",
        "is_addon": 1,
        "parent_card_id": p_id,
        "sub_limit": 50000.0,
        "color": "#7c3aed"
    }
    res_a = client.post("/api/cards", json=addon_payload)
    assert res_a.status_code == 200
    addon_card = res_a.json()["card"]
    a_id = addon_card["id"]
    assert addon_card["is_addon"] == 1
    assert addon_card["parent_card_id"] == p_id
    assert addon_card["credit_limit"] == 200000.0 # Inherited
    assert addon_card["billing_day"] == 23        # Inherited
    assert addon_card["due_day"] == 12            # Inherited

    # 3. Spend ₹30,000 on the Add-on Card
    tx_addon = {
        "date": "2026-09-24",
        "type": "expense",
        "amount": 30000.0,
        "card_id": a_id,
        "description": "Add-on card family shopping",
        "payment_mode": "card"
    }
    res_tx1 = client.post("/api/transactions", json=tx_addon)
    assert res_tx1.status_code == 200

    # Verify BOTH cards' available limits drop by ₹30,000 to ₹1,70,000
    cards_res = client.get("/api/cards").json()["cards"]
    card_map = {c["id"]: c for c in cards_res}
    assert card_map[p_id]["available_limit"] == 170000.0
    assert card_map[a_id]["available_limit"] == 170000.0

    # 4. Spend ₹20,000 on the Primary Card
    tx_prim = {
        "date": "2026-09-25",
        "type": "expense",
        "amount": 20000.0,
        "card_id": p_id,
        "description": "Primary card electronics purchase",
        "payment_mode": "card"
    }
    res_tx2 = client.post("/api/transactions", json=tx_prim)
    assert res_tx2.status_code == 200

    # Verify BOTH cards' available limits drop to ₹1,50,000
    cards_res2 = client.get("/api/cards").json()["cards"]
    card_map2 = {c["id"]: c for c in cards_res2}
    assert card_map2[p_id]["available_limit"] == 150000.0
    assert card_map2[a_id]["available_limit"] == 150000.0

    # 5. Make a bill payment of ₹35,000 towards the Add-on card
    pay_payload = {
        "card_id": a_id,
        "from_account_id": 1,
        "amount": 35000.0,
        "date": "2026-09-26",
        "notes": "Payment towards shared card statement"
    }
    res_pay = client.post("/api/cards/pay", json=pay_payload)
    assert res_pay.status_code == 200

    # Verify BOTH cards' available limits restore to ₹1,85,000
    cards_res3 = client.get("/api/cards").json()["cards"]
    card_map3 = {c["id"]: c for c in cards_res3}
    assert card_map3[p_id]["available_limit"] == 185000.0
    assert card_map3[a_id]["available_limit"] == 185000.0

    # Clean up test cards
    client.delete(f"/api/cards/{a_id}")
    client.delete(f"/api/cards/{p_id}")


def test_standalone_and_linked_cards_lifecycle():
    """
    Validates that:
    1. A credit card can exist WITH a linked bank account (for auto-debit/direct netbanking).
    2. A credit card can exist WITHOUT any linked bank account (Standalone credit card, e.g. Amazon Pay, SBI, Amex).
    3. Standalone cards can be paid from any available bank account via /api/cards/pay.
    4. Modifying account_id toggles between linked and standalone cleanly.
    """
    # 1. Create a Standalone Credit Card (account_id = None)
    standalone_payload = {
        "card_name": "American Express Platinum Travel",
        "card_type": "credit",
        "card_network": "amex",
        "card_last4": "5001",
        "credit_limit": 300000.0,
        "available_limit": 260000.0,
        "billing_day": 24,
        "due_day": 12,
        "account_id": None,
        "color": "#0ea5e9"
    }
    res = client.post("/api/cards", json=standalone_payload)
    assert res.status_code == 200
    standalone_card = res.json()["card"]
    card_id = standalone_card["id"]

    # Verify via GET that linked_account_name is None
    cards = client.get("/api/cards").json()["cards"]
    target = next((c for c in cards if c["id"] == card_id), None)
    assert target is not None
    assert target["account_id"] is None
    assert target["linked_account_name"] is None

    # 2. Spend ₹15,000 on the standalone card
    tx_spend = {
        "date": "2026-09-27",
        "type": "expense",
        "amount": 15000.0,
        "card_id": card_id,
        "description": "Flight tickets on Amex",
        "payment_mode": "card"
    }
    res_spend = client.post("/api/transactions", json=tx_spend)
    assert res_spend.status_code == 200

    # Verify available limit decreased
    target = next((c for c in client.get("/api/cards").json()["cards"] if c["id"] == card_id), None)
    assert target["available_limit"] == 245000.0

    # 3. Pay bill from an external bank account (e.g. Account 2: SBI Savings)
    pay_req = {
        "card_id": card_id,
        "from_account_id": 2,
        "amount": 15000.0,
        "date": "2026-09-28",
        "notes": "Pay Amex bill from SBI savings account"
    }
    res_pay = client.post("/api/cards/pay", json=pay_req)
    assert res_pay.status_code == 200

    # Verify available limit restored
    target = next((c for c in client.get("/api/cards").json()["cards"] if c["id"] == card_id), None)
    assert target["available_limit"] == 260000.0

    # 4. Link a bank account to this card (e.g. Account 1)
    res_link = client.put(f"/api/cards/{card_id}", json={"account_id": 1})
    assert res_link.status_code == 200

    target = next((c for c in client.get("/api/cards").json()["cards"] if c["id"] == card_id), None)
    assert target["account_id"] == 1
    assert target["linked_account_name"] == "HDFC Salary Account"

    # 5. Clean up
    client.delete(f"/api/cards/{card_id}")


def test_clear_dummy_data_and_restore_cycle():
    """
    Validates that:
    1. Clearing dummy data via POST /api/clear-demo empties transactions, cards, loans, debts,
       and resets net worth to ₹0 while maintaining categories and clean starter accounts.
    2. GET /api/data-status reflects has_dummy_data = False.
    3. Restoring dummy data via POST /api/reset-demo repopulates full Indian datasets.
    4. GET /api/data-status reflects has_dummy_data = True.
    """
    # 1. Clear dummy data
    res_clear = client.post("/api/clear-demo")
    assert res_clear.status_code == 200
    assert res_clear.json()["success"] is True

    # Check status
    res_status = client.get("/api/data-status")
    assert res_status.status_code == 200
    status = res_status.json()
    assert status["has_dummy_data"] is False
    assert status["transaction_count"] == 0
    assert status["card_count"] == 0
    assert status["loan_count"] == 0
    assert status["debt_count"] == 0
    assert status["account_count"] == 2

    # Check dashboard net worth is 0
    dash = client.get("/api/dashboard?year=2026&month=9").json()
    assert dash["total_networth"] == 0.0
    assert dash["carryover"]["total_expense"] == 0.0

    # 2. Restore dummy data
    res_restore = client.post("/api/reset-demo")
    assert res_restore.status_code == 200
    assert res_restore.json()["success"] is True

    # Check status after restore
    res_status2 = client.get("/api/data-status")
    assert res_status2.status_code == 200
    status2 = res_status2.json()
    assert status2["has_dummy_data"] is True
    assert status2["transaction_count"] > 10
    assert status2["card_count"] >= 4
    assert status2["account_count"] >= 4


def test_card_billing_cycles_and_independent_addon():
    """
    Validates:
    1. Primary card with cycle 24th to 22nd, Statement 22nd, Due 11th.
    2. Add-on card with independent cycle 15th to 14th, Statement 14th, Due 4th while sharing limit pool.
    3. Calculation of Previous Month Bill, Current Month Active Cycle, and Next Month Cycle.
    4. Categorization of transactions and bill amounts into their proper billing cycles.
    """
    # 1. Create Primary Card
    p_res = client.post("/api/cards", json={
        "card_name": "SBI Cashback Primary",
        "card_type": "credit",
        "card_network": "visa",
        "card_last4": "1001",
        "credit_limit": 300000.0,
        "available_limit": 300000.0,
        "billing_start_day": 24,
        "billing_day": 22,
        "due_day": 11,
        "color": "#0284c7"
    })
    assert p_res.status_code == 200
    primary_card = p_res.json()["card"]
    p_id = primary_card["id"]
    assert primary_card["billing_start_day"] == 24
    assert primary_card["billing_day"] == 22
    assert primary_card["due_day"] == 11

    # 2. Create Add-on Card with DIFFERENT billing cycle & due date
    a_res = client.post("/api/cards", json={
        "card_name": "SBI Cashback Add-on (Different Cycle)",
        "card_type": "credit",
        "card_network": "visa",
        "card_last4": "1002",
        "is_addon": 1,
        "parent_card_id": p_id,
        "billing_start_day": 15,
        "billing_day": 14,
        "due_day": 4,
        "sub_limit": 50000.0,
        "color": "#38bdf8"
    })
    assert a_res.status_code == 200
    addon_card = a_res.json()["card"]
    a_id = addon_card["id"]
    assert addon_card["credit_limit"] == 300000.0 # Shared limit
    assert addon_card["billing_start_day"] == 15  # Independent cycle start
    assert addon_card["billing_day"] == 14        # Independent statement date
    assert addon_card["due_day"] == 4             # Independent due date

    # 3. Log transactions on Primary Card in previous and current cycles
    # Previous cycle for 24th to 22nd: 2026-08-24 to 2026-09-22
    t1 = client.post("/api/transactions", json={
        "date": "2026-08-30",
        "type": "expense",
        "amount": 8500.0,
        "card_id": p_id,
        "description": "Previous Cycle Purchase",
        "payment_mode": "card"
    })
    assert t1.status_code == 200

    # Current cycle for 24th to 22nd: 2026-09-24 to 2026-10-22
    t2 = client.post("/api/transactions", json={
        "date": "2026-09-26",
        "type": "expense",
        "amount": 12000.0,
        "card_id": p_id,
        "description": "Current Cycle Active Spend",
        "payment_mode": "card"
    })
    assert t2.status_code == 200

    # 4. Fetch billing cycles for Primary Card with ref_date = 2026-09-28
    cycles_res = client.get(f"/api/cards/{p_id}/billing-cycles?ref_date=2026-09-28")
    assert cycles_res.status_code == 200
    data = cycles_res.json()

    # Previous Cycle assertions (24 Aug - 22 Sep, Statement: 22 Sep, Due: 11 Oct)
    prev = data["previous_cycle"]
    assert prev["start_date"] == "2026-08-24"
    assert prev["statement_date"] == "2026-09-22"
    assert prev["due_date"] == "2026-10-11"
    assert prev["billed_amount"] == 8500.0
    assert prev["net_due_amount"] == 8500.0
    assert prev["transaction_count"] == 1
    assert prev["status"] == "DUE"

    # Current Cycle assertions (24 Sep - 22 Oct, Statement: 22 Oct, Due: 11 Nov)
    curr = data["current_cycle"]
    assert curr["start_date"] == "2026-09-24"
    assert curr["statement_date"] == "2026-10-22"
    assert curr["due_date"] == "2026-11-11"
    assert curr["billed_amount"] == 12000.0
    assert curr["transaction_count"] == 1
    assert curr["status"] == "ACTIVE_UNBILLED"

    # Next Cycle assertions (24 Oct - 22 Nov, Statement: 22 Nov, Due: 11 Dec)
    nxt = data["next_cycle"]
    assert nxt["start_date"] == "2026-10-24"
    assert nxt["statement_date"] == "2026-11-22"
    assert nxt["due_date"] == "2026-12-11"
    assert nxt["interest_free_days"] == 48

    # 5. Fetch billing cycles for Add-on Card (15th to 14th, Due 4th)
    addon_cycles_res = client.get(f"/api/cards/{a_id}/billing-cycles?ref_date=2026-09-28")
    assert addon_cycles_res.status_code == 200
    a_data = addon_cycles_res.json()
    assert a_data["billing_start_day"] == 15
    assert a_data["billing_day"] == 14
    assert a_data["due_day"] == 4
    # With ref_date 28 Sep (> 14 Sep), current cycle started 15 Sep and ends 14 Oct
    assert a_data["current_cycle"]["start_date"] == "2026-09-15"
    assert a_data["current_cycle"]["statement_date"] == "2026-10-14"
    assert a_data["current_cycle"]["due_date"] == "2026-11-04"

    # 6. Clean up
    client.delete(f"/api/cards/{a_id}")
    client.delete(f"/api/cards/{p_id}")


def test_borrow_lent_bank_account_sync_and_transactions():
    """
    Test that borrowing funds into a bank account credits the balance and logs an income transaction,
    and lending funds from a bank account debits the balance and logs an expense transaction.
    Also tests balance restoration on deletion.
    """
    # 1. Check initial balance of Account 1 (HDFC Salary Account)
    accs_res = client.get("/api/accounts")
    assert accs_res.status_code == 200
    acc1 = next(a for a in accs_res.json()["accounts"] if a["id"] == 1)
    init_balance = acc1["balance"]

    # 2. Record Money Borrowed into Account 1 (₹20,000)
    borrow_payload = {
        "person_name": "Ramesh Uncle",
        "relationship": "relative",
        "direction": "borrowed",
        "principal_amount": 20000.0,
        "transaction_date": "2026-09-09",
        "due_date": "2026-12-31",
        "account_id": 1,
        "payment_mode": "upi",
        "notes": "Emergency borrowed funds"
    }
    b_res = client.post("/api/borrows", json=borrow_payload)
    assert b_res.status_code == 200
    borrow_data = b_res.json()["borrow"]
    borrow_id = borrow_data["id"]
    assert borrow_data["account_id"] == 1
    assert borrow_data["account_name"] == "HDFC Salary Account"
    assert borrow_data["transaction_id"] is not None

    # Verify Account 1 balance increased by ₹20,000
    acc1_after_borrow = next(a for a in client.get("/api/accounts").json()["accounts"] if a["id"] == 1)
    assert acc1_after_borrow["balance"] == round(init_balance + 20000.0, 2)

    # Verify transaction history has the inflow
    txs = client.get("/api/transactions?limit=20").json()["transactions"]
    borrow_tx = next((t for t in txs if t["borrow_id"] == borrow_id and t["type"] == "income"), None)
    assert borrow_tx is not None
    assert borrow_tx["amount"] == 20000.0
    assert "Ramesh Uncle" in borrow_tx["description"]

    # 3. Record Money Lent from Account 1 (₹8,000)
    lent_payload = {
        "person_name": "Suresh Colleague",
        "relationship": "colleague",
        "direction": "lent",
        "principal_amount": 8000.0,
        "transaction_date": "2026-09-09",
        "due_date": "2026-10-31",
        "account_id": 1,
        "payment_mode": "bank_transfer",
        "notes": "Office equipment advance"
    }
    l_res = client.post("/api/borrows", json=lent_payload)
    assert l_res.status_code == 200
    lent_data = l_res.json()["borrow"]
    lent_id = lent_data["id"]
    assert lent_data["account_id"] == 1
    assert lent_data["account_name"] == "HDFC Salary Account"
    assert lent_data["transaction_id"] is not None

    # Verify Account 1 balance decreased by ₹8,000
    acc1_after_lent = next(a for a in client.get("/api/accounts").json()["accounts"] if a["id"] == 1)
    assert acc1_after_lent["balance"] == round(init_balance + 20000.0 - 8000.0, 2)

    # Verify transaction history has the outflow
    txs = client.get("/api/transactions?limit=20").json()["transactions"]
    lent_tx = next((t for t in txs if t["borrow_id"] == lent_id and t["type"] == "expense"), None)
    assert lent_tx is not None
    assert lent_tx["amount"] == 8000.0
    assert "Suresh Colleague" in lent_tx["description"]

    # 4. Delete Lent record -> Account balance restored (+₹8,000) and transaction removed
    del_l = client.delete(f"/api/borrows/{lent_id}")
    assert del_l.status_code == 200

    acc1_restored_lent = next(a for a in client.get("/api/accounts").json()["accounts"] if a["id"] == 1)
    assert acc1_restored_lent["balance"] == round(init_balance + 20000.0, 2)
    txs_after_del_lent = client.get("/api/transactions?limit=30").json()["transactions"]
    assert not any(t["borrow_id"] == lent_id for t in txs_after_del_lent)

    # 5. Delete Borrow record -> Account balance restored (-₹20,000) back to original and transaction removed
    del_b = client.delete(f"/api/borrows/{borrow_id}")
    assert del_b.status_code == 200

    acc1_final = next(a for a in client.get("/api/accounts").json()["accounts"] if a["id"] == 1)
    assert acc1_final["balance"] == round(init_balance, 2)
    txs_after_del_borrow = client.get("/api/transactions?limit=30").json()["transactions"]
    assert not any(t["borrow_id"] == borrow_id for t in txs_after_del_borrow)


def test_user_registration_login_and_data_isolation():
    import uuid
    uid_suffix = uuid.uuid4().hex[:6]
    user_a_name = f"user_a_{uid_suffix}"
    user_b_name = f"user_b_{uid_suffix}"

    # 1. Register User A
    reg_a = client.post("/api/auth/register", json={
        "username": user_a_name,
        "password": "Password123!",
        "full_name": "Alpha User",
        "email": f"{user_a_name}@example.com"
    })
    assert reg_a.status_code == 200
    data_a = reg_a.json()
    token_a = data_a["token"]
    user_a_id = data_a["user"]["id"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 2. Duplicate registration check
    dup_res = client.post("/api/auth/register", json={
        "username": user_a_name,
        "password": "OtherPassword!",
        "full_name": "Duplicate User",
        "email": f"different_{user_a_name}@example.com"
    })
    assert dup_res.status_code == 400

    # 3. Invalid credentials login
    bad_login = client.post("/api/auth/login", json={
        "username": user_a_name,
        "password": "wrongpassword"
    })
    assert bad_login.status_code == 401

    # 4. Successful login
    ok_login = client.post("/api/auth/login", json={
        "username": user_a_name,
        "password": "Password123!"
    })
    assert ok_login.status_code == 200
    token_a = ok_login.json()["token"]
    headers_a = {"Authorization": f"Bearer {token_a}"}

    # 5. /api/auth/me test
    me_res = client.get("/api/auth/me", headers=headers_a)
    assert me_res.status_code == 200
    assert me_res.json()["user"]["username"] == user_a_name

    # 6. User A starter profiles & accounts
    profiles_a = client.get("/api/profiles", headers=headers_a).json()["profiles"]
    assert len(profiles_a) >= 1
    prof_a_id = profiles_a[0]["id"]

    accounts_a = client.get("/api/accounts", headers=headers_a).json()["accounts"]
    assert len(accounts_a) >= 2
    acc_a_id = accounts_a[0]["id"]

    # User A creates a unique account and transaction
    new_acc_res = client.post("/api/accounts", json={
        "name": f"Alpha Vault {uid_suffix}",
        "type": "bank",
        "balance": 50000.0
    }, headers=headers_a)
    assert new_acc_res.status_code == 200
    vault_id = new_acc_res.json()["account"]["id"]

    tx_res = client.post("/api/transactions", json={
        "date": "2026-09-09",
        "type": "expense",
        "amount": 2500.0,
        "account_id": vault_id,
        "description": "Alpha Private Purchase",
        "payment_mode": "upi"
    }, headers=headers_a)
    assert tx_res.status_code == 200
    tx_a_id = tx_res.json()["transaction"]["id"]

    # 7. Register User B
    reg_b = client.post("/api/auth/register", json={
        "username": user_b_name,
        "password": "Password456!",
        "full_name": "Beta User",
        "email": f"{user_b_name}@example.com"
    })
    assert reg_b.status_code == 200
    token_b = reg_b.json()["token"]
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Verify User B does NOT see User A's vault account
    accounts_b = client.get("/api/accounts", headers=headers_b).json()["accounts"]
    assert not any(a["id"] == vault_id for a in accounts_b)

    # Verify User B does NOT see User A's transaction
    txs_b = client.get("/api/transactions", headers=headers_b).json()["transactions"]
    assert not any(t["id"] == tx_a_id for t in txs_b)

    # Verify User B CANNOT delete User A's transaction (must return 404)
    del_tx_attempt = client.delete(f"/api/transactions/{tx_a_id}", headers=headers_b)
    assert del_tx_attempt.status_code == 404

    # Verify User B CANNOT delete User A's account (must return 404)
    del_acc_attempt = client.delete(f"/api/accounts/{vault_id}", headers=headers_b)
    assert del_acc_attempt.status_code == 404

    # 8. User B logs out
    logout_res = client.post("/api/auth/logout", headers=headers_b)
    assert logout_res.status_code == 200

    # User B token is now invalid
    me_after_logout = client.get("/api/auth/me", headers=headers_b)
    assert me_after_logout.status_code == 401







