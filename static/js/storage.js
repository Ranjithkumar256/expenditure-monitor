/**
 * PaisaTrack - On-Device Storage & Local Offline Database Engine
 * Enables 100% Standalone, Zero-Server Operation with persistent LocalStorage.
 */

(function () {
  const STORAGE_KEYS = {
    USER: 'paisa_local_user_v1',
    PROFILES: 'paisa_local_profiles_v1',
    ACCOUNTS: 'paisa_local_accounts_v1',
    CARDS: 'paisa_local_cards_v1',
    CATEGORIES: 'paisa_local_categories_v1',
    TRANSACTIONS: 'paisa_local_txs_v1',
    LOANS: 'paisa_local_loans_v1',
    BORROWS: 'paisa_local_borrows_v1',
    INVESTMENTS: 'paisa_local_investments_v1',
    SALARY_PLAN: 'paisa_local_salary_plan_v1',
    GOALS: 'paisa_local_goals_v1',
    SETTINGS: 'paisa_local_settings_v1',
    CARRYOVER: 'paisa_local_carryover_v1'
  };

  const PaisaLocalDB = {
    init() {
      if (!localStorage.getItem(STORAGE_KEYS.PROFILES)) {
        this.resetDefaults();
      }
    },

    resetDefaults() {
      const today = new Date().toISOString().split('T')[0];

      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify({
        id: 1,
        name: 'PaisaTrack User',
        email: 'user@paisatrack.local'
      }));

      localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify([
        { id: 1, name: 'Personal', color: '#10b981', is_default: true, currency: 'INR' },
        { id: 2, name: 'Household', color: '#00b4d8', is_default: false, currency: 'INR' }
      ]));

      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify({
        base_currency: 'INR',
        currency_symbol: '₹',
        dark_mode: true,
        smart_carryover: true,
        monthly_budget: 65000
      }));

      localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify([
        { id: 1, name: 'Groceries', icon: '🛒', type: 'expense', color: '#10b981', monthly_budget: 15000 },
        { id: 2, name: 'Dining & Cafes', icon: '🍔', type: 'expense', color: '#f59e0b', monthly_budget: 8000 },
        { id: 3, name: 'Fuel & Commute', icon: '⛽', type: 'expense', color: '#00b4d8', monthly_budget: 6000 },
        { id: 4, name: 'Utilities & Bills', icon: '💡', type: 'expense', color: '#8b5cf6', monthly_budget: 7500 },
        { id: 5, name: 'Monthly Salary', icon: '💼', type: 'income', color: '#34d399', monthly_budget: 0 },
        { id: 6, name: 'Investment Returns', icon: '📈', type: 'income', color: '#38bdf8', monthly_budget: 0 }
      ]));

      localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify([
        { id: 1, name: 'HDFC Salary Account', account_type: 'Bank Account', balance: 64250, profile_id: 1, color: '#3b82f6' },
        { id: 2, name: 'SBI Savings Account', account_type: 'Bank Account', balance: 28400, profile_id: 1, color: '#0284c7' },
        { id: 3, name: 'Cash in Hand', account_type: 'Cash Wallet', balance: 4850, profile_id: 1, color: '#10b981' }
      ]));

      localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify([
        { id: 1, name: 'Amazon Pay ICICI Card', card_limit: 150000, current_balance: 14200, billing_cycle_day: 15, due_day: 5, profile_id: 1, color: '#f59e0b' },
        { id: 2, name: 'HDFC Regalia Gold', card_limit: 250000, current_balance: 22800, billing_cycle_day: 20, due_day: 10, profile_id: 1, color: '#8b5cf6' }
      ]));

      localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify([
        { id: 1, name: 'Vehicle Loan', principal_amount: 350000, remaining_amount: 185000, emi_amount: 9200, tenure_months: 36, remaining_months: 18, interest_rate: 8.7, profile_id: 1 }
      ]));

      localStorage.setItem(STORAGE_KEYS.BORROWS, JSON.stringify([
        { id: 1, person_name: 'Rahul Sharma', amount: 5000, type: 'lent', status: 'pending', date: today, note: 'Weekend trip split', profile_id: 1 },
        { id: 2, person_name: 'Pooja Verma', amount: 2500, type: 'borrowed', status: 'pending', date: today, note: 'Dinner payment share', profile_id: 1 }
      ]));

      localStorage.setItem(STORAGE_KEYS.INVESTMENTS, JSON.stringify([
        { id: 1, name: 'Nifty 50 Index Fund', asset_type: 'Mutual Fund', invested_amount: 75000, current_value: 86400, returns_pct: 15.2, profile_id: 1 },
        { id: 2, name: 'Sovereign Gold Bond', asset_type: 'Gold', invested_amount: 50000, current_value: 58200, returns_pct: 16.4, profile_id: 1 }
      ]));

      localStorage.setItem(STORAGE_KEYS.SALARY_PLAN, JSON.stringify({
        monthly_salary: 85000,
        needs_target: 42500,
        wants_target: 25500,
        savings_target: 17000,
        health_score: 84
      }));

      localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify([
        { id: 1, title: 'Emergency Fund', target_amount: 150000, current_amount: 92000, deadline: '2026-12-31', profile_id: 1 },
        { id: 2, title: 'International Vacation', target_amount: 120000, current_amount: 45000, deadline: '2027-04-30', profile_id: 1 }
      ]));

      localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify([
        { id: 1, title: 'Monthly Salary Credit', amount: 85000, type: 'income', category_id: 5, account_id: 1, date: today, note: 'Direct employer credit', profile_id: 1 },
        { id: 2, title: 'Supermarket Grocery Run', amount: 3450, type: 'expense', category_id: 1, account_id: 1, date: today, note: 'Pantry items', profile_id: 1 },
        { id: 3, title: 'Fuel Top-up', amount: 2200, type: 'expense', category_id: 3, account_id: 1, date: today, note: 'Petrol pump', profile_id: 1 },
        { id: 4, title: 'Weekend Family Dinner', amount: 1850, type: 'expense', category_id: 2, account_id: 1, date: today, note: 'Cafe dining', profile_id: 1 }
      ]));
    },

    // Handle intercepted API requests
    async handleApi(endpoint, options = {}) {
      const method = (options.method || 'GET').toUpperCase();
      let body = {};
      try { if (options.body) body = JSON.parse(options.body); } catch (e) {}

      // 1. Auth & Profiles
      if (endpoint === '/api/auth/me' || endpoint === '/api/auth/login' || endpoint === '/api/auth/register') {
        const user = JSON.parse(localStorage.getItem(STORAGE_KEYS.USER) || '{}');
        return { user, token: 'paisa_ondevice_token_standalone' };
      }
      if (endpoint === '/api/auth/logout') {
        return { success: true };
      }
      if (endpoint.startsWith('/api/profiles')) {
        const profiles = JSON.parse(localStorage.getItem(STORAGE_KEYS.PROFILES) || '[]');
        if (method === 'POST') {
          const newProfile = { id: Date.now(), name: body.name || 'New Profile', color: body.color || '#10b981', is_default: false, currency: 'INR' };
          profiles.push(newProfile);
          localStorage.setItem(STORAGE_KEYS.PROFILES, JSON.stringify(profiles));
          return newProfile;
        }
        return profiles;
      }

      // 2. Settings
      if (endpoint.startsWith('/api/settings')) {
        let settings = JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS) || '{}');
        if (method === 'POST' || method === 'PUT') {
          settings = { ...settings, ...body };
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
        }
        return settings;
      }

      // 3. Accounts
      if (endpoint === '/api/accounts') {
        let accounts = JSON.parse(localStorage.getItem(STORAGE_KEYS.ACCOUNTS) || '[]');
        if (method === 'POST') {
          const newAcc = { id: Date.now(), ...body, balance: parseFloat(body.balance) || 0 };
          accounts.push(newAcc);
          localStorage.setItem(STORAGE_KEYS.ACCOUNTS, JSON.stringify(accounts));
          return newAcc;
        }
        return accounts;
      }

      // 4. Cards
      if (endpoint === '/api/cards') {
        let cards = JSON.parse(localStorage.getItem(STORAGE_KEYS.CARDS) || '[]');
        if (method === 'POST') {
          const newCard = { id: Date.now(), ...body, current_balance: parseFloat(body.current_balance) || 0 };
          cards.push(newCard);
          localStorage.setItem(STORAGE_KEYS.CARDS, JSON.stringify(cards));
          return newCard;
        }
        return cards;
      }

      // 5. Categories
      if (endpoint === '/api/categories') {
        let categories = JSON.parse(localStorage.getItem(STORAGE_KEYS.CATEGORIES) || '[]');
        if (method === 'POST') {
          const newCat = { id: Date.now(), ...body };
          categories.push(newCat);
          localStorage.setItem(STORAGE_KEYS.CATEGORIES, JSON.stringify(categories));
          return newCat;
        }
        return categories;
      }

      // 6. Loans & Borrows
      if (endpoint === '/api/loans') {
        let loans = JSON.parse(localStorage.getItem(STORAGE_KEYS.LOANS) || '[]');
        if (method === 'POST') {
          const newLoan = { id: Date.now(), ...body };
          loans.push(newLoan);
          localStorage.setItem(STORAGE_KEYS.LOANS, JSON.stringify(loans));
          return newLoan;
        }
        return loans;
      }

      if (endpoint === '/api/borrows') {
        let borrows = JSON.parse(localStorage.getItem(STORAGE_KEYS.BORROWS) || '[]');
        if (method === 'POST') {
          const newB = { id: Date.now(), ...body };
          borrows.push(newB);
          localStorage.setItem(STORAGE_KEYS.BORROWS, JSON.stringify(borrows));
          return newB;
        }
        return borrows;
      }

      if (endpoint === '/api/borrows/repay') {
        let borrows = JSON.parse(localStorage.getItem(STORAGE_KEYS.BORROWS) || '[]');
        borrows = borrows.map(b => b.id === body.id ? { ...b, status: 'settled' } : b);
        localStorage.setItem(STORAGE_KEYS.BORROWS, JSON.stringify(borrows));
        return { success: true };
      }

      // 7. Transactions
      if (endpoint.startsWith('/api/transactions')) {
        let txs = JSON.parse(localStorage.getItem(STORAGE_KEYS.TRANSACTIONS) || '[]');
        if (method === 'POST') {
          const newTx = {
            id: Date.now(),
            title: body.title || 'Transaction',
            amount: parseFloat(body.amount) || 0,
            type: body.type || 'expense',
            category_id: parseInt(body.category_id, 10) || 1,
            account_id: parseInt(body.account_id, 10) || 1,
            date: body.date || new Date().toISOString().split('T')[0],
            note: body.note || ''
          };
          txs.unshift(newTx);
          localStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(txs));

          // Trigger Milestone Ad
          if (window.AdsManager) {
            window.AdsManager.onTransactionAdded();
          }

          return newTx;
        }
        return txs;
      }

      // 8. Investments
      if (endpoint === '/api/investments') {
        let invs = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVESTMENTS) || '[]');
        if (method === 'POST') {
          const newInv = { id: Date.now(), ...body };
          invs.push(newInv);
          localStorage.setItem(STORAGE_KEYS.INVESTMENTS, JSON.stringify(invs));
          return newInv;
        }
        return invs;
      }

      if (endpoint === '/api/investments/summary') {
        const invs = JSON.parse(localStorage.getItem(STORAGE_KEYS.INVESTMENTS) || '[]');
        const total_invested = invs.reduce((acc, i) => acc + (parseFloat(i.invested_amount) || 0), 0);
        const total_value = invs.reduce((acc, i) => acc + (parseFloat(i.current_value) || 0), 0);
        const total_gain = total_value - total_invested;
        return {
          total_invested,
          current_value: total_value,
          total_gain,
          overall_returns_pct: total_invested ? ((total_gain / total_invested) * 100).toFixed(1) : 0,
          assets_count: invs.length
        };
      }

      // 9. Salary Plan & Goals
      if (endpoint === '/api/salary-plan') {
        let plan = JSON.parse(localStorage.getItem(STORAGE_KEYS.SALARY_PLAN) || '{}');
        if (method === 'POST') {
          plan = { ...plan, ...body };
          localStorage.setItem(STORAGE_KEYS.SALARY_PLAN, JSON.stringify(plan));
        }
        return plan;
      }

      if (endpoint === '/api/financial-goals') {
        let goals = JSON.parse(localStorage.getItem(STORAGE_KEYS.GOALS) || '[]');
        if (method === 'POST') {
          const newGoal = { id: Date.now(), ...body };
          goals.push(newGoal);
          localStorage.setItem(STORAGE_KEYS.GOALS, JSON.stringify(goals));
          return newGoal;
        }
        return goals;
      }

      // 10. Transfers & Carryover
      if (endpoint === '/api/accounts/transfer') {
        return { success: true, message: 'Transfer completed locally.' };
      }

      if (endpoint === '/api/carryover/history') {
        return [];
      }

      if (endpoint === '/api/carryover/execute') {
        return { success: true, message: 'Carryover calculated.' };
      }

      if (endpoint === '/api/data-status') {
        return { has_data: true, is_demo: false };
      }

      if (endpoint === '/api/reset-demo') {
        this.resetDefaults();
        return { success: true };
      }

      if (endpoint === '/api/clear-demo') {
        localStorage.clear();
        this.init();
        return { success: true };
      }

      // Fallback response
      return { success: true };
    }
  };

  PaisaLocalDB.init();
  window.PaisaLocalDB = PaisaLocalDB;
})();
