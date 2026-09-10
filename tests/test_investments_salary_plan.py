import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_investments_and_salary_plan_flow():
    # 1. Register a test user
    uid = id(client) % 10000000
    reg_resp = client.post("/api/auth/register", json={
        "username": f"wealth_{uid}",
        "email": f"wealth_{uid}@test.com",
        "full_name": "Wealth Builder",
        "password": "Password123!"
    })
    assert reg_resp.status_code == 200, reg_resp.text
    token = reg_resp.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Check initial investments summary
    summary_resp = client.get("/api/investments/summary", headers=headers)
    assert summary_resp.status_code == 200
    summary = summary_resp.json()
    assert summary["count"] == 0
    assert summary["total_invested"] == 0.0

    # 3. Create Investments (Mutual Fund with SIP, and Stocks)
    mf_resp = client.post("/api/investments", json={
        "name": "Mirae Asset Large Cap",
        "asset_type": "mutual_fund",
        "platform": "Groww",
        "invested_amount": 50000.0,
        "current_value": 58000.0,
        "sip_enabled": 1,
        "sip_amount": 5000.0,
        "sip_day": 10
    }, headers=headers)
    assert mf_resp.status_code == 200
    mf_id = mf_resp.json()["investment"]["id"]

    stocks_resp = client.post("/api/investments", json={
        "name": "Tata Motors Ltd",
        "asset_type": "stocks",
        "platform": "Zerodha",
        "invested_amount": 30000.0,
        "current_value": 36000.0,
        "sip_enabled": 0
    }, headers=headers)
    assert stocks_resp.status_code == 200

    # 4. Verify updated summary and calculations
    summary_resp2 = client.get("/api/investments/summary", headers=headers)
    assert summary_resp2.status_code == 200
    s2 = summary_resp2.json()
    assert s2["count"] == 2
    assert s2["total_invested"] == 80000.0
    assert s2["current_value"] == 94000.0
    assert s2["total_returns"] == 14000.0
    assert s2["returns_percentage"] == 17.5
    assert s2["monthly_sip_total"] == 5000.0
    assert len(s2["asset_breakdown"]) == 2

    # 5. Test Salary Plan Save & Retrieval
    plan_save_resp = client.post("/api/salary-plan", json={
        "monthly_salary": 100000.0,
        "rule_type": "50_30_20",
        "needs_percent": 50.0,
        "wants_percent": 30.0,
        "savings_percent": 10.0,
        "debts_percent": 10.0,
        "emergency_fund_target_months": 6
    }, headers=headers)
    assert plan_save_resp.status_code == 200
    saved_plan = plan_save_resp.json()["plan"]
    assert saved_plan["monthly_salary"] == 100000.0

    # 6. Test Salary Plan Analysis
    analysis_resp = client.get("/api/salary-plan/analysis?year=2026&month=9", headers=headers)
    assert analysis_resp.status_code == 200
    analysis = analysis_resp.json()
    assert analysis["monthly_salary"] == 100000.0
    assert "buckets" in analysis
    assert len(analysis["buckets"]) == 4

    needs_bucket = next(b for b in analysis["buckets"] if b["key"] == "needs")
    assert needs_bucket["budget"] == 50000.0
    wants_bucket = next(b for b in analysis["buckets"] if b["key"] == "wants")
    assert wants_bucket["budget"] == 30000.0

    # Emergency fund runway and target check
    assert analysis["emergency_fund"]["target_months"] == 6
    assert analysis["emergency_fund"]["target_amount"] == 300000.0
    assert 0 <= analysis["health_score"] <= 100

    # 7. Test Financial Goals
    goal_resp = client.post("/api/financial-goals", json={
        "title": "Emergency Reserve",
        "category": "emergency_fund",
        "target_amount": 300000.0,
        "current_amount": 50000.0,
        "priority": "high"
    }, headers=headers)
    assert goal_resp.status_code == 200
    goal_id = goal_resp.json()["goal"]["id"]

    goals_list = client.get("/api/financial-goals", headers=headers).json()["goals"]
    assert len(goals_list) >= 1
    assert any(g["id"] == goal_id for g in goals_list)

    # 8. Test Dashboard integration
    dash_resp = client.get("/api/dashboard", headers=headers)
    assert dash_resp.status_code == 200
    dash = dash_resp.json()
    assert "investments_summary" in dash
    assert dash["portfolio_value"] == 94000.0
    assert "salary_plan_analysis" in dash
    assert "true_net_worth" in dash

    # 9. Clean up investment & goal
    del_inv = client.delete(f"/api/investments/{mf_id}", headers=headers)
    assert del_inv.status_code == 200
    del_goal = client.delete(f"/api/financial-goals/{goal_id}", headers=headers)
    assert del_goal.status_code == 200
