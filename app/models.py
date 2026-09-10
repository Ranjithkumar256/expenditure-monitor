"""
Pydantic data models for request validation and response schemas with Multi-Profile support.
"""
from typing import Optional, List, Literal, Dict, Any
from pydantic import BaseModel, Field

# ==========================================
# Authentication & User Models
# ==========================================
class UserRegister(BaseModel):
    username: str = Field(..., min_length=3, max_length=50, description="Unique username")
    email: str = Field(..., min_length=5, max_length=100, description="User email address")
    password: str = Field(..., min_length=6, description="Password (min 6 characters)")
    full_name: str = Field(..., min_length=1, max_length=100, description="Full display name")

class UserLogin(BaseModel):
    username_or_email: Optional[str] = None
    username: Optional[str] = None
    email: Optional[str] = None
    password: str = Field(..., min_length=1, description="Password")

    def get_identifier(self) -> str:
        return (self.username_or_email or self.username or self.email or "").strip().lower()

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    full_name: str
    created_at: Optional[str] = None

class AuthResponse(BaseModel):
    token: str
    user: UserResponse
    message: str = "Success"

# ==========================================
# Profile Models
# ==========================================
class ProfileBase(BaseModel):
    name: str = Field(..., min_length=1, description="Profile name e.g. Personal, Business, Shop")
    description: Optional[str] = ""
    color: Optional[str] = "#4f46e5"
    icon: Optional[str] = "user"
    currency: Optional[str] = "INR"
    is_default: Optional[int] = 0

class ProfileCreate(ProfileBase):
    copy_default_categories: Optional[bool] = True

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color: Optional[str] = None
    icon: Optional[str] = None
    currency: Optional[str] = None
    is_default: Optional[int] = None

# ==========================================
# Transactions Models
# ==========================================
class TransactionBase(BaseModel):
    profile_id: Optional[int] = None
    date: str = Field(..., description="Date in YYYY-MM-DD format")
    time: Optional[str] = "12:00:00"
    type: Literal["expense", "income", "transfer"]
    amount: float = Field(..., gt=0, description="Amount must be greater than 0")
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    destination_account_id: Optional[int] = None
    card_id: Optional[int] = None
    loan_id: Optional[int] = None
    borrow_id: Optional[int] = None
    payment_mode: Optional[str] = "upi"
    description: Optional[str] = ""
    tags: Optional[str] = ""
    is_cleared: Optional[int] = 1

class TransactionCreate(TransactionBase):
    pass

class TransactionUpdate(BaseModel):
    profile_id: Optional[int] = None
    date: Optional[str] = None
    time: Optional[str] = None
    type: Optional[Literal["expense", "income", "transfer"]] = None
    amount: Optional[float] = Field(None, gt=0)
    category_id: Optional[int] = None
    account_id: Optional[int] = None
    destination_account_id: Optional[int] = None
    card_id: Optional[int] = None
    loan_id: Optional[int] = None
    borrow_id: Optional[int] = None
    payment_mode: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[str] = None
    is_cleared: Optional[int] = None

# ==========================================
# Accounts Models
# ==========================================
class AccountBase(BaseModel):
    profile_id: Optional[int] = None
    name: str
    type: Literal["bank", "cash", "wallet", "savings"] = "bank"
    institution_name: Optional[str] = ""
    account_number_mask: Optional[str] = ""
    balance: float = 0.0
    currency: Optional[str] = "INR"
    color: Optional[str] = "#2563eb"
    is_active: Optional[int] = 1

class AccountCreate(AccountBase):
    pass

class AccountUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[Literal["bank", "cash", "wallet", "savings"]] = None
    institution_name: Optional[str] = None
    account_number_mask: Optional[str] = None
    balance: Optional[float] = None
    color: Optional[str] = None
    is_active: Optional[int] = None

class AccountTransferRequest(BaseModel):
    profile_id: Optional[int] = None
    from_account_id: int
    to_account_id: int
    amount: float = Field(..., gt=0)
    date: str
    notes: Optional[str] = "Account Transfer"

# ==========================================
# Cards Models (Credit & Debit, Primary & Add-on)
# ==========================================
class CardBase(BaseModel):
    profile_id: Optional[int] = None
    account_id: Optional[int] = None
    parent_card_id: Optional[int] = None
    is_addon: Optional[int] = 0
    sub_limit: Optional[float] = 0.0
    card_name: str
    card_type: Literal["credit", "debit"] = "credit"
    card_network: Optional[str] = "visa"
    card_last4: Optional[str] = "0000"
    credit_limit: Optional[float] = 0.0
    available_limit: Optional[float] = 0.0
    billing_start_day: Optional[int] = None
    billing_day: Optional[int] = None
    due_day: Optional[int] = None
    color: Optional[str] = "#4f46e5"

class CardCreate(CardBase):
    pass

class CardUpdate(BaseModel):
    account_id: Optional[int] = None
    parent_card_id: Optional[int] = None
    is_addon: Optional[int] = None
    sub_limit: Optional[float] = None
    card_name: Optional[str] = None
    card_type: Optional[Literal["credit", "debit"]] = None
    card_network: Optional[str] = None
    card_last4: Optional[str] = None
    credit_limit: Optional[float] = None
    available_limit: Optional[float] = None
    billing_start_day: Optional[int] = None
    billing_day: Optional[int] = None
    due_day: Optional[int] = None
    color: Optional[str] = None

class CardPaymentRequest(BaseModel):
    profile_id: Optional[int] = None
    card_id: int
    from_account_id: int
    amount: float = Field(..., gt=0)
    date: str
    notes: Optional[str] = "Credit Card Bill Payment"

# ==========================================
# Loans Models
# ==========================================
class LoanBase(BaseModel):
    profile_id: Optional[int] = None
    title: str
    loan_type: Literal["home", "car", "personal", "education", "gold", "other"] = "personal"
    lender_name: Optional[str] = ""
    principal_amount: float = Field(..., gt=0)
    current_balance: float = Field(..., ge=0)
    interest_rate: Optional[float] = 0.0
    tenure_months: Optional[int] = 12
    emi_amount: float = Field(..., gt=0)
    emi_due_day: Optional[int] = 5
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = ""

class LoanCreate(LoanBase):
    pass

class LoanUpdate(BaseModel):
    title: Optional[str] = None
    loan_type: Optional[Literal["home", "car", "personal", "education", "gold", "other"]] = None
    lender_name: Optional[str] = None
    principal_amount: Optional[float] = None
    current_balance: Optional[float] = None
    interest_rate: Optional[float] = None
    tenure_months: Optional[int] = None
    emi_amount: Optional[float] = None
    emi_due_day: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None

class LoanEMIPaymentRequest(BaseModel):
    profile_id: Optional[int] = None
    loan_id: int
    from_account_id: int
    amount: float = Field(..., gt=0)
    date: str
    notes: Optional[str] = "Monthly Loan EMI Payment"

# ==========================================
# Borrows & Lent (Friends & Relatives) Models
# ==========================================
class BorrowBase(BaseModel):
    profile_id: Optional[int] = None
    person_name: str
    relationship: Optional[str] = "friend"  # friend, relative, family, colleague, other
    direction: Literal["borrowed", "lent"]   # 'borrowed': You owe them; 'lent': They owe you
    principal_amount: float = Field(..., gt=0)
    balance_remaining: Optional[float] = None
    transaction_date: str
    due_date: Optional[str] = None
    account_id: Optional[int] = None         # Received into (borrowed) or Lent from (lent)
    payment_mode: Optional[str] = "upi"      # upi, bank_transfer, cash, cheque
    phone: Optional[str] = ""
    notes: Optional[str] = ""

class BorrowCreate(BorrowBase):
    pass

class BorrowUpdate(BaseModel):
    person_name: Optional[str] = None
    relationship: Optional[str] = None
    direction: Optional[Literal["borrowed", "lent"]] = None
    principal_amount: Optional[float] = None
    balance_remaining: Optional[float] = None
    transaction_date: Optional[str] = None
    due_date: Optional[str] = None
    account_id: Optional[int] = None
    payment_mode: Optional[str] = None
    status: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None

class BorrowRepaymentRequest(BaseModel):
    profile_id: Optional[int] = None
    borrow_id: int
    amount: float = Field(..., gt=0)
    payment_date: str
    account_id: Optional[int] = None
    payment_mode: Optional[str] = "upi"
    notes: Optional[str] = "Debt repayment"

# ==========================================
# Categories Models
# ==========================================
class CategoryCreate(BaseModel):
    profile_id: Optional[int] = None
    name: str
    type: Literal["expense", "income"]
    icon: Optional[str] = "tag"
    color: Optional[str] = "#64748b"
    budget_limit: Optional[float] = 0.0
    classification: Optional[str] = "need"  # 'need', 'want', 'debt', 'investment'

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[Literal["expense", "income"]] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    budget_limit: Optional[float] = None
    classification: Optional[str] = None

# ==========================================
# Investments Models
# ==========================================
class InvestmentCreate(BaseModel):
    profile_id: Optional[int] = None
    name: str = Field(..., min_length=1, description="e.g. Nifty 50 Index, Tata Motors, SBI FD, Gold SGB")
    asset_type: str = Field(default="mutual_fund", description="mutual_fund, stocks, fixed_deposit, gold, epf_ppf, real_estate, crypto, other")
    platform: Optional[str] = "Zerodha"
    folio_or_account_number: Optional[str] = ""
    invested_amount: float = Field(default=0.0, ge=0)
    current_value: float = Field(default=0.0, ge=0)
    allocation_category: Optional[str] = "wealth"
    sip_enabled: Optional[int] = 0
    sip_amount: Optional[float] = 0.0
    sip_day: Optional[int] = 5
    linked_account_id: Optional[int] = None
    start_date: Optional[str] = None
    maturity_date: Optional[str] = None
    notes: Optional[str] = ""

class InvestmentUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[str] = None
    platform: Optional[str] = None
    folio_or_account_number: Optional[str] = None
    invested_amount: Optional[float] = Field(None, ge=0)
    current_value: Optional[float] = Field(None, ge=0)
    allocation_category: Optional[str] = None
    sip_enabled: Optional[int] = None
    sip_amount: Optional[float] = None
    sip_day: Optional[int] = None
    linked_account_id: Optional[int] = None
    start_date: Optional[str] = None
    maturity_date: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None

# ==========================================
# Salary Plan & Budget Allocation Models
# ==========================================
class SalaryPlanUpdate(BaseModel):
    profile_id: Optional[int] = None
    monthly_salary: float = Field(..., ge=0, description="Monthly in-hand / take-home salary in INR")
    rule_type: Optional[str] = "50_30_20"  # '50_30_20', '60_20_20', 'debt_focus', 'custom'
    needs_percent: Optional[float] = 50.0
    wants_percent: Optional[float] = 30.0
    savings_percent: Optional[float] = 10.0
    debts_percent: Optional[float] = 10.0
    emergency_fund_target_months: Optional[int] = 6
    notes: Optional[str] = ""

# ==========================================
# Financial Goals Models
# ==========================================
class FinancialGoalCreate(BaseModel):
    profile_id: Optional[int] = None
    title: str = Field(..., min_length=1, description="e.g. Emergency Fund (6 Months), New Car, House Down Payment")
    category: Optional[str] = "wealth"  # emergency_fund, home, vehicle, retirement, education, vacation, wealth
    target_amount: float = Field(..., gt=0)
    current_amount: Optional[float] = 0.0
    target_date: Optional[str] = None
    monthly_contribution: Optional[float] = 0.0
    priority: Optional[str] = "medium"  # high, medium, low
    linked_investment_id: Optional[int] = None
    linked_account_id: Optional[int] = None
    notes: Optional[str] = ""

class FinancialGoalUpdate(BaseModel):
    title: Optional[str] = None
    category: Optional[str] = None
    target_amount: Optional[float] = Field(None, gt=0)
    current_amount: Optional[float] = Field(None, ge=0)
    target_date: Optional[str] = None
    monthly_contribution: Optional[float] = None
    priority: Optional[str] = None
    status: Optional[str] = None  # in_progress, achieved, paused
    linked_investment_id: Optional[int] = None
    linked_account_id: Optional[int] = None
    notes: Optional[str] = None

# ==========================================
# Month-end Carry Forward Models
# ==========================================
class CarryoverExecuteRequest(BaseModel):
    profile_id: Optional[int] = None
    year: int
    month: int
    carry_forward_amount: Optional[float] = None  # If None, automatically use closing_balance
    notes: Optional[str] = "Month-end net balance rolled over"

# ==========================================
# Settings Models
# ==========================================
class SettingsUpdate(BaseModel):
    currency_code: Optional[str] = None
    currency_symbol: Optional[str] = None
    theme: Optional[str] = None
    active_profile_id: Optional[int] = None
    carryover_mode: Optional[str] = None

